// components/AssemblyAITranscription.js
import React, { useState, useEffect, useRef } from 'react';
import { Upload, Link, Loader2, User, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Key, X, File, Copy, ClipboardCheck } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';

const AssemblyAITranscription = () => {
  const { data: session, status, update } = useSession();

  // State variables
  const [audioUrl, setAudioUrl] = useState('');
  const [transcriptionStatus, setTranscriptionStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('Ready to transcribe.');
  const [currentTranscript, setCurrentTranscript] = useState(null);
  const [transcriptionTitle, setTranscriptionTitle] = useState('');
  const [pastTranscriptions, setPastTranscriptions] = useState([]);
  const [showPastTranscriptions, setShowPastTranscriptions] = useState(true);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [driveFile, setDriveFile] = useState(null);
  const [oneTapInitialized, setOneTapInitialized] = useState(false);
  const pickerLoadedRef = useRef(false);
  const oneTapRef = useRef(false);

  // Load API key from localStorage when session exists
  useEffect(() => {
    if (session) {
      const storedKey = localStorage.getItem('assemblyai_api_key');
      if (storedKey) {
        setApiKey(storedKey);
        fetchPastTranscriptions(storedKey);
      }
    }
  }, [session]);

  // Session monitoring for automatic token refresh
  useEffect(() => {
    if (!session) return;

    const checkSession = async () => {
      // Trigger session update which will automatically refresh token if needed
      await update();
    };

    // Check every 5 minutes
    const interval = setInterval(checkSession, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [session, update]);

  // Initialize Google One Tap
  useEffect(() => {
    if (status === 'loading' || status === 'authenticated' || oneTapInitialized || oneTapRef.current) return;

    const initializeOneTap = () => {
      if (!window.google?.accounts?.id) {
        console.log('Google Identity Services not loaded yet');
        return;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: handleOneTapCallback,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Show the One Tap prompt
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.log('One Tap not displayed:', notification.getNotDisplayedReason() || notification.getSkippedReason());
          }
        });

        oneTapRef.current = true;
        setOneTapInitialized(true);
        console.log('Google One Tap initialized');
      } catch (error) {
        console.error('Error initializing One Tap:', error);
      }
    };

    // Try to initialize immediately if script is loaded
    if (window.google?.accounts?.id) {
      initializeOneTap();
    } else {
      // Wait for script to load
      const checkInterval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(checkInterval);
          initializeOneTap();
        }
      }, 100);

      // Cleanup after 5 seconds
      setTimeout(() => clearInterval(checkInterval), 5000);

      return () => clearInterval(checkInterval);
    }
  }, [status, oneTapInitialized]);

  // Handle Google One Tap callback
  const handleOneTapCallback = async (response) => {
    try {
      console.log('One Tap callback received');
      
      // Use NextAuth's signIn with credentials provider
      const result = await signIn('google', {
        redirect: false,
        credential: response.credential,
      });

      if (result?.error) {
        console.error('One Tap sign in error:', result.error);
        setError('Login failed. Please try again.');
      } else {
        console.log('One Tap sign in successful');
      }
    } catch (error) {
      console.error('One Tap callback error:', error);
      setError('An error occurred during login.');
    }
  };

  // Handle manual Google sign in (fallback)
  const handleGoogleSignIn = async () => {
    try {
      await signIn('google', { redirect: false });
    } catch (error) {
      console.error('Google sign in error:', error);
      setError('Login failed. Please try again.');
    }
  };

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

  // Google Picker initialization
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
    
    if (session.error === "RefreshAccessTokenError") {
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
        
        const audioView = new google.picker.DocsView().setIncludeFolders(false).setSelectFolderEnabled(false).setMimeTypes('audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/aac,audio/flac,audio/x-m4a');
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
  
  const pollTranscriptionStatus = async (transcriptId) => {
    if (!apiKey) return;

    for (let i = 0; i < 200; i++) {
        setStatusMessage(`Polling for status... Attempt ${i + 1}`);
        const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
            headers: { 'Authorization': apiKey }
        });
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        
        const transcript = await response.json();
        if (transcript.status === 'completed') {
            return transcript;
        }
        if (transcript.status === 'error') {
            throw new Error(transcript.error || 'Transcription failed');
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error("Transcription timed out.");
  };
  
  const startTranscription = async () => {
    if (!apiKey) return setError('Please provide your AssemblyAI API key.');
    
    setError(null);
    setCurrentTranscript(null);
    let finalAudioUrl = audioUrl;
    let localDriveFile = driveFile;
    let localPermissionId = null;

    setTranscriptionTitle(driveFile ? driveFile.name : audioUrl.split('/').pop());

    try {
        if (localDriveFile) {
            setTranscriptionStatus('publishing');
            setStatusMessage('Preparing file from Google Drive...');
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

        setTranscriptionStatus('transcribing');
        setStatusMessage('Sending file to AssemblyAI for transcription...');
        const createResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': apiKey },
            body: JSON.stringify({ audio_url: finalAudioUrl, speaker_labels: true, language_code: 'nl' }),
        });
        if (!createResponse.ok) {
            const errorData = await createResponse.json();
            throw new Error(errorData.error || 'Failed to create transcription job.');
        }
        const newTranscript = await createResponse.json();

        setTranscriptionStatus('polling');
        const completedTranscript = await pollTranscriptionStatus(newTranscript.id);

        setCurrentTranscript(completedTranscript);
        setTranscriptionStatus('completed');
        setStatusMessage('Transcription complete!');
        fetchPastTranscriptions(apiKey);

    } catch (err) {
        console.error('Transcription process error:', err);
        setError(`Error: ${err.message}`);
        setTranscriptionStatus('error');
        setStatusMessage('An error occurred during transcription.');
    } finally {
        if (localDriveFile && localPermissionId) {
            try {
                await fetch('/api/drive/make-private', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId: localDriveFile.id, permissionId: localPermissionId }),
                });
            } catch (revokeError) {
                console.error('CRITICAL: Failed to revoke file permission:', revokeError);
                setError(prevError => `${prevError || ''} | WARNING: Failed to make the Google Drive file private again. Please check file permissions manually.`);
            }
        }
        setDriveFile(null);
    }
  };

  const fetchPastTranscriptions = async (key) => {
    if (!key) return;
    try {
      const response = await fetch('https://api.assemblyai.com/v2/transcript?limit=20&status=completed', {
        headers: { 'Authorization': key }
      });
      if (!response.ok) return;
      const data = await response.json();
      setPastTranscriptions(data.transcripts || []);
    } catch (err) {
      console.error('Error fetching past transcriptions:', err);
    }
  };

  const loadPastTranscription = async (transcriptId) => {
    setTranscriptionStatus('loading');
    setStatusMessage('Loading past transcript...');
    setError(null);
    try {
      const transcript = await pollTranscriptionStatus(transcriptId);
      setCurrentTranscript(transcript);
      setTranscriptionTitle(`Transcript ID: ${transcript.id}`);
      setTranscriptionStatus('completed');
      setStatusMessage('Past transcript loaded.');
    } catch (err) {
        setError(`Error loading transcription: ${err.message}`);
        setTranscriptionStatus('error');
    }
  };

  // Helper functions
  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const formatDate = (dateString) => new Date(dateString).toLocaleString();
  const getLanguageDisplay = (code) => {
    if (!code) return '🌐 Unknown';
    if (String(code).toLowerCase().startsWith('nl')) return '🇳🇱 Dutch';
    if (String(code).toLowerCase().startsWith('en')) return '🇬🇧 English';
    return `🌐 ${code}`;
  };

  const isTranscriptionDisabled = (!audioUrl && !driveFile) || !['idle', 'completed', 'error'].includes(transcriptionStatus);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
            <header className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-center mb-2">AssemblyAI Transcription Tool</h1>
                <p className="text-center text-gray-600">Transcribe audio/video from a public link or your Google Drive.</p>
            </header>

            {/* Authentication Status */}
            {session ? (
                <div className="bg-white rounded-lg shadow-lg p-4 mb-6 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <img src={session.user.image} alt="User profile" className="w-10 h-10 rounded-full" />
                        <div>
                            <p className="font-medium text-sm sm:text-base">{session.user.name}</p>
                            <p className="text-xs sm:text-sm text-gray-500">{session.user.email}</p>
                        </div>
                    </div>
                    <button onClick={() => signOut()} className="text-sm text-red-600 hover:text-red-700 font-medium">
                        Log Out
                    </button>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow-lg p-6 mb-6 text-center">
                    <h3 className="text-lg font-semibold mb-4">Welcome!</h3>
                    <p className="text-sm text-gray-600 mb-6">Log in with your Google account to get started. We'll show you a quick One Tap login if you're already signed in to Google.</p>
                    <button
                    onClick={handleGoogleSignIn}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 mx-auto"
                    >
                        <svg className="w-5 h-5" aria-hidden="true" focusable="false" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 256S109.8 0 244 0c73.2 0 136 29.1 181.2 73.2L375 152.1C341.3 120.3 296.8 97.9 244 97.9c-88.3 0-159.9 71.6-159.9 159.9s71.6 159.9 159.9 159.9c102.4 0 133.4-85.1 136.9-123.9H244v-75.1h236.1c2.3 12.7 3.9 26.1 3.9 40.8z"></path></svg>
                        Sign in with Google
                    </button>
                </div>
            )}

            {/* API Key Management */}
            {session && !apiKey && (
                <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                    <h3 className="text-lg font-semibold mb-2">Enter your AssemblyAI API Key</h3>
                    <p className="text-sm text-gray-600 mb-4">Your key is stored safely in your browser's local storage.</p>
                    <div className="flex items-center gap-2 mb-2">
                        <Key className="w-5 h-5 text-gray-400" />
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="Paste your API key here..."
                            className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={handleApiKeySave}
                            disabled={!apiKeyInput}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}

            {session && apiKey && (
              <>
                <div className="bg-white rounded-lg shadow-lg p-4 mb-6 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-sm">AssemblyAI API Key is configured</span>
                    </div>
                    <button onClick={handleApiKeyClear} className="text-red-600 hover:text-red-700" title="Remove API Key">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4">Start a New Transcription</h2>
                    {driveFile ? (
                        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className='flex items-center gap-2 overflow-hidden'>
                                <File className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                <span className='font-medium text-blue-800 truncate' title={driveFile.name}>{driveFile.name}</span>
                            </div>
                            <button onClick={() => setDriveFile(null)} className="text-gray-500 hover:text-gray-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center border border-gray-300 rounded-lg p-2 focus-within:ring-2 focus-within:ring-blue-500">
                                <Link className="w-5 h-5 mx-2 text-gray-400" />
                                <input
                                    type="text"
                                    value={audioUrl}
                                    onChange={(e) => setAudioUrl(e.target.value)}
                                    placeholder="Paste a public media URL here..."
                                    className="w-full bg-transparent outline-none"
                                />
                            </div>

                            <div className="relative flex py-4 items-center">
                                <div className="flex-grow border-t border-gray-300"></div>
                                <span className="flex-shrink mx-4 text-gray-500">OR</span>
                                <div className="flex-grow border-t border-gray-300"></div>
                            </div>

                            <button
                                onClick={handleChooseFromDrive}
                                className="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                            >
                               <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.75 22.5L1.5 12L7.75 1.5H20.5L24 7.5L17.75 18L13.75 11.25L7.75 22.5Z" fill="#2684FC"></path><path d="M1.5 12L4.625 17.25L10.875 6.75L7.75 1.5L1.5 12Z" fill="#00A85D"></path><path d="M20.5 1.5L13.75 11.25L17.75 18L24 7.5L20.5 1.5Z" fill="#FFC107"></path></svg>
                                Choose from Google Drive
                            </button>
                        </>
                    )}
                  {error && <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
                  <button
                    onClick={startTranscription}
                    disabled={isTranscriptionDisabled}
                    className="mt-6 w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors"
                  >
                    {transcriptionStatus !== 'idle' && transcriptionStatus !== 'completed' && transcriptionStatus !== 'error' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    Start Transcription
                  </button>
                  {transcriptionStatus !== 'idle' && <p className="text-center text-gray-600 mt-4 text-sm">{statusMessage}</p>}
                </div>

                {(transcriptionStatus === 'completed' && currentTranscript) && (
                  <TranscriptDisplay transcript={currentTranscript} title={transcriptionTitle} formatTime={formatTime} getLanguageDisplay={getLanguageDisplay} />
                )}
                
                <PastTranscriptionsList pastTranscriptions={pastTranscriptions} loadPastTranscription={loadPastTranscription} showPastTranscriptions={showPastTranscriptions} setShowPastTranscriptions={setShowPastTranscriptions} getLanguageDisplay={getLanguageDisplay} formatDate={formatDate} formatTime={formatTime} />
              </>
            )}
        </div>
    </div>
  );
};

const TranscriptDisplay = ({ transcript, title, formatTime, getLanguageDisplay }) => {
  const [copied, setCopied] = useState(false);
  const speakerColors = ['text-blue-600', 'text-green-600', 'text-purple-600', 'text-orange-600', 'text-pink-600', 'text-teal-600'];
  
  const handleCopy = () => {
    const textToCopy = transcript.utterances.map(u => `Speaker ${u.speaker} (${formatTime(u.start / 1000)}): ${u.text}`).join('\n\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = transcript.utterances.map(u => `Speaker ${u.speaker} (${formatTime(u.start / 1000)}): ${u.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${transcript.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div className="mb-4">
        <h3 className="text-xl font-semibold mb-1">Transcription Result</h3>
        {title && <p className="text-sm text-gray-500 truncate mb-2" title={title}>File: {title}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          <span>Language: {getLanguageDisplay(transcript.language_code)}</span>
          <span>Duration: {formatTime(transcript.audio_duration)}</span>
          <span>Words: {transcript.words?.length || 0}</span>
        </div>
      </div>
      <div className="space-y-3 max-h-[50vh] overflow-y-auto p-3 bg-gray-50 rounded-md border">
        {transcript.utterances?.map((utterance, index) => (
          <div key={index} className="flex flex-col sm:flex-row gap-2 sm:gap-3 p-2 hover:bg-gray-100 rounded">
            <div className="flex items-center gap-2 min-w-max">
              <User className={`w-5 h-5 ${speakerColors[utterance.speaker.charCodeAt(0) % speakerColors.length]}`} />
              <span className={`font-semibold ${speakerColors[utterance.speaker.charCodeAt(0) % speakerColors.length]}`}>Speaker {utterance.speaker}</span>
              <span className="text-xs text-gray-500">({formatTime(utterance.start / 1000)})</span>
            </div>
            <p className="text-gray-800 flex-1">{utterance.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t flex items-center gap-4">
        <button onClick={handleCopy} className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1.5 transition-colors">
          {copied ? <><ClipboardCheck className="w-4 h-4 text-green-600" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Transcript</>}
        </button>
        <button onClick={handleDownload} className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1.5">
          <Upload className="w-4 h-4" /> Download
        </button>
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
        {pastTranscriptions.length === 0 ? <p className="text-gray-500 text-center py-4">No past transcriptions found.</p> : pastTranscriptions.map((transcript) => (
          <div key={transcript.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer" onClick={() => loadPastTranscription(transcript.id)}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex-1">
                <p className="font-medium text-gray-800">{getLanguageDisplay(transcript.language_code)} Transcription</p>
                <p className="text-sm text-gray-600">{formatDate(transcript.created)}</p>
              </div>
              <div className="text-left sm:text-right w-full sm:w-auto">
                <p className="text-sm text-gray-600">Duration: {formatTime(transcript.audio_duration || 0)}</p>
                <p className="text-sm mt-1">
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
