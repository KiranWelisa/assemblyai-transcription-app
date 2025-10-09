// pages/api/transcriptions/[id].js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  const userEmail = token.user.email;

  if (req.method === 'GET') {
    try {
      const transcription = await prisma.transcription.findUnique({
        where: { id },
      });

      if (!transcription || transcription.userEmail !== userEmail) {
        return res.status(404).json({ error: 'Transcription not found' });
      }

      return res.status(200).json({ transcription });
    } catch (error) {
      console.error('Error fetching transcription:', error);
      return res.status(500).json({ error: 'Failed to fetch transcription' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const transcription = await prisma.transcription.findUnique({
        where: { id },
      });

      if (!transcription || transcription.userEmail !== userEmail) {
        return res.status(404).json({ error: 'Transcription not found' });
      }

      const { tags } = req.body;

      const updated = await prisma.transcription.update({
        where: { id },
        data: { tags },
      });

      return res.status(200).json({ transcription: updated });
    } catch (error) {
      console.error('Error updating transcription:', error);
      return res.status(500).json({ error: 'Failed to update transcription' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}