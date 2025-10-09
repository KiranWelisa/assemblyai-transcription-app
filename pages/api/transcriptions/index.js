// pages/api/transcriptions/index.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { generatePreview } from '../../../lib/transcript-utils';
import { queueTitleGeneration, isQueueEmpty } from '../../../lib/gemini-queue';
import { waitUntil } from '@vercel/functions';

export default async function handler(req, res) {
  // Add CORS headers for debugging
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token || !token.user?.email) {
      console.error('Unauthorized: No token or email found');
      return res.status(401).json({ error: 'Unauthorized', details: 'No valid session' });
    }

    const userEmail = token.user.email;
    console.log('Fetching transcriptions for:', userEmail);

    if (req.method === 'GET') {
      try {
        const transcriptions = await prisma.transcription.findMany({
          where: { userEmail },
          orderBy: { assemblyCreatedAt: 'desc' },
          take: 50,
        });

        console.log('Found transcriptions:', transcriptions.length);
        
        // Check if there are transcriptions without titles and queue is empty
        const untitledTranscriptions = transcriptions.filter(t => t.titleGenerating === true);
        
        if (untitledTranscriptions.length > 0 && isQueueEmpty()) {
          console.log(`🔄 Found ${untitledTranscriptions.length} transcriptions without titles. Starting background title generation...`);
          
          // Use waitUntil to process titles in the background without blocking the response
          waitUntil(
            (async () => {
              for (const transcription of untitledTranscriptions) {
                try {
                  // Fetch full transcript from AssemblyAI
                  const apiKey = req.headers['x-assemblyai-key'] || process.env.ASSEMBLYAI_API_KEY;
                  
                  if (!apiKey) {
                    console.warn(`⚠️ No AssemblyAI key available for ${transcription.id}, skipping`);
                    continue;
                  }

                  const response = await fetch(
                    `https://api.assemblyai.com/v2/transcript/${transcription.assemblyAiId}`,
                    { 
                      headers: { 
                        'Authorization': apiKey,
                        'Content-Type': 'application/json'
                      } 
                    }
                  );

                  if (!response.ok) {
                    console.error(`Failed to fetch transcript for ${transcription.id}: ${response.status}`);
                    continue;
                  }

                  const fullTranscript = await response.json();
                  
                  // Queue title generation (non-blocking)
                  await queueTitleGeneration(transcription.id, fullTranscript, prisma);
                  
                } catch (error) {
                  console.error(`Error processing transcription ${transcription.id}:`, error);
                }
              }
            })()
          );
        }
        
        return res.status(200).json({ transcriptions });
      } catch (error) {
        console.error('Database error:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch transcriptions',
          details: error.message,
          code: error.code 
        });
      }
    }

    if (req.method === 'POST') {
      const { assemblyAiId, fileName, language, duration, wordCount, transcript } = req.body;

      if (!assemblyAiId) {
        return res.status(400).json({ error: 'assemblyAiId is required' });
      }

      try {
        // Generate preview from transcript if provided
        let preview = null;
        if (transcript) {
          preview = generatePreview(transcript);
        }

        // Get AssemblyAI created date if available
        const assemblyCreatedAt = transcript?.created ? new Date(transcript.created) : null;

        const transcription = await prisma.transcription.create({
          data: {
            assemblyAiId,
            userEmail,
            fileName,
            language,
            duration,
            wordCount,
            preview,
            assemblyCreatedAt,
            title: null,
            titleGenerating: true,
          },
        });

        console.log('Created transcription:', transcription.id);
        return res.status(201).json({ transcription });
      } catch (error) {
        console.error('Error creating transcription:', error);
        
        if (error.code === 'P2002') {
          return res.status(409).json({ error: 'Transcription already exists' });
        }
        
        return res.status(500).json({ 
          error: 'Failed to create transcription',
          details: error.message 
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
