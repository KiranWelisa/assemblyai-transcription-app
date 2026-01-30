// components/transcriptions/TranscriptionCard.js
import React from 'react';
import { Sparkles } from 'lucide-react';
import NewBadge from './NewBadge';

export default function TranscriptionCard({
  transcription,
  onClick,
  formatTime,
  formatDate,
  getLanguageEmoji,
  getLanguageTag
}) {
  const isNew = transcription.isNew;
  const isGeneratingTitle = transcription.titleGenerating;

  return (
    <div
      onClick={() => onClick(transcription)}
      className={`
        bg-white dark:bg-gray-800 rounded-2xl shadow-md
        hover:shadow-2xl transition-all duration-300 cursor-pointer
        overflow-hidden group hover:scale-[1.02]
        ${isNew ? 'ring-2 ring-emerald-400/50 dark:ring-emerald-500/30' : ''}
      `}
    >
      {/* Pastel accent bar for new items */}
      {isNew && (
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
      )}

      <div className="p-6">
        {/* Header with title and NEW badge */}
        <div className="flex items-start justify-between mb-3 gap-2">
          {isGeneratingTitle ? (
            <div className="flex-1">
              <div className="h-6 bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200 dark:from-blue-800 dark:via-blue-700 dark:to-blue-800 rounded animate-shimmer bg-[length:200%_100%] mb-1"></div>
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                <Sparkles className="w-3 h-3 animate-pulse" />
                <span className="animate-pulse">Generating title...</span>
              </div>
            </div>
          ) : (
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2 flex-1">
              {transcription.title || 'Untitled Transcription'}
            </h3>
          )}

          {isNew && !isGeneratingTitle && <NewBadge />}
        </div>

        {/* Extracted metadata badges */}
        {(transcription.companyNames?.length > 0 || transcription.personNames?.length > 0) && (
          <div className="flex flex-wrap gap-1 mb-3">
            {transcription.companyNames?.slice(0, 1).map((company, i) => (
              <span
                key={`company-${i}`}
                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
              >
                {company}
              </span>
            ))}
            {transcription.personNames?.slice(0, 2).map((person, i) => (
              <span
                key={`person-${i}`}
                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              >
                {person}
              </span>
            ))}
          </div>
        )}

        {/* Language and duration */}
        <div className="flex items-center gap-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1">
            {getLanguageEmoji(transcription.language)}
            {getLanguageTag(transcription.language)}
          </span>
          <span>•</span>
          <span>{formatTime(transcription.duration || 0)}</span>
          {transcription.meetingType && (
            <>
              <span>•</span>
              <span className="capitalize">{transcription.meetingType}</span>
            </>
          )}
        </div>

        {/* Preview text */}
        <div className="relative h-20 overflow-hidden">
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
            {transcription.preview || 'Click to load transcript...'}
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white dark:from-gray-800 to-transparent"></div>
        </div>

        {/* Footer with date */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(transcription.assemblyCreatedAt || transcription.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
