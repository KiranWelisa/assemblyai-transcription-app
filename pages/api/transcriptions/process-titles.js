// pages/api/transcriptions/process-titles.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { queueTitleGeneration } from '../../../lib/gemini-queue';
import { waitUntil } from '@vercel/functions';

/**
 * Endpoint om achtergrond title generation te triggeren voor transcripties zonder titel.
 * Deze endpoint reageert snel (<1s) en gebruikt waitUntil voor background processing.
 * 
 * VERCEL HOBBY PLAN COMPATIBLE:
 * - Response binnen 1 seconde
 * - Background processing via waitUntil (blijft draaien na response)
 * - Batch processing om rate limits te respecteren
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { assemblyAiKey, maxItems = 10 } = req.body;

  if (!assemblyAiKey) {
    return res.status(400).json({ error: 'AssemblyAI API key is required' });
  }

  const userEmail = token.user.email;

  try {
    // STAP 1: Snel alle transcripties zonder titel ophalen (binnen 1 seconde)
    const untitledTranscriptions = await prisma.transcription.findMany({
      where: {
        userEmail,
        titleGenerating: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: maxItems, // Limiteer tot X items om queue niet te overbelasten
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
        message: 'No pending titles to process',
        queued: 0,
      });
    }

    console.log(`📋 Found ${untitledTranscriptions.length} transcriptions without titles`);

    // STAP 2: Respond immediately to client (binnen 1 seconde)
    res.status(200).json({
      success: true,
      message: `Queued ${untitledTranscriptions.length} titles for generation`,
      queued: untitledTranscriptions.length,
    });

    // STAP 3: Start background processing via waitUntil
    // Dit blijft draaien na de response en is niet gebonden aan de 10s timeout
    waitUntil(
      (async () => {
        console.log(`🚀 Starting background title generation for ${untitledTranscriptions.length} items`);

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
            
            // Queue title generation (met rate limiting ingebouwd)
            await queueTitleGeneration(transcription.id, fullTranscript, prisma);
            
            console.log(`✅ Queued title generation for ${transcription.id}`);

            // Kleine delay tussen items om API niet te overbelasten
            await new Promise(resolve => setTimeout(resolve, 500));

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

        console.log(`🎉 Background title generation complete for ${untitledTranscriptions.length} items`);
      })()
    );

  } catch (error) {
    console.error('❌ Error in process-titles endpoint:', error);
    
    // Als we hier komen voordat de response verstuurd is
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Failed to process titles',
        details: error.message 
      });
    }
  }
}

// Vercel configuration: zorg dat deze function snel genoeg is
export const config = {
  maxDuration: 10, // Hobby plan limiet
};
