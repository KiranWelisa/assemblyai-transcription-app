// pages/api/transcriptions/sync.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { generateTitle, generateFallbackTitle } from '../../../lib/gemini-queue';
import { generatePreview } from '../../../lib/transcript-utils';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchTranscriptDetails(transcriptId, assemblyAiKey) {
  // Add a small delay to respect rate limits if syncing many new items
  await sleep(1200); 
  
  const response = await fetch(
    `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
    { headers: { 'Authorization': assemblyAiKey } }
  );

  if (!response.ok) {
    console.error(`Failed to fetch transcript ${transcriptId}: ${response.status}`);
    return null;
  }
  return await response.json();
}

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

    for (const transcriptSummary of transcripts) {
      const existing = await prisma.transcription.findUnique({
        where: { assemblyAiId: transcriptSummary.id }
      });

      if (!existing) {
        // *** FIX: Fetch full transcript details to get the 'created' date and utterances ***
        const fullTranscript = await fetchTranscriptDetails(transcriptSummary.id, assemblyAiKey);

        if (!fullTranscript) {
          console.warn(`⚠️  Skipping ${transcriptSummary.id}: Failed to fetch details`);
          continue;
        }

        const preview = generatePreview(fullTranscript);
        const assemblyCreatedAt = fullTranscript.created ? new Date(fullTranscript.created) : null;

        const transcription = await prisma.transcription.create({
          data: {
            assemblyAiId: fullTranscript.id,
            userEmail,
            fileName: null,
            language: fullTranscript.language_code,
            duration: fullTranscript.audio_duration,
            wordCount: fullTranscript.words?.length || 0,
            preview,
            assemblyCreatedAt, // Now this will have the correct date
            title: null,
            titleGenerating: true,
          },
        });

        newTranscriptions.push({ transcription, fullTranscript });
        syncedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(`✅ Synced ${syncedCount} new transcripts, skipped ${skippedCount} existing`);

    // Title generation remains the same, running in the background
    if (newTranscriptions.length > 0) {
      console.log(`🎯 Queuing ${newTranscriptions.length} title generation tasks`);
      
      Promise.all(
        newTranscriptions.map(async ({ transcription, fullTranscript }) => {
          try {
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
      message: syncedCount > 0 ? 'Titles will be generated in the background.' : 'No new transcripts to sync.',
    });

  } catch (error) {
    console.error('Error syncing transcriptions:', error);
    return res.status(500).json({ 
      error: 'Failed to sync transcriptions',
      details: error.message 
    });
  }
}
