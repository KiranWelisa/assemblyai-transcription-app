// components/transcriptions/ActiveTranscription.js
import React, { useState, useEffect } from 'react';
import { Loader2, FileAudio, Clock, CheckCircle2, Zap } from 'lucide-react';

export default function ActiveTranscription({
  status, // 'publishing' | 'transcribing' | 'polling' | 'completed' | 'error'
  fileName,
  pollCount = 0,
  startTime,
  compressionStatus = { active: false, progress: 0 } // { active: boolean, progress: number }
}) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Track elapsed time
  useEffect(() => {
    if (!startTime || status === 'completed' || status === 'error') return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, status]);

  // Estimate remaining time based on poll count
  // Typical transcription: ~0.5x realtime (10 min audio = ~5 min processing)
  // Each poll is 5 seconds, average completion is around 20-60 polls
  const estimateRemainingTime = () => {
    if (status === 'publishing' || status === 'transcribing') {
      return 'Starting...';
    }

    if (pollCount < 3) {
      return 'Calculating...';
    }

    // Rough estimate: average is about 30-50 polls, so estimate based on progress
    const avgPolls = 40;
    const progressPercent = Math.min((pollCount / avgPolls) * 100, 95);
    const remainingPolls = Math.max(avgPolls - pollCount, 2);
    const remainingSeconds = remainingPolls * 5;

    if (remainingSeconds < 60) {
      return `~${remainingSeconds}s remaining`;
    }
    return `~${Math.ceil(remainingSeconds / 60)}m remaining`;
  };

  const getProgressPercent = () => {
    if (status === 'publishing') return 5;
    if (status === 'transcribing') return 10;
    if (status === 'completed') return 100;
    // Polling progress: estimate 40 polls average, cap at 95%
    return Math.min(10 + (pollCount / 40) * 85, 95);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getStatusMessage = () => {
    // Show compression status first
    if (compressionStatus.active) {
      if (compressionStatus.progress < 20) return 'Loading video compressor...';
      if (compressionStatus.progress < 30) return 'Downloading video from Drive...';
      if (compressionStatus.progress < 80) return `Compressing to MP3... ${Math.round((compressionStatus.progress - 20) / 60 * 100)}%`;
      return 'Uploading compressed file...';
    }

    switch (status) {
      case 'publishing':
        return 'Preparing file...';
      case 'transcribing':
        return 'Sending to AssemblyAI...';
      case 'polling':
        return 'Transcribing audio...';
      case 'completed':
        return 'Complete!';
      case 'error':
        return 'Error occurred';
      default:
        return 'Processing...';
    }
  };

  const getOverallProgressPercent = () => {
    // When compressing, show compression progress in first 15%
    if (compressionStatus.active) {
      return Math.round(compressionStatus.progress * 0.15);
    }
    // Normal transcription progress starts at 15%
    return 15 + (getProgressPercent() * 0.85);
  };

  const progressPercent = compressionStatus.active ? compressionStatus.progress : getProgressPercent();
  const isActive = status && status !== 'idle' && status !== 'completed' && status !== 'error';
  const isCompressing = compressionStatus.active;

  if (!isActive && status !== 'completed' && !isCompressing) {
    return null;
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 ${status === 'completed' ? 'ring-2 ring-green-400/50' : ''}`}>
      <div className="flex items-center gap-3 mb-4">
        {status === 'completed' ? (
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
        ) : isCompressing ? (
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-purple-500 animate-pulse" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {status === 'completed'
              ? 'Transcription Complete'
              : isCompressing
                ? 'Compressing Video'
                : 'Transcription in Progress'}
          </h3>
          {fileName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {fileName}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
          <span>{getStatusMessage()}</span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              status === 'completed'
                ? 'bg-green-500'
                : isCompressing
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          <span>Elapsed: {formatTime(elapsedTime)}</span>
        </div>
        {status !== 'completed' && (
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            {estimateRemainingTime()}
          </span>
        )}
      </div>
    </div>
  );
}
