// pages/api/transcriptions/process-titles.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { queueTitleGeneration } from '../../../lib/gemini-queue';

/**
 * Endpoint om titels te genereren voor transcripties zonder titel.
 * 
 * VERCEL HOBBY PLAN COMPATIBLE:
 * - Verwerkt slechts 2-3 items per call
 * - Blijft ruim binnen 10 seconden timeout
 * - Frontend roept dit meerdere keren aan voor batch processing
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { assemblyAiKey, batchSize = 2 } = req.body;

  if (!assemblyAiKey) {
    return res.status(400).json({ error: 'AssemblyAI API key is required' });
  }

  const userEmail = token.user.email;

  try {
    // Haal alleen een kleine batch op
    const untitledTranscriptions = await prisma.transcription.findMany({
      where: {
        userEmail,
        titleGenerating: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: batchSize, // Slechts 2-3 items per keer
      select: {
        id: true,
        assemblyAiId: true,
        fileName: true,
        language: true,
        duration: true,
      },
    });

    if (untitledTranscriptions.length === 0) {
      return res.status(200).json({
        success: true,
        processed: 0,
        remaining: 0,
        hasMore: false,
        message: 'All titles processed',
      });
    }

    console.log(`📋 Processing ${untitledTranscriptions.length} transcriptions in this batch`);

    let processed = 0;

    // Verwerk items SYNCHROON (binnen de request)
    for (const transcription of untitledTranscriptions) {
      try {
        // Fetch full transcript van AssemblyAI
        const response = await fetch(
          `https://api.assemblyai.com/v2/transcript/${transcription.assemblyAiId}`,
          { 
            headers: { 
              'Authorization': assemblyAiKey,
              'Content-Type': 'application/json'
            } 
          }
        );

        if (!response.ok) {
          console.error(`❌ Failed to fetch transcript ${transcription.assemblyAiId}: ${response.status}`);
          
          // Mark als failed zodat het niet steeds opnieuw geprobeerd wordt
          await prisma.transcription.update({
            where: { id: transcription.id },
            data: { titleGenerating: false },
          });
          continue;
        }

        const fullTranscript = await response.json();
        
        // Queue title generation (deze is async maar we wachten niet)
        // Het wordt in de achtergrond verwerkt door de queue
        queueTitleGeneration(transcription.id, fullTranscript, prisma);
        
        processed++;
        console.log(`✅ Queued title generation for ${transcription.id}`);

      } catch (error) {
        console.error(`❌ Error processing transcription ${transcription.id}:`, error);
        
        // Mark als failed
        try {
          await prisma.transcription.update({
            where: { id: transcription.id },
            data: { titleGenerating: false },
          });
        } catch (dbError) {
          console.error('Failed to mark as failed:', dbError);
        }
      }
    }

    // Check hoeveel items er nog over zijn
    const remainingCount = await prisma.transcription.count({
      where: {
        userEmail,
        titleGenerating: true,
      },
    });

    const hasMore = remainingCount > 0;

    console.log(`✅ Batch complete: ${processed} processed, ${remainingCount} remaining`);

    return res.status(200).json({
      success: true,
      processed,
      remaining: remainingCount,
      hasMore,
      message: hasMore 
        ? `Processed ${processed} items, ${remainingCount} remaining` 
        : `All ${processed} items processed`,
    });

  } catch (error) {
    console.error('❌ Error in process-titles endpoint:', error);
    return res.status(500).json({ 
      error: 'Failed to process titles',
      details: error.message 
    });
  }
}

// Vercel configuration
export const config = {
  maxDuration: 10, // Hobby plan limiet
};
