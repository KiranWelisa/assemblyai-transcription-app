// pages/api/gemini/status.js
import { getToken } from 'next-auth/jwt';
import { getQueueStatus } from '../../../lib/gemini-queue';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const status = getQueueStatus();
    
    return res.status(200).json({
      queue: status,
      rateLimit: {
        maxRequestsPerMinute: 15,
        currentUsage: status.requestsInLastMinute,
        remaining: status.remainingCapacity,
      },
      message: status.queueLength > 0 
        ? `Processing ${status.queueLength} title generation${status.queueLength > 1 ? 's' : ''}`
        : 'Queue is empty',
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    return res.status(500).json({ error: 'Failed to get queue status' });
  }
}
