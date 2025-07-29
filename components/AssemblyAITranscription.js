import React, { useState, useEffect } from 'react';
import { Upload, Link, Globe, Loader2, User, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from 'lucide-react';

// ✅ NEW: Helper function to reformat Google Drive links
const reformatGoogleDriveLink = (url) => {
  const regex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
  const match = url.match(regex);

  // If it's a standard Google Drive link, reformat it
  if (match && match[1]) {
    const fileId = match[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  // Otherwise, return the original URL
  return url;
};

const AssemblyAITranscription = () => {
  const [audioUrl, setAudioUrl] = useState('');
  const [language, setLanguage] = useState('nl');
  const [transcriptionStatus, setTranscriptionStatus] = useState('idle');
  const [currentTranscriptId, setCurrentTranscriptId] = useState(null);
  const [currentTranscript, setCurrentTranscript] = useState(null);
  const [pastTranscriptions, setPastTranscriptions] = useState([]);
  const [showPastTranscriptions, setShowPastTranscriptions] = useState(true);
  const [error, setError] = useState(null);

  const API_BASE_URL = '/api/proxy';

  const getLanguageDisplay = (languageCode) => {
    try {
      if (!languageCode) return '🌐 Unknown';
      const code = String(languageCode).toLowerCase();
      if (code.startsWith('nl')) return '🇳🇱 Dutch';
      if (code.startsWith('en')) return '🇬🇧 English';
      return '🌐 ' + languageCode;
    } catch (err) {
      console.error('Error in getLanguageDisplay:', err);
      return '🌐 Unknown';
    }
  };

  const createTranscription = async (url) => {
    setTranscriptionStatus('transcribing');
    setError(null);
    try {
      const requestBody = {
        audio_url: url,
        language_code: language,
        speaker_labels: true,
        speech_model: 'universal',
        punctuate: true,
        format_text: true
      };

      const response = await fetch(`${API_BASE_URL}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create transcription');
      }

      const data = await response.json();
      return data;
    } catch (err) {
      setError(`Failed to create transcription: ${err.message}`);
      setTranscriptionStatus('idle');
      throw err;
    }
  };

  const pollTranscriptionStatus = async (transcriptId) => {
    const maxAttempts = 200;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      try {
        const response = await fetch(`${API_BASE_URL}/transcript/${transcriptId}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch transcript status');
        }
        const transcript = await response.json();

        if (transcript.status === 'completed') {
          setTranscriptionStatus('completed');
          setCurrentTranscript(transcript);
          return transcript;
        } else if (transcript.status === 'error') {
          throw new Error(transcript.error || 'Transcription failed');
        }

        setTranscriptionStatus(transcript.status || 'processing');
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (err) {
        setError(`Error checking transcription status: ${err.message}`);
        setTranscriptionStatus('idle');
        throw err;
      }
    }
    throw new Error('Transcription timeout - please try again');
  };

  const startTranscription = async () => {
    if (!audioUrl) {
      setError('Please enter a public URL for an audio or video file.');
      return;
    }
    
    // ✅ Use the helper function to get a direct link
    const directUrl = reformatGoogleDriveLink(audioUrl);

    try {
      const transcript = await createTranscription(directUrl);
      setCurrentTranscriptId(transcript.id);
      await pollTranscriptionStatus(transcript.id);
      fetchPastTranscriptions();
    } catch (err) {
      console.error('Transcription error:', err);
    }
  };

  const fetchPastTranscriptions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/transcript?limit=20`);
      if (!response.ok) {
        console.error('Failed to fetch transcriptions, status:', response.status);
        return;
      }
      const data = await response.json();
      setPastTranscriptions(data.transcripts || []);
    } catch (err) {
      console.error('Error fetching past transcriptions:', err);
    }
  };

  const loadPastTranscription = async (transcriptId) => {
    setCurrentTranscriptId(transcriptId);
    setTranscriptionStatus('loading');
    try {
      await pollTranscriptionStatus(transcriptId);
    } catch (err) {
      console.error('Error loading transcription:', err);
    }
  };

  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleString();

  useEffect(() => {
    fetchPastTranscriptions();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-2">AssemblyAI Transcription Tool</h1>
          <p className="text-center text-gray-600">Enter a public link to an audio/video file for transcription</p>
        </div>

        {/* Language Selector */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-gray-600" />
              <span className="font-medium">Transcription Language</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setLanguage('nl')} className={`px-4 py-2 rounded-lg transition-colors ${language === 'nl' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>🇳🇱 Dutch</button>
              <button onClick={() => setLanguage('en')} className={`px-4 py-2 rounded-lg transition-colors ${language === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>🇬🇧 English</button>
            </div>
          </div>
        </div>

        {/* URL Input Area */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center border border-gray-300 rounded-lg p-2 focus-within:ring-2 focus-within:ring-blue-500">
            <Link className="w-6 h-6 mx-2 text-gray-400" />
            <input
              type="text"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="Paste a public audio/video URL here..."
              className="w-full bg-transparent outline-none text-lg"
            />
          </div>

          {error && <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

          <button
            onClick={startTranscription}
            disabled={!audioUrl || transcriptionStatus !== 'idle'}
            className="mt-4 w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {transcriptionStatus === 'idle' ? <><Upload className="w-5 h-5" /> Start Transcription</> : <><Loader2 className="w-5 h-5 animate-spin" /> {transcriptionStatus === 'transcribing' ? 'Creating transcription...' : 'Processing audio...'}</>}
          </button>
        </div>

        {currentTranscript && transcriptionStatus === 'completed' && (
          <div className="mb-6"><TranscriptDisplay transcript={currentTranscript} formatTime={formatTime} getLanguageDisplay={getLanguageDisplay} /></div>
        )}

        <PastTranscriptionsList pastTranscriptions={pastTranscriptions} loadPastTranscription={loadPastTranscription} showPastTranscriptions={showPastTranscriptions} setShowPastTranscriptions={setShowPastTranscriptions} getLanguageDisplay={getLanguageDisplay} formatDate={formatDate} formatTime={formatTime} />
      </div>
    </div>
  );
};

const TranscriptDisplay = ({ transcript, formatTime, getLanguageDisplay }) => {
  const speakerColors = ['text-blue-600', 'text-green-600', 'text-purple-600', 'text-orange-600'];
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Transcription Result</h3>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>Language: {getLanguageDisplay(transcript.language_code)}</span>
          <span>Duration: {formatTime(transcript.audio_duration)}</span>
          <span>Words: {transcript.words?.length || 0}</span>
        </div>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {transcript.utterances?.map((utterance, index) => (
          <div key={index} className="flex gap-3 p-3 hover:bg-gray-50 rounded">
            <div className="flex items-center gap-2 min-w-fit">
              <User className={`w-5 h-5 ${speakerColors[utterance.speaker.charCodeAt(0) % 4]}`} />
              <span className={`font-medium ${speakerColors[utterance.speaker.charCodeAt(0) % 4]}`}>Speaker {utterance.speaker}</span>
            </div>
            <div className="flex-1">
              <p className="text-gray-800">{utterance.text}</p>
              <span className="text-xs text-gray-500">{formatTime(utterance.start / 1000)} - {formatTime(utterance.end / 1000)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t">
        <button onClick={() => {
          const text = transcript.utterances.map(u => `Speaker ${u.speaker}: ${u.text}`).join('\n\n');
          const blob = new Blob([text], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `transcript-${transcript.id}.txt`;
          a.click();
        }} className="text-blue-600 hover:text-blue-700 text-sm font-medium">Download Transcript</button>
      </div>
    </div>
  );
};

const PastTranscriptionsList = ({ pastTranscriptions, loadPastTranscription, showPastTranscriptions, setShowPastTranscriptions, getLanguageDisplay, formatDate, formatTime }) => (
  <div className="bg-white rounded-lg shadow-lg p-6">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold">Past Transcriptions</h3>
      <button onClick={() => setShowPastTranscriptions(!showPastTranscriptions)} className="text-blue-600 hover:text-blue-700">{showPastTranscriptions ? <ChevronUp /> : <ChevronDown />}</button>
    </div>
    {showPastTranscriptions && (
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {pastTranscriptions.length === 0 ? <p className="text-gray-500 text-center py-4">No past transcriptions found</p> : pastTranscriptions.map((transcript) => (
          <div key={transcript.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer" onClick={() => loadPastTranscription(transcript.id)}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{getLanguageDisplay(transcript.language_code)} Transcription</p>
                <p className="text-sm text-gray-600">{formatDate(transcript.created)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Duration: {formatTime(transcript.audio_duration || 0)}</p>
                <p className="text-sm">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${transcript.status === 'completed' ? 'bg-green-100 text-green-800' : transcript.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {transcript.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                    {transcript.status === 'error' && <AlertCircle className="w-3 h-3" />}
                    {transcript.status}
                  </span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default AssemblyAITranscription;
