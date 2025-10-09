// pages/api/transcriptions/enrich-batch.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { queueTitleGeneration } from '../../../lib/gemini-queue';
import { generatePreview } from '../../../lib/transcript-utils';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch full transcript details met rate limiting
 */
async function fetchTranscriptDetails(transcriptId, assemblyAiKey) {
  await sleep(1200); // 1.2 seconden rate limiting
  
  const response = await fetch(
    `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
    { 
      headers: { 
        'Authorization': assemblyAiKey,
        'Content-Type': 'application/json'
      } 
    }
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

  const { assemblyAiKey, transcriptIds } = req.body;

  if (!assemblyAiKey || !Array.isArray(transcriptIds)) {
    return res.status(400).json({ 
      error: 'assemblyAiKey and transcriptIds array are required' 
    });
  }

  // Limiteer tot max 3 items per batch (veilig binnen 10s timeout)
  const batchIds = transcriptIds.slice(0, 3);
  const userEmail = token.user.email;

  console.log(`🔄 Enriching batch: ${batchIds.length} transcripts`);

  const results = [];

  try {
    for (const transcriptId of batchIds) {
      try {
        // Fetch full transcript
        const fullTranscript = await fetchTranscriptDetails(transcriptId, assemblyAiKey);
        
        if (!fullTranscript) {
          results.push({ 
            id: transcriptId, 
            success: false, 
            error: 'Failed to fetch transcript' 
          });
          
          // Mark als failed zodat het niet blijft hangen op "Loading..."
          await prisma.transcription.update({
            where: { assemblyAiId: transcriptId },
            data: { 
              title: 'Failed to load',
              titleGenerating: false,
              preview: 'Could not load transcript data',
            },
          });
          
          continue;
        }

        // Generate preview
        const preview = generatePreview(fullTranscript);

        // Update database met volledige metadata
        const updated = await prisma.transcription.update({
          where: { assemblyAiId: transcriptId },
          data: {
            language: fullTranscript.language_code,
            duration: fullTranscript.audio_duration,
            wordCount: fullTranscript.words?.length || 0,
            preview,
            // Title blijft "Loading..." totdat Gemini queue het verwerkt
          },
        });

        // Queue title generation (non-blocking, gebeurt in achtergrond)
        queueTitleGeneration(updated.id, fullTranscript, prisma);

        results.push({ 
          id: transcriptId, 
          success: true,
          transcription: updated,
        });

        console.log(`✅ Enriched ${transcriptId}`);

      } catch (error) {
        console.error(`❌ Error enriching ${transcriptId}:`, error);
        results.push({ 
          id: transcriptId, 
          success: false, 
          error: error.message 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    console.log(`✅ Batch complete: ${successCount}/${batchIds.length} successful`);

    return res.status(200).json({
      success: true,
      processed: batchIds.length,
      successful: successCount,
      results,
    });

  } catch (error) {
    console.error('❌ Error in enrich-batch:', error);
    return res.status(500).json({ 
      error: 'Failed to enrich batch',
      details: error.message 
    });
  }
}
