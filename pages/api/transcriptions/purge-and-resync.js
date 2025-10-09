// pages/api/transcriptions/purge-and-resync.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { generateTitle, generateFallbackTitle } from '../../../lib/gemini-queue';
import { generatePreview } from '../../../lib/transcript-utils';

/**
 * Sleep helper voor rate limiting
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch transcript IDs van AssemblyAI (lightweight, alleen IDs)
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
    
    // Collect alleen de IDs en created dates voor deze lightweight fetch
    allIds = allIds.concat(
      transcripts.map(t => ({
        id: t.id,
        created: t.created // Bewaar ook de created date
      }))
    );
    
    url = data.page_details?.next_url;
    
    if (url) {
      await sleep(300); // Lichte rate limiting voor ID-only fetches
    }
  }
  
  return allIds;
}

/**
 * Fetch full transcript details met rate limiting (max 8 seconden voor 5 transcripts)
 */
async function fetchTranscriptDetails(transcriptId, assemblyAiKey) {
  await sleep(1200); // 1.2 seconden tussen requests
  
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
 * Batch processing endpoint voor Vercel Hobby plan (10s timeout limit)
 * 
 * Proces:
 * - Batch 0: Purge database + haal alle transcript IDs op
 * - Batch 1-N: Process 5 transcripts per batch (binnen 10s timeout)
 * 
 * Client orchestreert de batches via herhaalde API calls
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { assemblyAiKey, batch = 0, transcriptIds = [] } = req.body;

  if (!assemblyAiKey) {
    return res.status(400).json({ error: 'AssemblyAI API key is required' });
  }

  const userEmail = token.user.email;
  const BATCH_SIZE = 5; // Conservatief: 5 transcripts per batch (max ~8 seconden)

  try {
    // ==========================================
    // BATCH 0: PURGE DATABASE & GET TOTAL COUNT
    // ==========================================
    if (batch === 0) {
      console.log(`🗑️ Batch 0: Purging existing transcriptions voor user: ${userEmail}`);
      
      const deleteResult = await prisma.transcription.deleteMany({
        where: { userEmail }
      });
      console.log(`✅ Deleted ${deleteResult.count} bestaande transcriptions`);

      // Fetch alle transcript IDs (lightweight operation)
      console.log('📥 Fetching all transcript IDs van AssemblyAI...');
      const allTranscriptData = await fetchAllTranscriptIds(assemblyAiKey);
      console.log(`✅ Found ${allTranscriptData.length} completed transcripts`);

      if (allTranscriptData.length === 0) {
        return res.status(200).json({
          success: true,
          batch: 0,
          totalBatches: 0,
          synced: 0,
          total: 0,
          message: 'Geen transcripts gevonden in AssemblyAI',
        });
      }

      const totalBatches = Math.ceil(allTranscriptData.length / BATCH_SIZE);

      // Return IDs naar de client voor batch processing
      return res.status(200).json({
        success: true,
        batch: 0,
        totalBatches,
        total: allTranscriptData.length,
        transcriptData: allTranscriptData, // Include created dates
        batchSize: BATCH_SIZE,
        message: `Database purged. Klaar om ${allTranscriptData.length} transcriptions te syncen in ${totalBatches} batches.`,
      });
    }

    // ==========================================
    // BATCH N: SYNC DEZE BATCH VAN TRANSCRIPTS
    // ==========================================
    if (!transcriptIds || !Array.isArray(transcriptIds)) {
      return res.status(400).json({ 
        error: 'transcriptIds array is required voor batch > 0' 
      });
    }

    const startIdx = (batch - 1) * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, transcriptIds.length);
    const batchData = transcriptIds.slice(startIdx, endIdx);

    console.log(`🔄 Batch ${batch}: Processing transcripts ${startIdx + 1}-${endIdx} of ${transcriptIds.length}`);

    let syncedCount = 0;
    const syncedIds = [];

    for (const item of batchData) {
      const transcriptId = typeof item === 'string' ? item : item.id;
      const assemblyCreatedAt = typeof item === 'object' && item.created 
        ? new Date(item.created) 
        : null;

      try {
        const fullTranscript = await fetchTranscriptDetails(transcriptId, assemblyAiKey);
        
        if (!fullTranscript) {
          console.warn(`⚠️ Skipping ${transcriptId}: Failed to fetch details`);
          continue;
        }

        const preview = generatePreview(fullTranscript);
        const createdAt = assemblyCreatedAt || (fullTranscript.created ? new Date(fullTranscript.created) : null);

        const transcription = await prisma.transcription.create({
          data: {
            assemblyAiId: fullTranscript.id,
            userEmail,
            fileName: null,
            language: fullTranscript.language_code,
            duration: fullTranscript.audio_duration,
            wordCount: fullTranscript.words?.length || 0,
            preview,
            assemblyCreatedAt: createdAt,
            title: null,
            titleGenerating: true,
          },
        });

        // Queue title generation in background (fire and forget)
        generateTitle(fullTranscript).then(async (title) => {
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
          console.log(`✅ Title generated voor ${transcription.id}: "${title}"`);
        }).catch(async (error) => {
          console.error(`❌ Failed to generate title voor ${transcription.id}:`, error);
          await prisma.transcription.update({
            where: { id: transcription.id },
            data: { titleGenerating: false },
          });
        });

        syncedCount++;
        syncedIds.push(transcriptId);
      } catch (error) {
        console.error(`❌ Error syncing ${transcriptId}:`, error.message);
      }
    }

    const totalBatches = Math.ceil(transcriptIds.length / BATCH_SIZE);
    const hasMore = batch < totalBatches;

    console.log(`✅ Batch ${batch} compleet: Synced ${syncedCount} transcriptions`);

    return res.status(200).json({
      success: true,
      batch,
      totalBatches,
      synced: syncedCount,
      syncedIds,
      total: transcriptIds.length,
      hasMore,
      nextBatch: hasMore ? batch + 1 : null,
      message: hasMore 
        ? `Batch ${batch}/${totalBatches} compleet. Ga door met volgende batch.`
        : `Alle ${transcriptIds.length} transcriptions gesynchroniseerd!`,
    });

  } catch (error) {
    console.error('❌ Error tijdens batch processing:', error);
    return res.status(500).json({ 
      error: 'Failed to process batch',
      details: error.message 
    });
  }
}
