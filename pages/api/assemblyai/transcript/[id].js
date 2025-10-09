// pages/api/assemblyai/transcript/[id].js
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify user is authenticated
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  const apiKey = req.headers['x-assemblyai-key'];

  if (!apiKey) {
    return res.status(400).json({ error: 'API key required in x-assemblyai-key header' });
  }

  if (!id) {
    return res.status(400).json({ error: 'Transcript ID required' });
  }

  try {
    // Proxy request to AssemblyAI
    const response = await fetch(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      { 
        headers: { 
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        } 
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `AssemblyAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Set cache headers for better performance
    // Transcripts are immutable once completed, so we can cache aggressively
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching transcript from AssemblyAI:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch transcript',
      details: error.message 
    });
  }
}
