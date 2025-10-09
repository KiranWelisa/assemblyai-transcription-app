// lib/gemini-queue.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Rate limiting for gemini-2.5-flash-lite (free tier)
const RATE_LIMIT = {
  maxRequestsPerMinute: 15, // RPM limit
  maxRequestsPerDay: 1000,  // Daily limit for flash-lite
  delayBetweenRequests: 4000, // 4 seconds between requests
};

class GeminiQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.requestTimestamps = [];
    this.dailyRequestCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.quotaExhausted = false;
  }

  // Reset daily counter if it's a new day
  checkDailyReset() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      console.log(`📅 New day detected. Resetting daily quota. Previous: ${this.dailyRequestCount} requests`);
      this.dailyRequestCount = 0;
      this.quotaExhausted = false;
      this.lastResetDate = today;
    }
  }

  // Check if we can make a request now
  canMakeRequest() {
    this.checkDailyReset();
    
    // Check daily quota
    if (this.dailyRequestCount >= RATE_LIMIT.maxRequestsPerDay) {
      console.log(`⛔ Daily quota exhausted: ${this.dailyRequestCount}/${RATE_LIMIT.maxRequestsPerDay}`);
      this.quotaExhausted = true;
      return false;
    }
    
    // Check per-minute rate limit
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    
    return this.requestTimestamps.length < RATE_LIMIT.maxRequestsPerMinute;
  }

  // Add request to queue
  async enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject, retries: 0 });
      this.processQueue();
    });
  }

  // Process queue with rate limiting and retry logic
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;

    while (this.queue.length > 0) {
      // Check if quota is exhausted
      if (this.quotaExhausted) {
        console.log(`❌ Daily quota exhausted. Clearing ${this.queue.length} remaining tasks with null results.`);
        while (this.queue.length > 0) {
          const { resolve } = this.queue.shift();
          resolve(null); // Return null for quota-exceeded requests
        }
        break;
      }

      // Check rate limit
      if (!this.canMakeRequest()) {
        await this.sleep(RATE_LIMIT.delayBetweenRequests);
        continue;
      }

      const { task, resolve, reject, retries } = this.queue.shift();
      
      try {
        this.requestTimestamps.push(Date.now());
        this.dailyRequestCount++;
        
        const result = await task();
        resolve(result);
        
        console.log(`✅ Request successful. Daily usage: ${this.dailyRequestCount}/${RATE_LIMIT.maxRequestsPerDay}`);
        
        // Add delay between requests
        if (this.queue.length > 0) {
          await this.sleep(RATE_LIMIT.delayBetweenRequests);
        }
      } catch (error) {
        const errorMsg = error.message || '';
        const is429Error = errorMsg.includes('429') || errorMsg.includes('Too Many Requests');
        const isQuotaError = errorMsg.includes('quota') || errorMsg.includes('exceeded');
        
        // Handle 429 / quota errors with exponential backoff
        if ((is429Error || isQuotaError) && retries < 5) {
          const waitTime = Math.min(2 ** retries * 5000, 60000); // Max 60 seconds
          console.log(`⚠️ Quota/rate limit error (attempt ${retries + 1}/5). Waiting ${waitTime/1000}s before retry...`);
          
          // Check if it's a daily quota error
          if (errorMsg.includes('exceeded your current quota') || errorMsg.includes('per day')) {
            console.log('⛔ Daily quota limit reached. Switching to fallback titles for remaining requests.');
            this.quotaExhausted = true;
            resolve(null); // Return null to trigger fallback
            continue;
          }
          
          // Put back in queue for retry
          this.queue.unshift({ task, resolve, reject, retries: retries + 1 });
          await this.sleep(waitTime);
        } else if (retries >= 5) {
          console.error(`❌ Max retries (5) reached. Failing request.`);
          resolve(null); // Return null instead of throwing error
        } else {
          console.error(`❌ Non-retriable error:`, error.message);
          resolve(null); // Return null for other errors
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
    this.checkDailyReset();
    
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      requestsInLastMinute: this.requestTimestamps.length,
      remainingMinuteCapacity: RATE_LIMIT.maxRequestsPerMinute - this.requestTimestamps.length,
      dailyUsage: this.dailyRequestCount,
      dailyRemaining: RATE_LIMIT.maxRequestsPerDay - this.dailyRequestCount,
      quotaExhausted: this.quotaExhausted,
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

      // Use gemini-2.5-flash-lite for 1000 requests per day (vs 50 for 2.0-flash-exp)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      
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
      
      // Re-throw rate limit errors to trigger retry in queue
      if (error.message?.includes('429') || 
          error.message?.includes('rate limit') || 
          error.message?.includes('quota')) {
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
