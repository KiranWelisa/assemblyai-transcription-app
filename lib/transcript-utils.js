// lib/transcript-utils.js

/**
 * Generate a preview from transcript
 * @param {Object} transcript - Full AssemblyAI transcript object
 * @param {number} maxLength - Maximum preview length (default: 150)
 * @returns {string} Preview text
 */
export function generatePreview(transcript, maxLength = 150) {
  if (!transcript?.utterances?.length) return '';
  
  const text = transcript.utterances
    .slice(0, 3)
    .map(u => u.text)
    .join(' ');
  
  return text.length > maxLength 
    ? text.substring(0, maxLength).trim() + '...' 
    : text;
}

/**
 * Cache for full transcripts to avoid repeated API calls
 */
class TranscriptCache {
  constructor(ttl = 5 * 60 * 1000) { // 5 minutes default
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // Check if expired
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  clear() {
    this.cache.clear();
  }
}

export const transcriptCache = new TranscriptCache();