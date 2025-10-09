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
 * Fetch transcript IDs from AssemblyAI (light fetch, no full details)
 */
async function fetchAllTranscriptIds(assemblyAiKey) {
  let allIds = [];
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
    
    // Only collect IDs for this light fetch
    allIds = allIds.concat(transcripts.map(t => t.id));
    
    url = data.page_details?.next_url;
    
    if (url) {
      await sleep(300); // Lighter rate limiting for ID-only fetches
    }
  }
  
  return allIds;
}

/**
 * Fetch full transcript details with rate limiting
 */
async function fetchTranscriptDetails(transcriptId, assemblyAiKey) {
  await sleep(1200); // 1.2 seconds between requests
  
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
 * Batch processing endpoint for Vercel Hobby plan (10s timeout limit)
 * Processes transcriptions in small batches to stay within timeout
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { assemblyAiKey, batch = 0, batchSize = 5 } = req.body;

  if (!assemblyAiKey) {
    return res.status(400).json({ error: 'AssemblyAI API key is required' });
  }

  const userEmail = token.user.email;

  try {
    // ==========================================
    // BATCH 0: PURGE DATABASE & GET TOTAL COUNT
    // ==========================================
    if (batch === 0) {
      console.log(`🗑️ Batch 0: Purging existing transcriptions for user: ${userEmail}`);
      
      const deleteResult = await prisma.transcription.deleteMany({
        where: { userEmail }
      });
      console.log(`✅ Deleted ${deleteResult.count} existing transcriptions`);

      // Fetch all transcript IDs (light operation)
      console.log('📥 Fetching all transcript IDs from AssemblyAI...');
      const allTranscriptIds = await fetchAllTranscriptIds(assemblyAiKey);
      console.log(`✅ Found ${allTranscriptIds.length} completed transcripts`);

      if (allTranscriptIds.length === 0) {
        return res.status(200).json({
          success: true,
          batch: 0,
          totalBatches: 0,
          synced: 0,
          total: 0,
          message: 'No transcripts found in AssemblyAI',
        });
      }

      const totalBatches = Math.ceil(allTranscriptIds.length / batchSize);

      // Store IDs in a simple cache (in production, use Redis or similar)
      // For now, we'll return them to the client and client sends them back
      return res.status(200).json({
        success: true,
        batch: 0,
        totalBatches,
        total: allTranscriptIds.length,
        transcriptIds: allTranscriptIds,
        message: `Database purged. Ready to sync ${allTranscriptIds.length} transcriptions in ${totalBatches} batches.`,
      });
    }

    // ==========================================
    // BATCH N: SYNC THIS BATCH OF TRANSCRIPTS
    // ==========================================
    const { transcriptIds } = req.body;
    
    if (!transcriptIds || !Array.isArray(transcriptIds)) {
      return res.status(400).json({ error: 'transcriptIds array is required for batch > 0' });
    }

    const startIdx = (batch - 1) * batchSize;
    const endIdx = Math.min(startIdx + batchSize, transcriptIds.length);
    const batchIds = transcriptIds.slice(startIdx, endIdx);

    console.log(`🔄 Batch ${batch}: Processing transcripts ${startIdx + 1}-${endIdx} of ${transcriptIds.length}`);

    let syncedCount = 0;

    for (const transcriptId of batchIds) {
      try {
        const fullTranscript = await fetchTranscriptDetails(transcriptId, assemblyAiKey);
        
        if (!fullTranscript) {
          console.warn(`⚠️ Skipping ${transcriptId}: Failed to fetch details`);
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

        // Queue title generation in background (fire and forget)
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

        syncedCount++;
      } catch (error) {
        console.error(`❌ Error syncing ${transcriptId}:`, error.message);
      }
    }

    const totalBatches = Math.ceil(transcriptIds.length / batchSize);
    const hasMore = batch < totalBatches;

    console.log(`✅ Batch ${batch} complete: Synced ${syncedCount} transcriptions`);

    return res.status(200).json({
      success: true,
      batch,
      totalBatches,
      synced: syncedCount,
      total: transcriptIds.length,
      hasMore,
      message: hasMore 
        ? `Batch ${batch}/${totalBatches} complete. Continue with next batch.`
        : `All ${transcriptIds.length} transcriptions synced successfully!`,
    });

  } catch (error) {
    console.error('❌ Error during batch processing:', error);
    return res.status(500).json({ 
      error: 'Failed to process batch',
      details: error.message 
    });
  }
}
