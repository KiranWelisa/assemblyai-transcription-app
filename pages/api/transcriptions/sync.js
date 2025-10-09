// pages/api/transcriptions/sync.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { generateTitle, generateFallbackTitle } from '../../../lib/gemini';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { assemblyAiApiKey } = req.body;

  if (!assemblyAiApiKey) {
    return res.status(400).json({ error: 'AssemblyAI API key is required' });
  }

  const userEmail = token.user.email;

  try {
    console.log('Starting sync for user:', userEmail);

    // Fetch all transcriptions from AssemblyAI
    const response = await fetch('https://api.assemblyai.com/v2/transcript?limit=100&status=completed', {
      headers: { 'Authorization': assemblyAiApiKey }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch transcriptions from AssemblyAI');
    }

    const data = await response.json();
    const assemblyTranscripts = data.transcripts || [];

    console.log(`Found ${assemblyTranscripts.length} transcripts from AssemblyAI`);

    const results = {
      total: assemblyTranscripts.length,
      imported: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Process each transcript
    for (const transcript of assemblyTranscripts) {
      try {
        // Check if already exists in database
        const existing = await prisma.transcription.findUnique({
          where: { assemblyAiId: transcript.id }
        });

        if (existing) {
          results.skipped++;
          results.details.push({
            id: transcript.id,
            status: 'skipped',
            reason: 'Already in database'
          });
          continue;
        }

        // Create database entry
        const transcription = await prisma.transcription.create({
          data: {
            assemblyAiId: transcript.id,
            userEmail,
            fileName: null, // Not available from API
            language: transcript.language_code,
            duration: transcript.audio_duration,
            wordCount: transcript.words?.length || 0,
            title: null,
            titleGenerating: true,
          },
        });

        results.imported++;
        results.details.push({
          id: transcript.id,
          status: 'imported',
          dbId: transcription.id
        });

        // Start async title generation (don't wait for it)
        generateTitleAsync(transcription.id, transcript, userEmail);

      } catch (error) {
        console.error(`Error processing transcript ${transcript.id}:`, error);
        results.errors++;
        results.details.push({
          id: transcript.id,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log('Sync completed:', results);

    return res.status(200).json({
      success: true,
      message: `Synced ${results.imported} new transcriptions`,
      results
    });

  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ 
      error: 'Failed to sync transcriptions',
      details: error.message 
    });
  }
}

// Generate title asynchronously (fire and forget)
async function generateTitleAsync(transcriptionId, transcript, userEmail) {
  try {
    // Wait a bit to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get full transcript with words
    const fullTranscript = await fetch(`https://api.assemblyai.com/v2/transcript/${transcript.id}`, {
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY }
    }).then(r => r.json());

    let title = await generateTitle(fullTranscript);
    
    if (!title) {
      title = generateFallbackTitle(
        null,
        fullTranscript.language_code,
        fullTranscript.audio_duration
      );
    }

    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        title,
        titleGenerating: false,
      },
    });

    console.log(`Generated title for ${transcriptionId}: ${title}`);
  } catch (error) {
    console.error(`Failed to generate title for ${transcriptionId}:`, error);
    
    // Mark as failed
    try {
      await prisma.transcription.update({
        where: { id: transcriptionId },
        data: { titleGenerating: false },
      });
    } catch (e) {
      console.error('Failed to update titleGenerating flag:', e);
    }
  }
}
