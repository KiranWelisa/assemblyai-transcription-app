// lib/gemini.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Extract sample words from transcript (200 start + 200 middle + 200 end)
 */
function extractSampleWords(words, samplesPerSection = 200) {
  if (!words || words.length === 0) return '';
  
  const totalWords = words.length;
  
  // If transcript is shorter than 600 words, use all
  if (totalWords <= samplesPerSection * 3) {
    return words.map(w => w.text).join(' ');
  }
  
  // Start: first 200 words
  const startWords = words.slice(0, samplesPerSection);
  
  // Middle: 200 words around the center
  const midPoint = Math.floor(totalWords / 2);
  const middleWords = words.slice(
    midPoint - Math.floor(samplesPerSection / 2), 
    midPoint + Math.ceil(samplesPerSection / 2)
  );
  
  // End: last 200 words
  const endWords = words.slice(-samplesPerSection);
  
  return [
    ...startWords,
    ...middleWords,
    ...endWords
  ].map(w => w.text).join(' ');
}

/**
 * Generate a title using Gemini AI
 */
export async function generateTitle(transcript) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not configured, skipping title generation');
      return null;
    }

    // Extract sample words
    const sampleText = extractSampleWords(transcript.words);
    
    if (!sampleText || sampleText.length < 50) {
      console.warn('Transcript too short for title generation');
      return null;
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    const prompt = `Geef een korte, beschrijvende titel (maximaal 60 tekens) voor deze transcriptie.
Focus op het onderwerp of thema, niet op metadata zoals datum of tijdstip.

Voorbeelden van goede titels:
- "Q4 Planning Vergadering"
- "Interview Marketing Strategie"
- "Presentatie Product Features"
- "Teamoverleg Klanttevredenheid"
- "Brainstorm Nieuwe Campagne"

Transcriptie sample (begin, midden en eind):
${sampleText.substring(0, 3000)}

Geef alleen de titel terug, geen uitleg of extra tekst. Maximaal 60 tekens.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const title = response.text().trim();
    
    // Ensure title is not too long
    if (title.length > 60) {
      return title.substring(0, 57) + '...';
    }
    
    return title;
  } catch (error) {
    console.error('Error generating title with Gemini:', error);
    return null;
  }
}

/**
 * Generate a fallback title from filename or transcript info
 */
export function generateFallbackTitle(fileName, language, duration) {
  if (fileName) {
    // Remove extension and clean up filename
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    const cleaned = nameWithoutExt.replace(/[-_]/g, ' ');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  const langEmoji = language?.startsWith('nl') ? '🇳🇱' : language?.startsWith('en') ? '🇬🇧' : '🌐';
  const durationMin = duration ? Math.round(duration / 60) : 0;
  
  return `${langEmoji} Transcriptie ${durationMin}min`;
}
