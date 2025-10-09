// lib/gemini-queue.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Rate limiting: max 15 requests per minute (Gemini free tier)
const RATE_LIMIT = {
  maxRequests: 15,
  perMinutes: 1,
  delayBetweenRequests: 4000, // 4 seconds between requests (15 per 60s)
};

class GeminiQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.requestTimestamps = [];
  }

  // Check if we can make a request now
  canMakeRequest() {
    const now = Date.now();
    const oneMinuteAgo = now - (RATE_LIMIT.perMinutes * 60 * 1000);
    
    // Remove old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    
    return this.requestTimestamps.length < RATE_LIMIT.maxRequests;
  }

  // Add request to queue
  async enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  // Process queue with rate limiting
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;

    while (this.queue.length > 0) {
      // Check rate limit
      if (!this.canMakeRequest()) {
        console.log('⏳ Rate limit reached, waiting...');
        await this.sleep(RATE_LIMIT.delayBetweenRequests);
        continue;
      }

      const { task, resolve, reject } = this.queue.shift();
      
      try {
        this.requestTimestamps.push(Date.now());
        const result = await task();
        resolve(result);
        
        // Add delay between requests to be safe
        if (this.queue.length > 0) {
          await this.sleep(RATE_LIMIT.delayBetweenRequests);
        }
      } catch (error) {
        // Retry logic for rate limit errors
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          console.log('⚠️ Rate limit error, retrying in 10s...');
          this.queue.unshift({ task, resolve, reject }); // Put back in queue
          await this.sleep(10000); // Wait 10 seconds
        } else {
          reject(error);
        }
      }
    }

    this.processing = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      requestsInLastMinute: this.requestTimestamps.length,
      remainingCapacity: RATE_LIMIT.maxRequests - this.requestTimestamps.length,
    };
  }
}

// Singleton instance
const geminiQueue = new GeminiQueue();

/**
 * Extract sample words from transcript
 */
function extractSampleWords(words, samplesPerSection = 200) {
  if (!words || words.length === 0) return '';
  
  const totalWords = words.length;
  
  if (totalWords <= samplesPerSection * 3) {
    return words.map(w => w.text).join(' ');
  }
  
  const startWords = words.slice(0, samplesPerSection);
  const midPoint = Math.floor(totalWords / 2);
  const middleWords = words.slice(
    midPoint - Math.floor(samplesPerSection / 2), 
    midPoint + Math.ceil(samplesPerSection / 2)
  );
  const endWords = words.slice(-samplesPerSection);
  
  return [
    ...startWords,
    ...middleWords,
    ...endWords
  ].map(w => w.text).join(' ');
}

/**
 * Generate a title using Gemini AI with rate limiting
 */
export async function generateTitle(transcript) {
  return geminiQueue.enqueue(async () => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY not configured, skipping title generation');
        return null;
      }

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
      
      if (title.length > 60) {
        return title.substring(0, 57) + '...';
      }
      
      console.log('✅ Generated title:', title);
      return title;
    } catch (error) {
      console.error('Error generating title with Gemini:', error);
      
      // Re-throw rate limit errors to trigger retry
      if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        throw error;
      }
      
      return null;
    }
  });
}

/**
 * Generate a fallback title from filename or transcript info
 */
export function generateFallbackTitle(fileName, language, duration) {
  if (fileName) {
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    const cleaned = nameWithoutExt.replace(/[-_]/g, ' ');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  const langEmoji = language?.startsWith('nl') ? '🇳🇱' : language?.startsWith('en') ? '🇬🇧' : '🌐';
  const durationMin = duration ? Math.round(duration / 60) : 0;
  
  return `${langEmoji} Transcriptie ${durationMin}min`;
}

/**
 * Get queue status for monitoring
 */
export function getQueueStatus() {
  return geminiQueue.getStatus();
}
