// pages/api/transcriptions/generate-title.js
import { prisma } from '../../../lib/prisma';
import { getToken } from 'next-auth/jwt';
import { generateTitle, generateFallbackTitle } from '../../../lib/gemini';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token || !token.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { transcriptionId, transcript } = req.body;

  if (!transcriptionId || !transcript) {
    return res.status(400).json({ error: 'transcriptionId and transcript are required' });
  }

  try {
    // Verify transcription belongs to user
    const existingTranscription = await prisma.transcription.findUnique({
      where: { id: transcriptionId },
    });

    if (!existingTranscription || existingTranscription.userEmail !== token.user.email) {
      return res.status(404).json({ error: 'Transcription not found' });
    }

    // Try to generate title with Gemini
    let title = await generateTitle(transcript);
    
    // Fallback to basic title if Gemini fails
    if (!title) {
      title = generateFallbackTitle(
        existingTranscription.fileName, 
        existingTranscription.language,
        existingTranscription.duration
      );
    }

    // Update transcription with generated title
    const updatedTranscription = await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        title,
        titleGenerating: false,
      },
    });

    return res.status(200).json({ transcription: updatedTranscription });
  } catch (error) {
    console.error('Error generating title:', error);
    
    // Update to mark title generation as failed
    try {
      await prisma.transcription.update({
        where: { id: transcriptionId },
        data: { titleGenerating: false },
      });
    } catch (updateError) {
      console.error('Failed to update titleGenerating flag:', updateError);
    }
    
    return res.status(500).json({ error: 'Failed to generate title' });
  }
}
