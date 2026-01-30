// pages/api/transcriptions/init-sync.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch ALLEEN transcript IDs van AssemblyAI (lightweight)
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
    
    // Collect alleen IDs en created date
    allIds = allIds.concat(
      transcripts.map(t => ({
        id: t.id,
        created: t.created,
      }))
    );
    
    url = data.page_details?.next_url;
    
    if (url) {
      await sleep(300); // Rate limiting voor pagination
    }
  }
  
  return allIds;
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
    console.log(`🗑️ Purging existing transcriptions for user: ${userEmail}`);
    
    // 1. Purge database
    const deleteResult = await prisma.transcription.deleteMany({
      where: { userEmail }
    });
    console.log(`✅ Deleted ${deleteResult.count} existing transcriptions`);

    // 2. Fetch alle transcript IDs (GEEN full transcripts)
    console.log('📥 Fetching all transcript IDs from AssemblyAI...');
    const allTranscriptData = await fetchAllTranscriptIds(assemblyAiKey);
    console.log(`✅ Found ${allTranscriptData.length} completed transcripts`);

    if (allTranscriptData.length === 0) {
      return res.status(200).json({
        success: true,
        total: 0,
        ids: [],
        message: 'Geen transcripts gevonden in AssemblyAI',
      });
    }

    // 3. Bulk insert placeholder records (SUPER SNEL)
    const placeholderRecords = allTranscriptData.map(item => ({
      assemblyAiId: item.id,
      userEmail,
      assemblyCreatedAt: item.created ? new Date(item.created) : null,
      // Placeholder values
      title: 'Loading...',
      titleGenerating: true,
      fileName: null,
      language: null,
      duration: null,
      wordCount: null,
      preview: 'Loading transcript data...',
      // NEW badge fields
      isNew: true,
      viewedAt: null,
      // Smart title metadata
      companyNames: [],
      personNames: [],
      meetingType: null,
    }));

    await prisma.transcription.createMany({
      data: placeholderRecords,
      skipDuplicates: true,
    });

    console.log(`✅ Inserted ${allTranscriptData.length} placeholder records`);

    // 4. Return IDs naar client voor batch enrichment
    return res.status(200).json({
      success: true,
      total: allTranscriptData.length,
      ids: allTranscriptData.map(item => item.id),
      message: `${allTranscriptData.length} transcripts klaar voor enrichment`,
    });

  } catch (error) {
    console.error('❌ Error in init-sync:', error);
    return res.status(500).json({ 
      error: 'Failed to initialize sync',
      details: error.message 
    });
  }
}
