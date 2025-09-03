// Volledige inhoud voor: components/AssemblyAITranscription.js
import React, { useState, useEffect, useRef } from 'react';
import { Upload, Link, Globe, Loader2, User, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Key, X, File } from 'lucide-react';
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
  
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  
  const [driveFile, setDriveFile] = useState(null);
  const pickerLoadedRef = useRef(false);

  useEffect(() => {
    if (session) {
      const storedKey = localStorage.getItem('assemblyai_api_key');
      if (storedKey) {
        setApiKey(storedKey);
        fetchPastTranscriptions(storedKey);
      }
    }
  }, [session]);

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

  // --- START: GECORRIGEERDE GOOGLE PICKER LOGICA (gebaseerd op Claude's analyse) ---
  useEffect(() => {
    if (document.querySelector('script#google-api-script')) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-api-script';
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('Google API script loaded successfully');
      if (window.gapi) {
        window.gapi.load('picker', {
          callback: () => {
            console.log('Google Picker library preloaded');
            pickerLoadedRef.current = true;
          },
          onerror: () => console.error('Failed to load Google Picker library')
        });
      }
    };
    
    script.onerror = () => console.error('Failed to load Google API script');
    
    document.head.appendChild(script);
    
    return () => {
      const scriptEl = document.querySelector('script#google-api-script');
      if (scriptEl) {
        scriptEl.remove();
      }
    };
  }, []);

  const handleChooseFromDrive = async () => {
    const developerKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;

    if (!session?.accessToken) {
      setError('Je bent niet ingelogd. Log eerst in met Google.');
      return;
    }
    
    if (!developerKey || !clientId || !appId) {
      setError('Google configuratie ontbreekt. Controleer environment variabelen.');
      return;
    }
    
    if (session.error === "AccessTokenExpired") {
      setError('Je sessie is verlopen. Log opnieuw in.');
      signOut();
      return;
    }
    
    if (!window.gapi || !pickerLoadedRef.current) {
      setError('Google API wordt nog geladen. Probeer het over een paar seconden opnieuw.');
      return;
    }
    
    const pickerCallback = (data) => {
      if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        console.log('Selected file:', doc);
        setDriveFile({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
        setAudioUrl('');
        setError(null);
      } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
        console.log('Picker cancelled by user');
      }
    };
    
    const createAndShowPicker = () => {
      try {
        console.log('Creating picker with:', { appId, hasToken: !!session.accessToken, hasDeveloperKey: !!developerKey });
        
        const audioView = new google.picker.DocsView().setIncludeFolders(false).setSelectFolderEnabled(false).setMimeTypes('audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/aac,audio/flac,audio/x-m4a');
        const videoView = new google.picker.DocsView().setIncludeFolders(false).setSelectFolderEnabled(false).setMimeTypes('video/mp4,video/webm,video/ogg,video/mov,video/avi,video/wmv,video/flv,video/mkv');
        
        const picker = new google.picker.PickerBuilder()
          .setAppId(appId)
          .setOAuthToken(session.accessToken)
          .setDeveloperKey(developerKey)
          .addView(audioView)
          .addView(videoView)
          .addView(new google.picker.DocsUploadView())
          .setCallback(pickerCallback)
          .setTitle('Selecteer een audio of video bestand')
          .setOrigin(window.location.protocol + '//' + window.location.host)
          .setMaxItems(1)
          .build();
          
        picker.setVisible(true);
      } catch (error) {
        console.error('Error creating picker:', error);
        setError('Er ging iets mis bij het openen van de Google Picker: ' + error.message);
      }
    };
    
    createAndShowPicker();
  };
  // --- EINDE: GECORRIGEERDE GOOGLE PICKER LOGICA ---

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
          'Authorization': apiKey,
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
          headers: { 'Authorization': apiKey }
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
    if (!apiKey) return setError('Please provide your AssemblyAI API key.');
    setError(null);
  
    let finalAudioUrl = audioUrl;
    let localDriveFile = driveFile;
    let localPermissionId = null;
  
    try {
      if (localDriveFile) {
        setTranscriptionStatus('publishing');
        
        const response = await fetch('/api/drive/make-public', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: localDriveFile.id }),
        });
  
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Could not make Google Drive file public.');
        }
  
        const { publicUrl, permissionId } = await response.json();
        
        finalAudioUrl = publicUrl;
        localPermissionId = permissionId;
  
      }
      
      if (!finalAudioUrl) {
        return setError('Please provide a URL or select a file from Google Drive.');
      }
  
      const transcript = await createTranscription(finalAudioUrl);
      setCurrentTranscriptId(transcript.id);
      await pollTranscriptionStatus(transcript.id);
      fetchPastTranscriptions(apiKey);

    } catch (err) {
      console.error('Transcription process error:', err);
      setError(`Transcription process error: ${err.message}`);
      setTranscriptionStatus('idle');
    } finally {
      if (localDriveFile && localPermissionId) {
        console.log(`Revoking permission ${localPermissionId} for file ${localDriveFile.id}`);
        try {
          await fetch('/api/drive/make-private', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileId: localDriveFile.id,
              permissionId: localPermissionId,
            }),
          });
        } catch (revokeError) {
          console.error('CRITICAL: Failed to revoke file permission:', revokeError);
          setError('Transcription finished, but failed to make the Google Drive file private again. Please check the file permissions manually.');
        }

        setDriveFile(null);
      }
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
  
  const isTranscriptionDisabled = (!audioUrl && !driveFile) || transcriptionStatus !== 'idle';


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

                <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                    {driveFile ? (
                        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className='flex items-center gap-2'>
                                <File className="w-5 h-5 text-blue-600" />
                                <span className='font-medium text-blue-800'>{driveFile.name}</span>
                            </div>
                            <button onClick={() => setDriveFile(null)} className="text-gray-500 hover:text-gray-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <div>
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

                            <div className="relative flex py-4 items-center">
                                <div className="flex-grow border-t border-gray-300"></div>
                                <span className="flex-shrink mx-4 text-gray-500">of</span>
                                <div className="flex-grow border-t border-gray-300"></div>
                            </div>

                            <button
                                onClick={handleChooseFromDrive}
                                className="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 px-6 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                            >
                                <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#fbc02d" d="M313 118l-42 73-85 147.5L144 256h224l-55-98z"/><path fill="#4caf50" d="M144 256l85 147.5L271 496h141L144 256z"/><path fill="#2196f3" d="M412 496L271 256 144 256 0 496z"/><path fill="#fbc02d" d="M144 256L0 0h144z"/><path fill="#4caf50" d="M144 0h142l-42 73-85-73z"/><path fill="#2196f3" d="M286 0h141l-85 148-42-73z"/></svg>
                                Kies uit Google Drive
                            </button>
                        </div>
                    )}
                  {error && <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}
                  <button
                    onClick={startTranscription}
                    disabled={isTranscriptionDisabled}
                    className="mt-6 w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
                  >
                    {transcriptionStatus === 'idle' ? <><Upload className="w-5 h-5" /> Start Transcriptie</> : <><Loader2 className="w-5 h-5 animate-spin" /> {transcriptionStatus === 'publishing' ? 'Bestand voorbereiden...' : transcriptionStatus === 'transcribing' ? 'Transcriptie aanmaken...' : 'Audio verwerken...'}</>}
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