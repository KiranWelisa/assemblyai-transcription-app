// components/AssemblyAITranscription.js
import React, { useState, useEffect, useRef } from 'react';
import { Upload, Link, Loader2, User, X, File, Copy, Check, Download, Settings, Moon, Sun, Search, SlidersHorizontal, Tag as TagIcon, Plus, Sparkles, RefreshCw, ChevronDown, Filter, Trash2, AlertTriangle, Clock } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import DropZone from './upload/DropZone';
import TranscriptionCard from './transcriptions/TranscriptionCard';
import RecentlyAdded from './transcriptions/RecentlyAdded';
import ActiveTranscription from './transcriptions/ActiveTranscription';
import NewBadge from './transcriptions/NewBadge';

const AssemblyAITranscription = () => {
  const { data: session, status, update } = useSession();

  // State
  const [darkMode, setDarkMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [showResyncProgress, setShowResyncProgress] = useState(false);
  const [resyncProgress, setResyncProgress] = useState({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
  const [selectedTranscript, setSelectedTranscript] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [transcriptionStatus, setTranscriptionStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [currentTranscript, setCurrentTranscript] = useState(null);
  const [currentTranscriptionId, setCurrentTranscriptionId] = useState(null);
  const [transcriptionTitle, setTranscriptionTitle] = useState('');
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [pastTranscriptions, setPastTranscriptions] = useState([]);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [driveFile, setDriveFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [filterTag, setFilterTag] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ synced: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [processingTitles, setProcessingTitles] = useState(false);
  const [transcriptionStartTime, setTranscriptionStartTime] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [activeFileName, setActiveFileName] = useState('');

  const pickerLoadedRef = useRef(false);
  const oneTapRef = useRef(false);
  const titlePollingRef = useRef(null);
  const backgroundPollingRef = useRef(null);
  const titleProcessedRef = useRef(false); // Voorkom dubbele calls

  // Dark mode
  useEffect(() => {
    const isDark = localStorage.getItem('darkMode') === 'true' || 
      (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkMode(isDark);
    if (isDark) document.documentElement.classList.add('dark');
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Load API key
  useEffect(() => {
    if (session) {
      const storedKey = localStorage.getItem('assemblyai_api_key');
      if (storedKey) {
        setApiKey(storedKey);
        fetchPastTranscriptions();
      }
    }
  }, [session]);

  // 🆕 AUTO-PROCESS PENDING TITLES wanneer component laadt
  useEffect(() => {
    // Alleen uitvoeren als:
    // 1. We een API key hebben
    // 2. We transcripties hebben geladen
    // 3. We dit nog niet hebben gedaan (voorkom dubbele calls)
    if (apiKey && pastTranscriptions.length > 0 && !titleProcessedRef.current) {
      const untitledCount = pastTranscriptions.filter(t => t.titleGenerating === true).length;
      
      if (untitledCount > 0) {
        console.log(`🔍 Found ${untitledCount} transcriptions without titles, starting background processing...`);
        titleProcessedRef.current = true; // Mark als verwerkt
        processPendingTitles();
      }
    }
  }, [apiKey, pastTranscriptions]);

  // 🆕 PROCES PENDING TITLES via nieuwe endpoint
  const processPendingTitles = async () => {
    if (!apiKey || processingTitles) return;
    
    setProcessingTitles(true);
    
    try {
      const response = await fetch('/api/transcriptions/process-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          assemblyAiKey: apiKey,
          maxItems: 10 // Process maximaal 10 items per keer
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process titles');
      }

      const data = await response.json();
      console.log(`✅ Queued ${data.queued} titles for background generation`);
      
      // Start polling om updates te zien
      if (data.queued > 0) {
        startTitleUpdatePolling();
      }
    } catch (error) {
      console.error('Error processing pending titles:', error);
    } finally {
      setProcessingTitles(false);
    }
  };

  // 🆕 POLL voor title updates (lichtere polling dan background polling)
  const startTitleUpdatePolling = () => {
    if (titlePollingRef.current) clearInterval(titlePollingRef.current);
    
    let pollCount = 0;
    const maxPolls = 30; // Max 1 minuut polling (30 * 2 sec)
    
    titlePollingRef.current = setInterval(async () => {
      pollCount++;
      
      // Refresh transcriptions lijst
      await fetchPastTranscriptions();
      
      // Check of er nog untitled transcriptions zijn
      const untitledCount = pastTranscriptions.filter(t => t.titleGenerating === true).length;
      
      // Stop als alles verwerkt is of max bereikt
      if (untitledCount === 0 || pollCount >= maxPolls) {
        clearInterval(titlePollingRef.current);
        titlePollingRef.current = null;
        console.log('✅ Title polling stopped');
      }
    }, 2000); // Poll elke 2 seconden
  };

  // Session refresh
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => update(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session, update]);

  // Google One Tap
  useEffect(() => {
    if (status === 'loading' || status === 'authenticated' || oneTapRef.current) return;

    const initializeOneTap = () => {
      if (!window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: handleOneTapCallback,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.prompt();
        oneTapRef.current = true;
      } catch (error) {
        console.error('Error initializing One Tap:', error);
      }
    };

    if (window.google?.accounts?.id) {
      initializeOneTap();
    } else {
      const checkInterval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(checkInterval);
          initializeOneTap();
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 5000);
      return () => clearInterval(checkInterval);
    }
  }, [status]);

  const handleOneTapCallback = async (response) => {
    try {
      const result = await signIn('google', { redirect: false, credential: response.credential });
      if (result?.error) setError('Login failed. Please try again.');
    } catch (error) {
      setError('An error occurred during login.');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signIn('google', { redirect: false });
    } catch (error) {
      setError('Login failed. Please try again.');
    }
  };

  const handleApiKeySave = () => {
    if (apiKeyInput) {
      localStorage.setItem('assemblyai_api_key', apiKeyInput);
      setApiKey(apiKeyInput);
      setApiKeyInput('');
      titleProcessedRef.current = false; // Reset voor nieuwe API key
      fetchPastTranscriptions();
      setShowSettings(false);
    }
  };

  const handleApiKeyClear = () => {
    localStorage.removeItem('assemblyai_api_key');
    setApiKey('');
    setPastTranscriptions([]);
    titleProcessedRef.current = false;
  };

  // Google Picker
  useEffect(() => {
    if (document.querySelector('script#google-api-script')) return;
    const script = document.createElement('script');
    script.id = 'google-api-script';
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.gapi) {
        window.gapi.load('picker', {
          callback: () => { pickerLoadedRef.current = true; },
          onerror: () => console.error('Failed to load Google Picker library')
        });
      }
    };
    document.head.appendChild(script);
    return () => {
      const scriptEl = document.querySelector('script#google-api-script');
      if (scriptEl) scriptEl.remove();
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
      setError('Google configuratie ontbreekt.');
      return;
    }
    if (!window.gapi || !pickerLoadedRef.current) {
      setError('Google API wordt nog geladen.');
      return;
    }
    
    const pickerCallback = (data) => {
      if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        setDriveFile({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
        setAudioUrl('');
        setError(null);
      }
    };
    
    try {
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
      setError('Er ging iets mis bij het openen van de Google Picker.');
    }
  };

  // Sync from AssemblyAI
  const handleSync = async () => {
    if (!apiKey || syncing) return;
    
    setSyncing(true);
    setSyncProgress({ synced: 0, total: 0 });
    
    try {
      const response = await fetch('/api/transcriptions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assemblyAiKey: apiKey }),
      });

      if (!response.ok) throw new Error('Sync failed');

      const data = await response.json();
      setSyncProgress({ synced: data.synced, total: data.total });
      
      await fetchPastTranscriptions();
      
      // Reset title processing flag zodat nieuwe items verwerkt worden
      titleProcessedRef.current = false;
      
      setTimeout(() => setSyncing(false), 2000);
    } catch (error) {
      console.error('Sync error:', error);
      setError('Failed to sync transcriptions');
      setSyncing(false);
    }
  };

  // Background polling for new transcriptions
  const startBackgroundPolling = () => {
    if (backgroundPollingRef.current) clearInterval(backgroundPollingRef.current);
    
    backgroundPollingRef.current = setInterval(() => {
      fetchPastTranscriptions();
    }, 3000);
  };

  const stopBackgroundPolling = () => {
    if (backgroundPollingRef.current) {
      clearInterval(backgroundPollingRef.current);
      backgroundPollingRef.current = null;
    }
  };

  // NIEUWE CLIENT-SIDE BATCH ORCHESTRATION voor Purge & Re-sync
  const handlePurgeAndResync = async () => {
    if (!apiKey) return;
    
    setShowPurgeConfirm(false);
    setShowSettings(false);
    setShowResyncProgress(true);
    setResyncProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    titleProcessedRef.current = false;

    try {
      // ==========================================
      // FASE 1: QUICK SYNC (insert placeholders)
      // ==========================================
      console.log('🚀 Phase 1: Quick Sync starting...');
      
      const initResponse = await fetch('/api/transcriptions/init-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assemblyAiKey: apiKey }),
      });

      if (!initResponse.ok) {
        const errorData = await initResponse.json();
        throw new Error(errorData.error || 'Failed to initialize sync');
      }

      const initData = await initResponse.json();
      const { ids, total } = initData;

      if (total === 0) {
        setShowResyncProgress(false);
        setError('Geen transcripties gevonden in AssemblyAI');
        return;
      }

      console.log(`✅ Phase 1 complete! Found ${total} transcripts`);
      
      // Refresh UI om placeholders te tonen
      await fetchPastTranscriptions();

      // ==========================================
      // FASE 2: PROGRESSIVE ENRICHMENT (batches)
      // ==========================================
      console.log('🔄 Phase 2: Progressive Enrichment starting...');
      
      const BATCH_SIZE = 3; // 3 items per batch (veilig binnen 10s)
      const totalBatches = Math.ceil(total / BATCH_SIZE);

      setResyncProgress({ 
        current: 0, 
        total, 
        currentBatch: 0, 
        totalBatches 
      });

      // Start background polling voor real-time updates
      startBackgroundPolling();

      let enrichedCount = 0;

      for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
        const startIdx = (batchNum - 1) * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, total);
        const batchIds = ids.slice(startIdx, endIdx);

        console.log(`📦 Enriching batch ${batchNum}/${totalBatches}: ${batchIds.length} items`);
        
        setResyncProgress(prev => ({ 
          ...prev, 
          currentBatch: batchNum 
        }));

        const enrichResponse = await fetch('/api/transcriptions/enrich-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            assemblyAiKey: apiKey,
            transcriptIds: batchIds,
          }),
        });

        if (!enrichResponse.ok) {
          const errorData = await enrichResponse.json();
          console.error(`❌ Batch ${batchNum} failed:`, errorData.error);
          // Continue met volgende batch (don't fail entire process)
          continue;
        }

        const enrichData = await enrichResponse.json();
        enrichedCount += enrichData.successful;

        setResyncProgress(prev => ({ 
          ...prev, 
          current: enrichedCount 
        }));

        console.log(`✅ Batch ${batchNum}/${totalBatches} complete: ${enrichData.successful}/${batchIds.length} successful`);

        // Refresh UI na elke batch
        await fetchPastTranscriptions();

        // Kleine delay tussen batches (optional, voor UI smoothness)
        if (batchNum < totalBatches) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Stop background polling
      stopBackgroundPolling();
      
      // Final refresh
      await fetchPastTranscriptions();

      // Hide progress toast na 2 seconden
      setTimeout(() => {
        setShowResyncProgress(false);
        setResyncProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
      }, 2000);

      console.log(`🎉 Re-sync complete! ${enrichedCount}/${total} transcripts enriched`);

    } catch (error) {
      console.error('❌ Purge and re-sync error:', error);
      setError(error.message || 'An error occurred during purge and re-sync');
      setShowResyncProgress(false);
      stopBackgroundPolling();
    }
  };

  // Cleanup polling intervals
  useEffect(() => {
    return () => {
      if (titlePollingRef.current) clearInterval(titlePollingRef.current);
      if (backgroundPollingRef.current) clearInterval(backgroundPollingRef.current);
    };
  }, []);

  const pollTranscriptionStatus = async (transcriptId) => {
    if (!apiKey) return;
    setPollCount(0);
    for (let i = 0; i < 200; i++) {
      setPollCount(i + 1);
      setStatusMessage(`Transcribing... ${i + 1}`);
      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'Authorization': apiKey }
      });
      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
      const transcript = await response.json();
      if (transcript.status === 'completed') return transcript;
      if (transcript.status === 'error') throw new Error(transcript.error || 'Transcription failed');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error("Transcription timed out.");
  };

  const startTranscription = async () => {
    if (!apiKey) return setError('Please provide your AssemblyAI API key.');
    setError(null);
    setCurrentTranscript(null);
    setCurrentTranscriptionId(null);
    setTranscriptionStartTime(Date.now());
    setPollCount(0);
    let finalAudioUrl = audioUrl;
    let localDriveFile = driveFile;
    let localPermissionId = null;
    const fileName = driveFile ? driveFile.name : audioUrl.split('/').pop();
    setActiveFileName(fileName);

    try {
      if (localDriveFile) {
        setTranscriptionStatus('publishing');
        setStatusMessage('Preparing file...');
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

      if (!finalAudioUrl) return setError('Please provide a URL or select a file from Google Drive.');

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

      try {
        const saveResponse = await fetch('/api/transcriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assemblyAiId: completedTranscript.id,
            fileName: fileName,
            language: completedTranscript.language_code,
            duration: completedTranscript.audio_duration,
            wordCount: completedTranscript.words?.length || 0,
            transcript: completedTranscript,
          }),
        });

        if (saveResponse.ok) {
          const { transcription } = await saveResponse.json();
          setCurrentTranscriptionId(transcription.id);
          setTranscriptionTitle('Generating title...');
          setTitleGenerating(true);

          fetch('/api/transcriptions/generate-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcriptionId: transcription.id, transcript: completedTranscript }),
          });

          startTitleUpdatePolling();
          fetchPastTranscriptions();
        }
      } catch (dbError) {
        console.error('Error saving to database:', dbError);
      }

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
        }
      }
      setDriveFile(null);
    }
  };

  const fetchPastTranscriptions = async () => {
    try {
      const response = await fetch('/api/transcriptions');
      if (!response.ok) return;
      const data = await response.json();
      setPastTranscriptions(data.transcriptions || []);
      
      const tags = new Set();
      data.transcriptions.forEach(t => {
        if (t.tags) t.tags.forEach(tag => tags.add(tag));
        if (t.language) tags.add(getLanguageTag(t.language));
      });
      setAllTags(Array.from(tags));
    } catch (err) {
      console.error('Error fetching past transcriptions:', err);
    }
  };

  const loadTranscript = async (transcription) => {
    if (!apiKey) return;
    try {
      const response = await fetch(`/api/assemblyai/transcript/${transcription.assemblyAiId}`, {
        headers: { 'x-assemblyai-key': apiKey }
      });

      if (!response.ok) throw new Error('Failed to load transcript');
      const transcript = await response.json();

      setSelectedTranscript({ ...transcription, fullTranscript: transcript });
      setShowModal(true);

      // Mark as viewed if it's a new transcription
      if (transcription.isNew) {
        try {
          await fetch(`/api/transcriptions/${transcription.id}/mark-viewed`, {
            method: 'POST'
          });
          // Update local state
          setPastTranscriptions(prev =>
            prev.map(t =>
              t.id === transcription.id ? { ...t, isNew: false, viewedAt: new Date().toISOString() } : t
            )
          );
        } catch (err) {
          console.error('Failed to mark as viewed:', err);
        }
      }
    } catch (err) {
      setError(`Error loading transcription: ${err.message}`);
    }
  };

  // Helper functions
  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    return new Date(dateString).toLocaleString('nl-NL', { 
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };
  
  const getLanguageTag = (code) => {
    if (!code) return 'Unknown';
    if (String(code).toLowerCase().startsWith('nl')) return 'Dutch';
    if (String(code).toLowerCase().startsWith('en')) return 'English';
    return code;
  };

  const getLanguageEmoji = (code) => {
    if (!code) return '🌐';
    if (String(code).toLowerCase().startsWith('nl')) return '🇳🇱';
    if (String(code).toLowerCase().startsWith('en')) return '🇬🇧';
    return '🌐';
  };

  const handleCopy = () => {
    if (!selectedTranscript?.fullTranscript?.utterances) return;
    const text = selectedTranscript.fullTranscript.utterances
      .map(u => `Speaker ${u.speaker} (${formatTime(u.start / 1000)}): ${u.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!selectedTranscript?.fullTranscript?.utterances) return;
    const text = selectedTranscript.fullTranscript.utterances
      .map(u => `Speaker ${u.speaker} (${formatTime(u.start / 1000)}): ${u.text}`)
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${selectedTranscript.assemblyAiId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter and sort
  const filteredTranscriptions = pastTranscriptions
    .filter(t => {
      if (t.duration === null || t.duration === undefined) return false;
      if (!t.preview && t.preview !== '') return false;
      if (searchQuery && !t.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterTag && !t.tags?.includes(filterTag) && getLanguageTag(t.language) !== filterTag) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = a.assemblyCreatedAt ? new Date(a.assemblyCreatedAt) : new Date(a.createdAt);
        const dateB = b.assemblyCreatedAt ? new Date(b.assemblyCreatedAt) : new Date(b.createdAt);
        return dateB - dateA;
      }
      if (sortBy === 'duration') return (b.duration || 0) - (a.duration || 0);
      if (sortBy === 'alphabetical') return (a.title || '').localeCompare(b.title || '');
      return 0;
    });

  const isTranscriptionDisabled = (!audioUrl && !driveFile) || !['idle', 'completed', 'error'].includes(transcriptionStatus);

  // Handle session loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }

  // Handle unauthenticated state
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Transcription Hub</h1>
            <p className="text-gray-600 dark:text-gray-400">Sign in to get started</p>
          </div>
          <button
            onClick={handleGoogleSignIn}
            className="w-full px-6 py-3 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center justify-center gap-3 transition-all font-medium shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 256S109.8 0 244 0c73.2 0 136 29.1 181.2 73.2L375 152.1C341.3 120.3 296.8 97.9 244 97.9c-88.3 0-159.9 71.6-159.9 159.9s71.6 159.9 159.9 159.9c102.4 0 133.4-85.1 136.9-123.9H244v-75.1h236.1c2.3 12.7 3.9 26.1 3.9 40.8z"></path></svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // At this point, session and session.user are guaranteed to exist
  if (!apiKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">API Key Required</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Enter your AssemblyAI API key to continue</p>
          </div>
          
          <a
            href="https://www.assemblyai.com/dashboard/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full mb-4 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
          >
            <div className="flex items-center justify-center gap-3">
              <Upload className="w-5 h-5" />
              <div className="text-left">
                <div className="font-semibold">Get Your Free API Key</div>
                <div className="text-sm text-blue-100">Sign up at AssemblyAI</div>
              </div>
            </div>
          </a>

          <div className="space-y-3">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Paste your API key here..."
              className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleApiKeySave}
              disabled={!apiKeyInput}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 transition-all font-medium shadow-sm"
            >
              Save API Key
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Transcription Hub</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Powered by AssemblyAI</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun className="w-5 h-5 text-gray-600 dark:text-gray-300" /> : <Moon className="w-5 h-5 text-gray-600" />}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-gray-700">
              {/* Safe to access session.user.image and session.user.name here */}
              <img src={session.user.image} alt="Profile" className="w-8 h-8 rounded-full" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">{session.user.name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Section: Upload + Recently Added/Active Transcription side by side */}
        {(() => {
          const hasNewItems = pastTranscriptions.some(t => t.isNew && t.duration !== null);
          const hasActiveTranscription = transcriptionStatus !== 'idle' && transcriptionStatus !== 'completed' && transcriptionStatus !== 'error';
          const showRightColumn = hasNewItems || hasActiveTranscription;
          return (
        <div className={`grid gap-6 mb-8 ${showRightColumn ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* New Transcription Section with DropZone */}
          <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 ${!showRightColumn ? 'max-w-3xl mx-auto w-full' : ''}`}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              New Transcription
            </h2>

            {/* Drag & Drop Zone */}
            <DropZone
              session={session}
              disabled={transcriptionStatus !== 'idle' && transcriptionStatus !== 'completed' && transcriptionStatus !== 'error'}
              onFileSelect={(file) => {
                setDriveFile(file);
                setAudioUrl('');
                setError(null);
              }}
              onUploadComplete={(file) => {
                // Auto-start transcription after successful upload
                setDriveFile(file);
                setTimeout(() => startTranscription(), 500);
              }}
            />

            {/* OR divider */}
            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
              <span className="flex-shrink mx-4 text-sm text-gray-500 dark:text-gray-400">OR</span>
              <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
            </div>

            {/* Selected file or Drive picker */}
            <div className="space-y-3">
              {driveFile ? (
                <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <File className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span className="font-medium text-blue-900 dark:text-blue-100 truncate">{driveFile.name}</span>
                  </div>
                  <button onClick={() => setDriveFile(null)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleChooseFromDrive}
                  className="w-full bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2.5 px-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-2 font-medium text-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M7.75 22.5L1.5 12L7.75 1.5H20.5L24 7.5L17.75 18L13.75 11.25L7.75 22.5Z" fill="#2684FC"></path><path d="M1.5 12L4.625 17.25L10.875 6.75L7.75 1.5L1.5 12Z" fill="#00A85D"></path><path d="M20.5 1.5L13.75 11.25L17.75 18L24 7.5L20.5 1.5Z" fill="#FFC107"></path></svg>
                  Or choose from Google Drive
                </button>
              )}
            </div>

            {error && <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>}

            {driveFile && (
              <button
                onClick={startTranscription}
                disabled={!driveFile || !['idle', 'completed', 'error'].includes(transcriptionStatus)}
                className="mt-4 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 flex items-center justify-center gap-2 transition-all font-medium shadow-lg disabled:shadow-none"
              >
                {transcriptionStatus !== 'idle' && transcriptionStatus !== 'completed' && transcriptionStatus !== 'error' ?
                  <Loader2 className="w-5 h-5 animate-spin" /> :
                  <Upload className="w-5 h-5" />
                }
                {transcriptionStatus !== 'idle' ? statusMessage : 'Start Transcription'}
              </button>
            )}
          </div>

          {/* Right column: Active Transcription and/or Recently Added */}
          <div className="space-y-4">
            {/* Active Transcription Progress */}
            {transcriptionStatus !== 'idle' && transcriptionStatus !== 'completed' && transcriptionStatus !== 'error' && (
              <ActiveTranscription
                status={transcriptionStatus}
                fileName={activeFileName}
                pollCount={pollCount}
                startTime={transcriptionStartTime}
              />
            )}

            {/* Recently Added Section */}
            <RecentlyAdded
              transcriptions={pastTranscriptions}
              onSelect={loadTranscript}
              onClearAll={async () => {
                try {
                  await fetch('/api/transcriptions/mark-all-viewed', { method: 'POST' });
                  // Update local state
                  setPastTranscriptions(prev =>
                    prev.map(t => t.isNew ? { ...t, isNew: false, viewedAt: new Date().toISOString() } : t)
                  );
                } catch (err) {
                  console.error('Failed to clear all:', err);
                }
              }}
              formatDate={formatDate}
              maxItems={5}
            />
          </div>
        </div>
          );
        })()}

        {/* Section Header with Search & Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              All Transcriptions
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filteredTranscriptions.length} items
            </span>
            {pastTranscriptions.filter(t => t.isNew).length > 0 && (
              <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {pastTranscriptions.filter(t => t.isNew).length} new
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex-1 sm:flex-initial relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="date">Date</option>
              <option value="duration">Duration</option>
              <option value="alphabetical">A-Z</option>
            </select>

            {allTags.length > 0 && (
              <select
                value={filterTag || ''}
                onChange={(e) => setFilterTag(e.target.value || null)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">All Languages</option>
                {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Transcriptions Grid */}
        {filteredTranscriptions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full mx-auto mb-4 flex items-center justify-center">
              <File className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No transcriptions yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Create your first transcription or sync from AssemblyAI</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {filteredTranscriptions.map((transcription, index) => (
              <div
                key={transcription.id}
                className="grid-item-enter"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                <TranscriptionCard
                  transcription={transcription}
                  onClick={loadTranscript}
                  formatTime={formatTime}
                  formatDate={formatDate}
                  getLanguageEmoji={getLanguageEmoji}
                  getLanguageTag={getLanguageTag}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Settings Panel */}
      {showSettings && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowSettings(false)}></div>
          <div className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {/* Sync Section */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  Sync from AssemblyAI
                </h3>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="w-full mb-3 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 transition-all font-medium flex items-center justify-center gap-2"
                >
                  {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  {syncing ? 'Syncing...' : 'Sync New Transcriptions'}
                </button>
                
                <button
                  onClick={() => setShowPurgeConfirm(true)}
                  disabled={syncing}
                  className="w-full px-4 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 disabled:bg-gray-400 transition-all font-medium flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Purge & Re-sync All
                </button>
                
                {syncing && syncProgress.total > 0 && (
                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center">
                    Synced {syncProgress.synced} of {syncProgress.total} transcriptions
                  </div>
                )}
                
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Purge & Re-sync verwijdert al je lokale transcripties en haalt ze opnieuw op van AssemblyAI met bijgewerkte metadata.
                </p>
              </div>
              
              {/* API Key Section */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">API Key</h3>
                <div className="space-y-3">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Enter new API key..."
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleApiKeySave}
                    disabled={!apiKeyInput}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 transition-all font-medium"
                  >
                    Update API Key
                  </button>
                  <button
                    onClick={handleApiKeyClear}
                    className="w-full px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all font-medium"
                  >
                    Clear API Key
                  </button>
                </div>
              </div>
              
              {/* Account Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account</h3>
                <button
                  onClick={() => signOut()}
                  className="w-full px-4 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-all font-medium"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Purge Confirmation Modal */}
      {showPurgeConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={() => setShowPurgeConfirm(false)}></div>
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full animate-slideUp">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Purge & Re-sync?</h3>
              </div>
              
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Dit verwijdert alle lokale transcripties en haalt ze opnieuw op van AssemblyAI. Je ziet real-time voortgang terwijl transcripties worden gesynchroniseerd.
              </p>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-6">
                <p className="text-sm text-blue-900 dark:text-blue-100 flex items-start gap-2">
                  <RefreshCw className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Het proces gebeurt in kleine batches om binnen de 10 seconden timeout van Vercel Hobby plan te blijven. Titels worden automatisch gegenereerd zodra transcripties zijn gesynchroniseerd.
                  </span>
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPurgeConfirm(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurgeAndResync}
                  className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all font-medium flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Purge & Re-sync
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Re-sync Progress Toast */}
      {showResyncProgress && (
        <div className="fixed bottom-6 right-6 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 z-50 border border-gray-200 dark:border-gray-700 max-w-md animate-slideUp">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <div className="flex-1">
              {resyncProgress.currentBatch === 0 ? (
                <>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                    Initializing sync...
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Fetching transcript IDs from AssemblyAI
                  </p>
                </>
              ) : (
                <>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                    Enriching transcripts...
                  </h4>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                      <span>Batch {resyncProgress.currentBatch} van {resyncProgress.totalBatches}</span>
                      <span className="font-medium">{resyncProgress.current} / {resyncProgress.total}</span>
                    </div>
                    
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-300 ease-out"
                        style={{ 
                          width: `${resyncProgress.total > 0 ? (resyncProgress.current / resyncProgress.total) * 100 : 0}%` 
                        }}
                      ></div>
                    </div>
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Metadata wordt geladen. Titels worden gegenereerd in de achtergrond.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transcript Modal */}
      {showModal && selectedTranscript && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowModal(false)}></div>
          <div className="fixed inset-4 sm:inset-10 lg:inset-20 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {selectedTranscript.title || 'Untitled Transcription'}
                </h2>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>{getLanguageEmoji(selectedTranscript.language)} {getLanguageTag(selectedTranscript.language)}</span>
                  <span>•</span>
                  <span>{formatTime(selectedTranscript.duration || 0)}</span>
                  <span>•</span>
                  <span>{selectedTranscript.wordCount || 0} words</span>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {selectedTranscript.fullTranscript?.utterances?.map((utterance, index) => {
                const speakerColors = ['text-blue-600', 'text-green-600', 'text-purple-600', 'text-orange-600', 'text-pink-600', 'text-teal-600'];
                const colorClass = speakerColors[utterance.speaker.charCodeAt(0) % speakerColors.length];
                return (
                  <div key={index} className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div className="flex items-center gap-2 mb-2">
                      <User className={`w-4 h-4 ${colorClass}`} />
                      <span className={`font-semibold ${colorClass}`}>Speaker {utterance.speaker}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">({formatTime(utterance.start / 1000)})</span>
                    </div>
                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed">{utterance.text}</p>
                  </div>
                );
              })}
            </div>
            
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4">
              <button
                onClick={handleCopy}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium flex items-center justify-center gap-2 shadow-lg"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? 'Copied!' : 'Copy Transcript'}
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-medium flex items-center justify-center gap-2 shadow-lg"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
            </div>
          </div>
        </>
      )}

      {/* Sync Progress Toast */}
      {syncing && (
        <div className="fixed bottom-6 right-6 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 z-50 flex items-center gap-3 border border-gray-200 dark:border-gray-700">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <div>
            <div className="font-medium text-gray-900 dark:text-white">Syncing transcriptions...</div>
            {syncProgress.total > 0 && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {syncProgress.synced} of {syncProgress.total}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssemblyAITranscription;
