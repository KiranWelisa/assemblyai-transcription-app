// pages/api/transcriptions/purge-and-resync.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { generateTitle, generateFallbackTitle } from '../../../lib/gemini-queue';
import { generatePreview } from '../../../lib/transcript-utils';

/**
 * Sleep helper for rate limiting
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch all transcripts from AssemblyAI with pagination
 */
async function fetchAllTranscripts(assemblyAiKey) {
  let allTranscripts = [];
  let hasMore = true;
  let beforeId = null;
  
  while (hasMore) {
    const url = beforeId 
      ? `https://api.assemblyai.com/v2/transcript?limit=100&status=completed&before_id=${beforeId}`
      : `https://api.assemblyai.com/v2/transcript?limit=100&status=completed`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': assemblyAiKey }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transcripts: ${response.status}`);
    }

    const data = await response.json();
    const transcripts = data.transcripts || [];
    
    allTranscripts = allTranscripts.concat(transcripts);
    
    // Check if there are more pages
    if (data.page_details?.next_url) {
      // Extract the before_id from the next_url
      const nextUrl = new URL(data.page_details.next_url);
      beforeId = nextUrl.searchParams.get('before_id');
    } else {
      hasMore = false;
    }
    
    // Rate limiting: wait 500ms between pagination requests
    if (hasMore) {
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
    console.log(`🗑️  Starting purge and re-sync for user: ${userEmail}`);
    
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
      return res.status(200).json({
        success: true,
        purged: deleteResult.count,
        synced: 0,
        total: 0,
        message: 'No transcripts found in AssemblyAI',
      });
    }

    // ==========================================
    // PHASE 3: SYNC TRANSCRIPTS
    // ==========================================
    console.log('🔄 Phase 3: Syncing transcripts with full details...');
    const syncedTranscriptions = [];
    let syncedCount = 0;

    for (let i = 0; i < transcriptsList.length; i++) {
      const transcript = transcriptsList[i];
      
      console.log(`📝 Syncing ${i + 1}/${transcriptsList.length}: ${transcript.id}`);

      try {
        // Fetch full transcript details (with rate limiting)
        const fullTranscript = await fetchTranscriptDetails(transcript.id, assemblyAiKey);
        
        if (!fullTranscript) {
          console.warn(`⚠️  Skipping ${transcript.id}: Failed to fetch details`);
          continue;
        }

        // Generate preview from utterances
        const preview = generatePreview(fullTranscript);

        // Get AssemblyAI created date
        const assemblyCreatedAt = fullTranscript.created 
          ? new Date(fullTranscript.created) 
          : null;

        // Create transcription entry
        const transcription = await prisma.transcription.create({
          data: {
            assemblyAiId: fullTranscript.id,
            userEmail,
            fileName: null, // We don't have filename from sync
            language: fullTranscript.language_code,
            duration: fullTranscript.audio_duration,
            wordCount: fullTranscript.words?.length || 0,
            preview,
            assemblyCreatedAt,
            title: null,
            titleGenerating: true,
          },
        });

        syncedTranscriptions.push({ transcription, fullTranscript });
        syncedCount++;

        console.log(`✅ Synced ${syncedCount}/${transcriptsList.length}`);

      } catch (error) {
        console.error(`❌ Error syncing ${transcript.id}:`, error.message);
        // Continue with next transcript
      }
    }

    console.log(`✅ Phase 3 complete: Synced ${syncedCount} transcriptions`);

    // ==========================================
    // PHASE 4: QUEUE TITLE GENERATION
    // ==========================================
    console.log('🤖 Phase 4: Queueing title generation (rate-limited)...');
    
    // Queue all title generation tasks in background
    // The gemini-queue will handle rate limiting (15 requests/min)
    Promise.all(
      syncedTranscriptions.map(async ({ transcription, fullTranscript }) => {
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

          console.log(`✅ Title generated: "${title}"`);
        } catch (error) {
          console.error(`❌ Failed to generate title for ${transcription.id}:`, error);
          await prisma.transcription.update({
            where: { id: transcription.id },
            data: { titleGenerating: false },
          });
        }
      })
    ).catch(console.error);

    console.log(`🎉 Purge and re-sync complete!`);

    return res.status(200).json({
      success: true,
      purged: deleteResult.count,
      synced: syncedCount,
      total: transcriptsList.length,
      message: `Successfully purged ${deleteResult.count} and synced ${syncedCount} transcriptions. Titles are being generated in the background.`,
    });

  } catch (error) {
    console.error('❌ Error during purge and re-sync:', error);
    return res.status(500).json({ 
      error: 'Failed to purge and re-sync',
      details: error.message 
    });
  }
}
