// pages/api/transcriptions/purge-and-resync.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { generateTitle, generateFallbackTitle } from '../../../lib/gemini-queue';
import { generatePreview } from '../../../lib/transcript-utils';
import { waitUntil } from '@vercel/functions';

/**
 * Sleep helper for rate limiting
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch all transcripts from AssemblyAI with pagination
 */
async function fetchAllTranscripts(assemblyAiKey) {
  let allTranscripts = [];
  let url = 'https://api.assemblyai.com/v2/transcript?limit=100&status=completed';
  
  while (url) {
    const response = await fetch(url, {
      headers: { 'Authorization': assemblyAiKey }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transcripts: ${response.status}`);
    }

    const data = await response.json();
    const transcripts = data.transcripts || [];
    
    allTranscripts = allTranscripts.concat(transcripts);
    
    // Use the next_url directly from the API response
    url = data.page_details?.next_url;
    
    // Rate limiting: wait 500ms between pagination requests
    if (url) {
      await sleep(500);
    }
  }
  
  return allTranscripts;
}

/**
 * Fetch full transcript details with rate limiting
 */
async function fetchTranscriptDetails(transcriptId, assemblyAiKey) {
  // Rate limiting: 50 requests per minute for AssemblyAI
  await sleep(1200); // 1.2 seconds between requests = max 50/min
  
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

/**
 * Background function that handles the entire purge and re-sync process
 * This runs independently after the API response is sent
 */
async function runPurgeAndResyncInBackground(userEmail, assemblyAiKey) {
  try {
    console.log(`🗑️ Starting purge and re-sync for user: ${userEmail}`);
    
    // ==========================================
    // PHASE 1: PURGE
    // ==========================================
    console.log('📋 Phase 1: Purging existing transcriptions...');
    const deleteResult = await prisma.transcription.deleteMany({
      where: { userEmail }
    });
    console.log(`✅ Deleted ${deleteResult.count} existing transcriptions`);

    // ==========================================
    // PHASE 2: FETCH ALL TRANSCRIPTS
    // ==========================================
    console.log('📥 Phase 2: Fetching all transcripts from AssemblyAI...');
    const transcriptsList = await fetchAllTranscripts(assemblyAiKey);
    console.log(`✅ Found ${transcriptsList.length} completed transcripts`);

    if (transcriptsList.length === 0) {
      console.log('No transcripts found in AssemblyAI. Process finished.');
      return;
    }

    // ==========================================
    // PHASE 3 & 4: SYNC TRANSCRIPTS AND GENERATE TITLES
    // Combined for efficiency, generate titles immediately after creating records
    // ==========================================
    console.log('🔄 Phase 3: Syncing transcripts and queueing title generation...');
    
    for (let i = 0; i < transcriptsList.length; i++) {
      const transcriptSummary = transcriptsList[i];
      console.log(`📝 Syncing ${i + 1}/${transcriptsList.length}: ${transcriptSummary.id}`);

      try {
        const fullTranscript = await fetchTranscriptDetails(transcriptSummary.id, assemblyAiKey);
        if (!fullTranscript) {
          console.warn(`⚠️ Skipping ${transcriptSummary.id}: Failed to fetch details`);
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
            assemblyCreatedAt,
            title: null,
            titleGenerating: true,
          },
        });

        // Queue title generation immediately after creating the record
        generateTitle(fullTranscript).then(async (title) => {
          if (!title) {
            title = generateFallbackTitle(transcription.fileName, transcription.language, transcription.duration);
          }
          await prisma.transcription.update({
            where: { id: transcription.id },
            data: { title, titleGenerating: false },
          });
          console.log(`✅ Title generated for ${transcription.id}: "${title}"`);
        }).catch(async (error) => {
          console.error(`❌ Failed to generate title for ${transcription.id}:`, error);
          await prisma.transcription.update({
            where: { id: transcription.id },
            data: { titleGenerating: false },
          });
        });

      } catch (error) {
        console.error(`❌ Error syncing ${transcriptSummary.id}:`, error.message);
      }
    }
    
    console.log(`🎉 Purge and re-sync process complete!`);

  } catch (error) {
    console.error('❌ Error during purge and re-sync background process:', error);
  }
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

  // *** CRITICAL FIX: Use waitUntil() to ensure background task completes ***
  // This tells Vercel to keep the serverless function alive until the promise resolves
  waitUntil(runPurgeAndResyncInBackground(userEmail, assemblyAiKey));

  // Return an immediate success response to the client
  // 202 Accepted indicates the request has been accepted for processing
  return res.status(202).json({ 
    success: true,
    message: 'Purge and re-sync process has been started in the background. Your transcriptions will appear as they are processed.',
  });
}
