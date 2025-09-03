import React, { useState, useEffect } from 'react';
import { Upload, Link, Globe, Loader2, User, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Key, X } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';

const reformatGoogleDriveLink = (url) => {
  const regex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
  const match = url.match(regex);

  if (match && match[1]) {
    const fileId = match[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  return url;
};

const AssemblyAITranscription = () => {
  const { data: session } = useSession();
  const [audioUrl, setAudioUrl] = useState('');
  const [language, setLanguage] = useState('nl');
  const [transcriptionStatus, setTranscriptionStatus] = useState('idle');
  const [currentTranscriptId, setCurrentTranscriptId] = useState(null);
  const [currentTranscript, setCurrentTranscript] = useState(null);
  const [pastTranscriptions, setPastTranscriptions] = useState([]);
  const [showPastTranscriptions, setShowPastTranscriptions] = useState(true);
  const [error, setError] = useState(null);
  
  // API Key state en logica is terug!
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Laad de AssemblyAI API key uit localStorage als de component laadt
  useEffect(() => {
    if (session) {
      const storedKey = localStorage.getItem('assemblyai_api_key');
      if (storedKey) {
        setApiKey(storedKey);
        fetchPastTranscriptions(storedKey);
      }
    }
  }, [session]); // Draai dit effect alleen als de sessie verandert

  const handleApiKeySave = () => {
    if (apiKeyInput) {
      localStorage.setItem('assemblyai_api_key', apiKeyInput);
      setApiKey(apiKeyInput);
      setApiKeyInput('');
      fetchPastTranscriptions(apiKeyInput);
    }
  };

  const handleApiKeyClear = () => {
    localStorage.removeItem('assemblyai_api_key');
    setApiKey('');
    setPastTranscriptions([]);
  };


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

  // Functies praten nu weer direct met AssemblyAI, met de sleutel van de gebruiker
  const createTranscription = async (url) => {
    if (!apiKey) {
      setError('Please provide your AssemblyAI API key first.');
      setTranscriptionStatus('idle');
      return;
    }
    setTranscriptionStatus('transcribing');
    setError(null);
    try {
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey, // Gebruik de sleutel van de gebruiker
        },
        body: JSON.stringify({
          audio_url: url,
          language_code: language,
          speaker_labels: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create transcription');
      }
      return await response.json();
    } catch (err) {
      setError(`Failed to create transcription: ${err.message}`);
      setTranscriptionStatus('idle');
      throw err;
    }
  };

  const pollTranscriptionStatus = async (transcriptId) => {
    if (!apiKey) return;
    for (let attempts = 0; attempts < 200; attempts++) {
      try {
        const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: { 'Authorization': apiKey } // Gebruik de sleutel van de gebruiker
        });
        if (!response.ok) throw new Error('Failed to fetch transcript status');
        
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
    throw new Error('Transcription timeout');
  };

  const startTranscription = async () => {
    if (!audioUrl) return setError('Please provide a URL.');
    if (!apiKey) return setError('Please provide your AssemblyAI API key.');
    
    const directUrl = reformatGoogleDriveLink(audioUrl);
    try {
      const transcript = await createTranscription(directUrl);
      setCurrentTranscriptId(transcript.id);
      await pollTranscriptionStatus(transcript.id);
      fetchPastTranscriptions(apiKey);
    } catch (err) {
      console.error('Transcription error:', err);
    }
  };

  const fetchPastTranscriptions = async (key) => {
    if (!key) return;
    try {
      const response = await fetch('https://api.assemblyai.com/v2/transcript?limit=20', {
        headers: { 'Authorization': key }
      });
      if (!response.ok) return;
      const data = await response.json();
      setPastTranscriptions(data.transcripts || []);
    } catch (err) {
      console.error('Error fetching past transcriptions:', err);
    }
  };

  const loadPastTranscription = (transcriptId) => {
    setCurrentTranscriptId(transcriptId);
    setTranscriptionStatus('loading');
    pollTranscriptionStatus(transcriptId).catch(err => console.error('Error loading transcription:', err));
  };

  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleString();

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-2">AssemblyAI Transcription Tool</h1>
          <p className="text-center text-gray-600">Transcribe audio/video files from a public link or your Google Drive</p>
        </div>

        {session ? (
          <>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <img src={session.user.image} alt="User profile" className="w-10 h-10 rounded-full" />
                <div>
                  <p className="font-medium">{session.user.name}</p>
                  <p className="text-sm text-gray-500">{session.user.email}</p>
                </div>
              </div>
              <button onClick={() => signOut()} className="text-red-600 hover:text-red-700 font-medium">
                Uitloggen
              </button>
            </div>

            {!apiKey ? (
              <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4">Voer je AssemblyAI API-sleutel in</h3>
                <p className="text-sm text-gray-600 mb-4">Je sleutel wordt veilig opgeslagen in de lokale opslag van je browser.</p>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Plak hier je API-sleutel..."
                    className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleApiKeySave}
                    disabled={!apiKeyInput}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                  >
                    Opslaan
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-lg shadow-lg p-6 mb-6 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-green-600" />
                    <span className="font-medium">AssemblyAI API-sleutel is geconfigureerd</span>
                  </div>
                  <button onClick={handleApiKeyClear} className="text-red-600 hover:text-red-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Hier komt de Google Drive knop en de rest van de UI */}
                <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                  <div className="flex items-center border border-gray-300 rounded-lg p-2 focus-within:ring-2 focus-within:ring-blue-500">
                    <Link className="w-6 h-6 mx-2 text-gray-400" />
                    <input
                      type="text"
                      value={audioUrl}
                      onChange={(e) => setAudioUrl(e.target.value)}
                      placeholder="Plak hier een publieke URL..."
                      className="w-full bg-transparent outline-none text-lg"
                    />
                  </div>
                  {error && <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}
                  <button
                    onClick={startTranscription}
                    disabled={!audioUrl || transcriptionStatus !== 'idle'}
                    className="mt-4 w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                  >
                    Start Transcriptie
                  </button>
                </div>

                {currentTranscript && transcriptionStatus === 'completed' && (
                  <div className="mb-6"><TranscriptDisplay transcript={currentTranscript} formatTime={formatTime} getLanguageDisplay={getLanguageDisplay} /></div>
                )}
                
                <PastTranscriptionsList pastTranscriptions={pastTranscriptions} loadPastTranscription={loadPastTranscription} showPastTranscriptions={showPastTranscriptions} setShowPastTranscriptions={setShowPastTranscriptions} getLanguageDisplay={getLanguageDisplay} formatDate={formatDate} formatTime={formatTime} />
              </>
            )}
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6 text-center">
            <h3 className="text-lg font-semibold mb-4">Welkom bij de Transcriptie Tool</h3>
            <p className="text-sm text-gray-600 mb-6">Log in met je Google-account om te beginnen.</p>
            <button
              onClick={() => signIn('google')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 mx-auto"
            >
               <svg className="w-5 h-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 256S109.8 0 244 0c73.2 0 136 29.1 181.2 73.2L375 152.1C341.3 120.3 296.8 97.9 244 97.9c-88.3 0-159.9 71.6-159.9 159.9s71.6 159.9 159.9 159.9c102.4 0 133.4-85.1 136.9-123.9H244v-75.1h236.1c2.3 12.7 3.9 26.1 3.9 40.8z"></path></svg>
              Aanmelden met Google
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// De TranscriptDisplay en PastTranscriptionsList componenten blijven ongewijzigd
const TranscriptDisplay = ({ transcript, formatTime, getLanguageDisplay }) => { /* ... ongewijzigde code ... */ };
const PastTranscriptionsList = ({ pastTranscriptions, loadPastTranscription, showPastTranscriptions, setShowPastTranscriptions, getLanguageDisplay, formatDate, formatTime }) => { /* ... ongewijzigde code ... */ };

export default AssemblyAITranscription;