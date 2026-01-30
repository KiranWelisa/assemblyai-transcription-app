import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/db';

export const POST: RequestHandler = async ({ request, platform }) => {
	// Verify webhook secret
	const webhookSecret = request.headers.get('X-Webhook-Secret');
	if (webhookSecret !== platform!.env.AUTH_SECRET) {
		throw error(401, 'Invalid webhook secret');
	}

	const payload = await request.json();
	const { transcript_id, status, text, utterances, audio_duration, language_code } = payload;

	console.log(`Webhook received for ${transcript_id}: ${status}`);

	const db = createDb(platform!.env.DB);

	if (status === 'completed') {
		// Update transcription with results
		const preview = text?.substring(0, 500) || '';
		const wordCount = text?.split(/\s+/).length || 0;

		await db.transcriptions.updateCompleted(transcript_id, {
			fullText: text || '',
			preview,
			wordCount,
			duration: audio_duration || 0,
			language: language_code || 'unknown',
			utterances: utterances || []
		});

		// Get the transcription to find user email for SSE notification
		const transcription = await db.transcriptions.findByAssemblyId(transcript_id);

		if (transcription) {
			// Queue title generation with Gemini
			await queueTitleGeneration(platform!, transcription.id, text, transcription.userEmail);
		}

		console.log(`Transcription ${transcript_id} completed successfully`);
	} else if (status === 'error') {
		await db.transcriptions.updateError(transcript_id);
		console.error(`Transcription ${transcript_id} failed`);
	}

	return json({ received: true });
};

async function queueTitleGeneration(
	platform: App.Platform,
	transcriptionId: string,
	text: string,
	userEmail: string
) {
	try {
		// Use first 3000 chars for title generation
		const sampleText = text.substring(0, 3000);

		const prompt = `Analyze this transcription and generate a smart title.

INSTRUCTIONS:
1. Identify the MAIN TOPIC
2. Extract COMPANY NAMES mentioned
3. Extract PERSON NAMES discussed or speaking
4. Determine the content TYPE (meeting, interview, presentation, call)

RESPONSE FORMAT (JSON only):
{
  "title": "Short descriptive title (max 60 chars)",
  "companyNames": ["Company1", "Company2"],
  "personNames": ["Name1", "Name2"],
  "meetingType": "meeting|interview|presentation|call|other"
}

TRANSCRIPTION:
${sampleText}

Respond with ONLY valid JSON.`;

		const geminiRes = await fetch(
			`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${platform.env.GEMINI_API_KEY}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: {
						temperature: 0.3,
						maxOutputTokens: 500
					}
				})
			}
		);

		if (!geminiRes.ok) {
			console.error('Gemini API error:', await geminiRes.text());
			return;
		}

		const geminiData = await geminiRes.json();
		const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

		// Parse JSON from response (handle markdown code blocks)
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			console.error('No JSON found in Gemini response');
			return;
		}

		const parsed = JSON.parse(jsonMatch[0]);

		// Update transcription with generated metadata
		const db = createDb(platform.env.DB);
		await db.transcriptions.updateTitle(transcriptionId, {
			title: parsed.title || 'Untitled Transcription',
			companyNames: parsed.companyNames || [],
			personNames: parsed.personNames || [],
			meetingType: parsed.meetingType || null
		});

		console.log(`Title generated for ${transcriptionId}: ${parsed.title}`);
	} catch (err) {
		console.error('Title generation error:', err);
	}
}
