// pages/api/tags/index.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userEmail = token.user.email;

  if (req.method === 'GET') {
    // Get all unique tags for user
    try {
      const transcriptions = await prisma.transcription.findMany({
        where: { userEmail },
        select: { tags: true },
      });

      const allTags = transcriptions
        .flatMap(t => t.tags || [])
        .filter((tag, index, self) => self.indexOf(tag) === index);

      return res.status(200).json({ tags: allTags });
    } catch (error) {
      console.error('Error fetching tags:', error);
      return res.status(500).json({ error: 'Failed to fetch tags' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
