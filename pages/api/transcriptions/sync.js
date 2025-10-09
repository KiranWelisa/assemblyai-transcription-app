// pages/api/transcriptions/sync.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { generateTitle, generateFallbackTitle } from '../../../lib/gemini-queue';
import { generatePreview } from '../../../lib/transcript-utils';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { assemblyAiKey } = req.body;

  if (!assemblyAiKey) {
    return res.status(400).json({ error: 'AssemblyAI API key is required' });
  }

  const userEmail = token.user.email;

  try {
    // Fetch all completed transcripts from AssemblyAI
    const response = await fetch('https://api.assemblyai.com/v2/transcript?limit=100&status=completed', {
      headers: { 'Authorization': assemblyAiKey }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch transcripts from AssemblyAI');
    }

    const data = await response.json();
    const transcripts = data.transcripts || [];

    console.log(`📥 Found ${transcripts.length} completed transcripts from AssemblyAI`);

    let syncedCount = 0;
    let skippedCount = 0;
    const newTranscriptions = [];

    // Check which transcripts are new
    for (const transcript of transcripts) {
      const existing = await prisma.transcription.findUnique({
        where: { assemblyAiId: transcript.id }
      });

      if (!existing) {
        // Fetch full transcript to get utterances for preview
        const fullTranscriptResponse = await fetch(
          `https://api.assemblyai.com/v2/transcript/${transcript.id}`,
          { headers: { 'Authorization': assemblyAiKey } }
        );

        let preview = null;
        if (fullTranscriptResponse.ok) {
          const fullTranscript = await fullTranscriptResponse.json();
          preview = generatePreview(fullTranscript);
        }

        // Get AssemblyAI created date
        const assemblyCreatedAt = transcript.created ? new Date(transcript.created) : null;

        // Create new transcription entry with preview
        const transcription = await prisma.transcription.create({
          data: {
            assemblyAiId: transcript.id,
            userEmail,
            fileName: null,
            language: transcript.language_code,
            duration: transcript.audio_duration,
            wordCount: transcript.words?.length || 0,
            preview,
            assemblyCreatedAt,
            title: null,
            titleGenerating: true,
          },
        });

        newTranscriptions.push({ transcription, transcript });
        syncedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(`✅ Synced ${syncedCount} new transcripts, skipped ${skippedCount} existing`);

    // Generate titles in background with rate limiting (don't wait for completion)
    if (newTranscriptions.length > 0) {
      console.log(`🎯 Queuing ${newTranscriptions.length} title generation tasks (rate limited to 15/min)`);
      
      // Queue all title generation tasks - the queue will handle rate limiting
      Promise.all(
        newTranscriptions.map(async ({ transcription, transcript }) => {
          try {
            const fullTranscriptResponse = await fetch(
              `https://api.assemblyai.com/v2/transcript/${transcript.id}`,
              { headers: { 'Authorization': assemblyAiKey } }
            );

            if (fullTranscriptResponse.ok) {
              const fullTranscript = await fullTranscriptResponse.json();
              
              // This will be queued and rate-limited automatically
              let title = await generateTitle(fullTranscript);
              
              if (!title) {
                title = generateFallbackTitle(
                  transcription.fileName,
                  transcription.language,
                  transcription.duration
                );
              }

              await prisma.transcription.update({
                where: { id: transcription.id },
                data: { title, titleGenerating: false },
              });

              console.log(`✅ Title generated: "${title}"`);
            }
          } catch (error) {
            console.error(`❌ Failed to generate title for ${transcription.id}:`, error);
            await prisma.transcription.update({
              where: { id: transcription.id },
              data: { titleGenerating: false },
            });
          }
        })
      ).catch(console.error);
    }

    return res.status(200).json({
      success: true,
      synced: syncedCount,
      skipped: skippedCount,
      total: transcripts.length,
      message: syncedCount > 0 ? 'Titles will be generated in the background (rate limited)' : null,
    });

  } catch (error) {
    console.error('Error syncing transcriptions:', error);
    return res.status(500).json({ 
      error: 'Failed to sync transcriptions',
      details: error.message 
    });
  }
}
