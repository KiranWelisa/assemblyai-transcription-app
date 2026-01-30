// components/upload/DropZone.js
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, File, X, Loader2, Cloud, CheckCircle2, Music, Zap } from 'lucide-react';

const ALLOWED_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  'audio/webm', 'audio/aac', 'audio/flac', 'audio/x-m4a', 'audio/mp4',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska'
];

const VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska'
];

const ALLOWED_EXTENSIONS = [
  '.mp3', '.wav', '.ogg', '.webm', '.aac', '.flac', '.m4a',
  '.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv'
];

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm'];

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const COMPRESSION_THRESHOLD = 10 * 1024 * 1024; // 10MB - compress videos larger than this

export default function DropZone({
  onFileSelect,
  onUploadComplete,
  session,
  disabled = false
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState({
    status: 'idle', // idle, compressing, uploading, success, error
    progress: 0,
    fileName: '',
    error: null,
    compressionInfo: null // { originalSize, compressedSize }
  });
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const ffmpegRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  // Check if file is a video
  const isVideoFile = (file) => {
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    return VIDEO_TYPES.includes(file.type) || VIDEO_EXTENSIONS.includes(extension);
  };

  // Load FFmpeg on demand
  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    if (ffmpegLoading) return null;

    setFfmpegLoading(true);
    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

      const ffmpeg = new FFmpeg();

      // Load FFmpeg core from CDN
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      ffmpegRef.current = { ffmpeg, fetchFile };
      setFfmpegLoaded(true);
      return { ffmpeg, fetchFile };
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      return null;
    } finally {
      setFfmpegLoading(false);
    }
  };

  // Compress video to MP3
  const compressToMp3 = async (file) => {
    setUploadState(prev => ({
      ...prev,
      status: 'compressing',
      progress: 0,
      fileName: file.name,
      compressionInfo: { originalSize: file.size, compressedSize: null }
    }));

    try {
      const ffmpegInstance = await loadFFmpeg();
      if (!ffmpegInstance) {
        throw new Error('Failed to load FFmpeg');
      }

      const { ffmpeg, fetchFile } = ffmpegInstance;

      // Set progress handler
      ffmpeg.on('progress', ({ progress }) => {
        setUploadState(prev => ({
          ...prev,
          progress: Math.round(progress * 100)
        }));
      });

      // Write input file
      const inputName = 'input' + file.name.substring(file.name.lastIndexOf('.'));
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // Convert to MP3 128kbps
      const outputName = file.name.replace(/\.[^/.]+$/, '') + '.mp3';
      await ffmpeg.exec([
        '-i', inputName,
        '-vn',              // No video
        '-acodec', 'libmp3lame',
        '-ab', '128k',      // 128kbps bitrate
        '-ar', '44100',     // 44.1kHz sample rate
        '-ac', '2',         // Stereo
        outputName
      ]);

      // Read output file
      const data = await ffmpeg.readFile(outputName);
      const compressedBlob = new Blob([data.buffer], { type: 'audio/mpeg' });
      const compressedFile = new File([compressedBlob], outputName, { type: 'audio/mpeg' });

      // Cleanup
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      setUploadState(prev => ({
        ...prev,
        compressionInfo: {
          originalSize: file.size,
          compressedSize: compressedFile.size
        }
      }));

      return compressedFile;
    } catch (error) {
      console.error('Compression error:', error);
      throw new Error('Failed to compress video: ' + error.message);
    }
  };

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
        error: validation.error,
        compressionInfo: null
      });
      return;
    }

    try {
      let fileToUpload = file;

      // Compress video files larger than threshold to MP3
      if (isVideoFile(file) && file.size > COMPRESSION_THRESHOLD) {
        try {
          fileToUpload = await compressToMp3(file);
        } catch (compressError) {
          console.warn('Compression failed, uploading original:', compressError);
          // Continue with original file if compression fails
        }
      }

      // Upload to Google Drive
      const driveFile = await uploadToGoogleDrive(fileToUpload);

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
      error: null,
      compressionInfo: null
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isCompressing = uploadState.status === 'compressing';
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

        {/* Compressing State */}
        {isCompressing && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Zap className="w-8 h-8 text-purple-500 animate-pulse" />
            </div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200 mb-2">
              Compressing to MP3...
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 truncate max-w-xs mx-auto">
              {uploadState.fileName}
            </p>
            {uploadState.compressionInfo?.originalSize && (
              <p className="text-xs text-purple-600 dark:text-purple-400 mb-4">
                {formatFileSize(uploadState.compressionInfo.originalSize)} → MP3 128kbps
              </p>
            )}
            <div className="w-full max-w-xs mx-auto bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {uploadState.progress}%
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
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 truncate max-w-xs mx-auto">
              {uploadState.fileName}
            </p>
            {uploadState.compressionInfo?.compressedSize && (
              <p className="text-xs text-green-600 dark:text-green-400 mb-4">
                Compressed: {formatFileSize(uploadState.compressionInfo.originalSize)} → {formatFileSize(uploadState.compressionInfo.compressedSize)}
                ({Math.round((1 - uploadState.compressionInfo.compressedSize / uploadState.compressionInfo.originalSize) * 100)}% smaller)
              </p>
            )}
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
