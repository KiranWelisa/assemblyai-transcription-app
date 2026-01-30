import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/db';

// Start a new transcription
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { audioUrl, fileName, driveFileId } = await request.json();

	if (!audioUrl || !fileName) {
		throw error(400, 'Missing audioUrl or fileName');
	}

	const db = createDb(platform!.env.DB);

	// Submit to AssemblyAI
	const assemblyRes = await fetch('https://api.assemblyai.com/v2/transcript', {
		method: 'POST',
		headers: {
			Authorization: platform!.env.ASSEMBLYAI_API_KEY,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			audio_url: audioUrl,
			speaker_labels: true,
			language_detection: true,
			webhook_url: `${new URL(request.url).origin}/api/webhooks/assemblyai`,
			webhook_auth_header_name: 'X-Webhook-Secret',
			webhook_auth_header_value: platform!.env.AUTH_SECRET
		})
	});

	if (!assemblyRes.ok) {
		const errorData = await assemblyRes.json();
		throw error(500, `AssemblyAI error: ${errorData.error || 'Unknown error'}`);
	}

	const assemblyData = await assemblyRes.json();

	// Save to database
	const transcription = await db.transcriptions.create({
		assemblyAiId: assemblyData.id,
		userEmail: locals.user.email,
		fileName
	});

	return json({
		id: transcription.id,
		assemblyAiId: assemblyData.id,
		status: 'processing'
	});
};

// Get all transcriptions for user
export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = createDb(platform!.env.DB);
	const transcriptions = await db.transcriptions.findMany(locals.user.email);

	return json({ transcriptions });
};
