// components/upload/DropZone.js
import React, { useState, useRef, useCallback } from 'react';
import { Upload, File, X, Loader2, Cloud, CheckCircle2 } from 'lucide-react';

const ALLOWED_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  'audio/webm', 'audio/aac', 'audio/flac', 'audio/x-m4a', 'audio/mp4',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska'
];

const ALLOWED_EXTENSIONS = [
  '.mp3', '.wav', '.ogg', '.webm', '.aac', '.flac', '.m4a',
  '.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv'
];

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export default function DropZone({
  onFileSelect,
  onUploadComplete,
  session,
  disabled = false
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState({
    status: 'idle', // idle, uploading, success, error
    progress: 0,
    fileName: '',
    error: null
  });
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const validateFile = (file) => {
    if (!file) return { valid: false, error: 'No file selected' };

    const extension = '.' + file.name.split('.').pop().toLowerCase();
    const isValidType = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(extension);

    if (!isValidType) {
      return {
        valid: false,
        error: `Invalid file type. Supported: ${ALLOWED_EXTENSIONS.join(', ')}`
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      };
    }

    return { valid: true };
  };

  const uploadToGoogleDrive = async (file) => {
    if (!session?.accessToken) {
      throw new Error('Not authenticated with Google');
    }

    setUploadState({
      status: 'uploading',
      progress: 0,
      fileName: file.name,
      error: null
    });

    try {
      // Step 1: Initialize resumable upload session
      const initResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type,
          }),
        }
      );

      if (!initResponse.ok) {
        const error = await initResponse.json();
        throw new Error(error.error?.message || 'Failed to initialize upload');
      }

      const uploadUrl = initResponse.headers.get('Location');
      if (!uploadUrl) {
        throw new Error('No upload URL returned');
      }

      // Step 2: Upload file in chunks with progress tracking
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
      let uploadedBytes = 0;
      const totalBytes = file.size;

      while (uploadedBytes < totalBytes) {
        const start = uploadedBytes;
        const end = Math.min(uploadedBytes + CHUNK_SIZE, totalBytes);
        const chunk = file.slice(start, end);

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${start}-${end - 1}/${totalBytes}`,
            'Content-Type': file.type,
          },
          body: chunk,
        });

        if (uploadResponse.status === 200 || uploadResponse.status === 201) {
          // Upload complete
          const fileData = await uploadResponse.json();

          setUploadState(prev => ({
            ...prev,
            status: 'success',
            progress: 100
          }));

          return {
            id: fileData.id,
            name: fileData.name,
            mimeType: fileData.mimeType
          };
        } else if (uploadResponse.status === 308) {
          // Chunk uploaded, continue
          const range = uploadResponse.headers.get('Range');
          if (range) {
            uploadedBytes = parseInt(range.split('-')[1]) + 1;
          } else {
            uploadedBytes = end;
          }
        } else {
          throw new Error(`Upload failed with status ${uploadResponse.status}`);
        }

        // Update progress
        const progress = Math.round((uploadedBytes / totalBytes) * 100);
        setUploadState(prev => ({
          ...prev,
          progress
        }));
      }

      throw new Error('Upload incomplete');
    } catch (error) {
      setUploadState(prev => ({
        ...prev,
        status: 'error',
        error: error.message
      }));
      throw error;
    }
  };

  const handleFile = async (file) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      setUploadState({
        status: 'error',
        progress: 0,
        fileName: file?.name || '',
        error: validation.error
      });
      return;
    }

    try {
      // Upload to Google Drive
      const driveFile = await uploadToGoogleDrive(file);

      // Notify parent component
      if (onFileSelect) {
        onFileSelect(driveFile);
      }

      if (onUploadComplete) {
        onUploadComplete(driveFile);
      }
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (disabled || uploadState.status === 'uploading') return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled, uploadState.status]);

  const handleClick = () => {
    if (!disabled && uploadState.status !== 'uploading') {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input
    e.target.value = '';
  };

  const resetUpload = () => {
    setUploadState({
      status: 'idle',
      progress: 0,
      fileName: '',
      error: null
    });
  };

  const isUploading = uploadState.status === 'uploading';
  const isSuccess = uploadState.status === 'success';
  const isError = uploadState.status === 'error';

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          relative border-2 border-dashed rounded-2xl p-8
          transition-all duration-200 cursor-pointer
          ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }
          ${isUploading ? 'pointer-events-none' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Idle State */}
        {uploadState.status === 'idle' && (
          <div className="text-center">
            <div className={`
              w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center
              transition-all duration-200
              ${isDragging
                ? 'bg-blue-500 text-white scale-110'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }
            `}>
              <Upload className="w-8 h-8" />
            </div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200 mb-2">
              {isDragging ? 'Drop your file here' : 'Drop audio/video files here'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              or click to browse
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Supports: MP3, WAV, M4A, MP4, WebM, OGG, FLAC (max 500MB)
            </p>
          </div>
        )}

        {/* Uploading State */}
        {isUploading && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Cloud className="w-8 h-8 text-blue-500 animate-pulse" />
            </div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200 mb-2">
              Uploading to Google Drive...
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 truncate max-w-xs mx-auto">
              {uploadState.fileName}
            </p>
            <div className="w-full max-w-xs mx-auto bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-300"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {uploadState.progress}%
            </p>
          </div>
        )}

        {/* Success State */}
        {isSuccess && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200 mb-2">
              Upload complete!
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 truncate max-w-xs mx-auto">
              {uploadState.fileName}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              Starting transcription automatically...
            </p>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-lg font-medium text-red-600 dark:text-red-400 mb-2">
              Upload failed
            </p>
            <p className="text-sm text-red-500 dark:text-red-400 mb-4">
              {uploadState.error}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetUpload();
              }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
