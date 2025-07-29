import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Mic, Globe, Clock, User, ChevronDown, ChevronUp, Loader2, FileAudio, CheckCircle, AlertCircle } from 'lucide-react';

const AssemblyAITranscription = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [language, setLanguage] = useState('nl');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcriptionStatus, setTranscriptionStatus] = useState('idle');
  const [currentTranscriptId, setCurrentTranscriptId] = useState(null);
  const [currentTranscript, setCurrentTranscript] = useState(null);
  const [pastTranscriptions, setPastTranscriptions] = useState([]);
  const [showPastTranscriptions, setShowPastTranscriptions] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Use the API proxy URL from environment or default
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/proxy';

  // Helper function to detect language from language code
  const getLanguageDisplay = (languageCode) => {
    try {
      if (!languageCode) return '🌐 Unknown';
      
      const code = String(languageCode).toLowerCase();
      
      // Check for Dutch variations (nl, nl_nl, etc.)
      if (code === 'nl' || code === 'nl_nl' || code.startsWith('nl')) {
        return '🇳🇱 Dutch';
      }
      
      // Check for English variations (en, en_us, en_gb, etc.)
      if (code === 'en' || code === 'en_us' || code === 'en_gb' || code === 'en_uk' || code.startsWith('en')) {
        return '🇬🇧 English';
      }
      
      // Default fallback - show the original code
      return '🌐 ' + languageCode;
    } catch (err) {
      console.error('Error in getLanguageDisplay:', err);
      return '🌐 Unknown';
    }
  };

  // File Upload Handler
  const handleFileSelect = (file) => {
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
      setSelectedFile(file);
      setError(null);
    } else {
      setError('Please select a valid audio or video file');
    }
  };

  // Drag and Drop Handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  // Upload file to AssemblyAI
  const uploadFile = async (file) => {
    setUploadProgress(0);
    setTranscriptionStatus('uploading');

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: file
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      return data.upload_url;
    } catch (err) {
      setError(`Failed to upload file: ${err.message}`);
      setTranscriptionStatus('idle');
      throw err;
    }
  };

  // Create transcription
  // Update the createTranscription function to ensure language_code is sent properly:
  
  const createTranscription = async (audioUrl) => {
    setTranscriptionStatus('transcribing');
  
    try {
      // Prepare the request body with proper language_code
      const requestBody = {
        audio_url: audioUrl,
        language_code: language, // This should be 'nl' or 'en' based on user selection
        speaker_labels: true,
        speech_model: 'universal',
        punctuate: true,
        format_text: true
      };
      
      console.log('Creating transcription with request body:', requestBody);
  
      const response = await fetch(`${API_BASE_URL}/transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create transcription');
      }
  
      const data = await response.json();
      console.log('Transcription created with response:', data);
      return data;
    } catch (err) {
      setError(`Failed to create transcription: ${err.message}`);
      setTranscriptionStatus('idle');
      throw err;
    }
  };

  // Update the pollTranscriptionStatus function with better error handling:
  
  const pollTranscriptionStatus = async (transcriptId) => {
    let attempts = 0;
    const maxAttempts = 200; // ~10 minutes with 3 second intervals
  
    while (attempts < maxAttempts) {
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
  
        // Update status
        setTranscriptionStatus(transcript.status || 'processing');
  
        // Wait 3 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 3000));
        attempts++;
      } catch (err) {
        const message = err.message || 'Error checking transcription status';
        setError(`Error checking transcription status: ${message}`);
        setTranscriptionStatus('idle');
        throw err;
      }
    }
  
    throw new Error('Transcription timeout - please try again');
  };

  // Start transcription process
  const startTranscription = async () => {
    if (!selectedFile) return;

    setError(null);
    
    try {
      // Upload file
      const uploadUrl = await uploadFile(selectedFile);
      
      // Create transcription
      const transcript = await createTranscription(uploadUrl);
      setCurrentTranscriptId(transcript.id);
      
      // Poll for completion
      await pollTranscriptionStatus(transcript.id);
      
      // Refresh past transcriptions
      fetchPastTranscriptions();
    } catch (err) {
      console.error('Transcription error:', err);
    }
  };

  // Fetch past transcriptions
  const fetchPastTranscriptions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/transcript?limit=20`);

      if (!response.ok) {
        console.error('Failed to fetch transcriptions, status:', response.status);
        throw new Error('Failed to fetch transcriptions');
      }

      const data = await response.json();
      console.log('Fetched transcriptions:', data); // Debug log
      setPastTranscriptions(data.transcripts || []);
    } catch (err) {
      console.error('Error fetching past transcriptions:', err);
      // Don't show error for past transcriptions fetch
    }
  };

  // Load a past transcription
  const loadPastTranscription = async (transcriptId) => {
    setCurrentTranscriptId(transcriptId);
    setTranscriptionStatus('loading');
    try {
      await pollTranscriptionStatus(transcriptId);
    } catch (err) {
      console.error('Error loading transcription:', err);
    }
  };

  // Format time from seconds
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Transcript Display Component
  const TranscriptDisplay = ({ transcript }) => {
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
                <span className={`font-medium ${speakerColors[utterance.speaker.charCodeAt(0) % 4]}`}>
                  Speaker {utterance.speaker}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-gray-800">{utterance.text}</p>
                <span className="text-xs text-gray-500">
                  {formatTime(utterance.start / 1000)} - {formatTime(utterance.end / 1000)}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {/* Download button */}
        <div className="mt-4 pt-4 border-t">
          <button
            onClick={() => {
              const text = transcript.utterances
                .map(u => `Speaker ${u.speaker}: ${u.text}`)
                .join('\n\n');
              const blob = new Blob([text], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `transcript-${transcript.id}.txt`;
              a.click();
            }}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Download Transcript
          </button>
        </div>
      </div>
    );
  };

  // Past Transcriptions Component
  const PastTranscriptionsList = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Past Transcriptions</h3>
        <button
          onClick={() => setShowPastTranscriptions(!showPastTranscriptions)}
          className="text-blue-600 hover:text-blue-700"
        >
          {showPastTranscriptions ? <ChevronUp /> : <ChevronDown />}
        </button>
      </div>
      
      {showPastTranscriptions && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {pastTranscriptions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No past transcriptions found</p>
          ) : (
            pastTranscriptions.map((transcript) => {
              try {
                return (
                  <div
                    key={transcript.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => loadPastTranscription(transcript.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-800">
                          {getLanguageDisplay(transcript.language_code)} Transcription
                        </p>
                        <p className="text-sm text-gray-600">
                          {formatDate(transcript.created)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">
                          Duration: {formatTime(transcript.audio_duration || 0)}
                        </p>
                        <p className="text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                            ${transcript.status === 'completed' ? 'bg-green-100 text-green-800' : 
                              transcript.status === 'error' ? 'bg-red-100 text-red-800' : 
                              'bg-yellow-100 text-yellow-800'}`}>
                            {transcript.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                            {transcript.status === 'error' && <AlertCircle className="w-3 h-3" />}
                            {transcript.status}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              } catch (err) {
                console.error('Error rendering transcript:', transcript.id, err);
                return null;
              }
            })
          )}
        </div>
      )}
    </div>
  );

  // Load past transcriptions on mount
  useEffect(() => {
    fetchPastTranscriptions();
  }, []);

  // Also auto-expand past transcriptions on mount to make them visible
  useEffect(() => {
    setShowPastTranscriptions(true);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-center mb-2">AssemblyAI Transcription Tool</h1>
          <p className="text-center text-gray-600">Upload audio/video files for transcription with speaker diarization</p>
        </div>

        {/* Language Selector */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-gray-600" />
              <span className="font-medium">Transcription Language</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLanguage('nl')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  language === 'nl' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                🇳🇱 Dutch
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  language === 'en' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                🇬🇧 English
              </button>
            </div>
          </div>
        </div>

        {/* File Upload Area */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <FileAudio className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg mb-2">Drag & drop your audio/video file here</p>
            <p className="text-sm text-gray-600 mb-4">Supported: MP3, WAV, MP4, MOV, etc. (max 2.2GB)</p>
            <input
              type="file"
              accept="audio/*,video/*"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="inline-block bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
            >
              Browse Files
            </label>
          </div>

          {selectedFile && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="font-medium">Selected file: {selectedFile.name}</p>
              <p className="text-sm text-gray-600">Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={startTranscription}
            disabled={!selectedFile || transcriptionStatus !== 'idle'}
            className="mt-4 w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {transcriptionStatus === 'idle' ? (
              <>
                <Upload className="w-5 h-5" />
                Start Transcription
              </>
            ) : (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {transcriptionStatus === 'uploading' && `Uploading... ${uploadProgress}%`}
                {transcriptionStatus === 'transcribing' && 'Creating transcription...'}
                {transcriptionStatus === 'processing' && 'Processing audio...'}
                {transcriptionStatus === 'loading' && 'Loading transcription...'}
                {transcriptionStatus === 'completed' && 'Completed!'}
              </>
            )}
          </button>
        </div>

        {/* Current Transcription Result */}
        {currentTranscript && transcriptionStatus === 'completed' && (
          <div className="mb-6">
            <TranscriptDisplay transcript={currentTranscript} />
          </div>
        )}

        {/* Past Transcriptions */}
        <PastTranscriptionsList />
      </div>
    </div>
  );
};

export default AssemblyAITranscription;
