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
    this.processingIds = new Set(); // Track which transcriptions are being processed
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
      processingCount: this.processingIds.size,
    };
  }

  // Check if a transcription is already being processed or in queue
  isProcessing(transcriptionId) {
    return this.processingIds.has(transcriptionId);
  }

  // Add transcription to processing set
  markProcessing(transcriptionId) {
    this.processingIds.add(transcriptionId);
  }

  // Remove transcription from processing set
  unmarkProcessing(transcriptionId) {
    this.processingIds.delete(transcriptionId);
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
 * Generate a title and extract metadata using Gemini AI with rate limiting
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

      const prompt = `Analyseer deze transcriptie en geef een JSON response met titel en metadata.

INSTRUCTIES:
1. Genereer een korte, beschrijvende TITEL (max 60 tekens)
2. Extraheer BEDRIJFSNAMEN die worden genoemd (max 3)
3. Extraheer NAMEN van personen waarmee/waarover wordt gesproken (max 3, niet de interviewer/gastheer)
4. Bepaal het TYPE gesprek: interview, meeting, presentation, call, brainstorm, of other

TITEL FORMAT REGELS:
- Als er een bedrijf is: "[Bedrijf] - [Onderwerp]" (bijv. "Shell - Q4 Review")
- Als er een interview is: "Interview: [Persoon] - [Onderwerp]"
- Als er meerdere personen zijn: "[Onderwerp] met [Persoon]"
- Anders: gewoon het hoofdonderwerp
- Gebruik Nederlands als de transcriptie Nederlands is

VOORBEELDEN van goede titels:
- "Coolblue - Sales Strategie Gesprek"
- "Interview: Jan de Vries - AI Implementatie"
- "Sprint Planning met Development Team"
- "Sollicitatiegesprek Backend Developer"
- "Klantgesprek Website Redesign"

TRANSCRIPTIE SAMPLE:
${sampleText.substring(0, 3500)}

RESPONSE FORMAT (alleen valid JSON, geen markdown):
{
  "title": "De gegenereerde titel",
  "companyNames": ["Bedrijf1", "Bedrijf2"],
  "personNames": ["Persoon1", "Persoon2"],
  "meetingType": "interview|meeting|presentation|call|brainstorm|other"
}`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      let text = response.text().trim();

      // Clean up response - remove markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const parsed = JSON.parse(text);
        let title = parsed.title || '';

        if (title.length > 60) {
          title = title.substring(0, 57) + '...';
        }

        console.log('✅ Generated title:', title, '| Companies:', parsed.companyNames, '| People:', parsed.personNames);

        return {
          title,
          companyNames: parsed.companyNames || [],
          personNames: parsed.personNames || [],
          meetingType: parsed.meetingType || 'other'
        };
      } catch (parseError) {
        // Fallback: use raw text as title if JSON parsing fails
        console.warn('Failed to parse JSON response, using raw text as title');
        let title = text.split('\n')[0].replace(/["{}\[\]]/g, '').trim();
        if (title.length > 60) {
          title = title.substring(0, 57) + '...';
        }
        return { title, companyNames: [], personNames: [], meetingType: 'other' };
      }
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

/**
 * Queue title generation for a transcription (with deduplication)
 * Returns a promise that resolves when title is generated
 */
export async function queueTitleGeneration(transcriptionId, transcript, prisma) {
  // Check if already processing
  if (geminiQueue.isProcessing(transcriptionId)) {
    console.log(`⏭️ Transcription ${transcriptionId} already in queue, skipping`);
    return;
  }

  // Mark as processing
  geminiQueue.markProcessing(transcriptionId);

  try {
    // Generate title and metadata
    let result = await generateTitle(transcript);

    // Handle both old (string) and new (object) return format
    let title, companyNames = [], personNames = [], meetingType = null;

    if (result && typeof result === 'object') {
      title = result.title;
      companyNames = result.companyNames || [];
      personNames = result.personNames || [];
      meetingType = result.meetingType || null;
    } else if (typeof result === 'string') {
      title = result;
    }

    if (!title) {
      // Use fallback if Gemini fails
      const transcription = await prisma.transcription.findUnique({
        where: { id: transcriptionId }
      });

      if (transcription) {
        title = generateFallbackTitle(
          transcription.fileName,
          transcription.language,
          transcription.duration
        );
      }
    }

    // Update database with title and extracted metadata
    if (title) {
      await prisma.transcription.update({
        where: { id: transcriptionId },
        data: {
          title,
          titleGenerating: false,
          companyNames,
          personNames,
          meetingType
        },
      });
      console.log(`✅ Title updated for ${transcriptionId}: "${title}" | Companies: ${companyNames.join(', ')} | People: ${personNames.join(', ')}`);
    }
  } catch (error) {
    console.error(`❌ Error generating title for ${transcriptionId}:`, error);

    // Mark as failed
    try {
      await prisma.transcription.update({
        where: { id: transcriptionId },
        data: { titleGenerating: false },
      });
    } catch (dbError) {
      console.error('Failed to update titleGenerating flag:', dbError);
    }
  } finally {
    // Remove from processing set
    geminiQueue.unmarkProcessing(transcriptionId);
  }
}

/**
 * Check if queue is empty
 */
export function isQueueEmpty() {
  return geminiQueue.queue.length === 0 && !geminiQueue.processing;
}
