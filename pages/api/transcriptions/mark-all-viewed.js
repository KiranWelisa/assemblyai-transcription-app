// pages/api/transcriptions/mark-all-viewed.js
import { getToken } from 'next-auth/jwt';
import { prisma } from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token?.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Update all new transcriptions to mark as viewed
    const result = await prisma.transcription.updateMany({
      where: {
        userEmail: token.user.email,
        isNew: true,
      },
      data: {
        isNew: false,
        viewedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      count: result.count
    });
  } catch (error) {
    console.error('Error marking all as viewed:', error);
    return res.status(500).json({ error: 'Failed to mark all as viewed' });
  }
}
