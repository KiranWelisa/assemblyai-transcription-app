// pages/api/transcriptions/[id]/mark-viewed.js
import { getToken } from 'next-auth/jwt';
import { prisma } from '../../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token?.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Transcription ID required' });
    }

    // Update the transcription to mark as viewed
    const transcription = await prisma.transcription.updateMany({
      where: {
        id,
        userEmail: token.user.email,
      },
      data: {
        isNew: false,
        viewedAt: new Date(),
      },
    });

    if (transcription.count === 0) {
      return res.status(404).json({ error: 'Transcription not found' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking transcription as viewed:', error);
    return res.status(500).json({ error: 'Failed to mark as viewed' });
  }
}
