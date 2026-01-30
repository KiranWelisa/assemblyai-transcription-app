// components/transcriptions/RecentlyAdded.js
import React from 'react';
import { Clock, Sparkles } from 'lucide-react';
import NewBadge from './NewBadge';

export default function RecentlyAdded({
  transcriptions,
  onSelect,
  formatDate,
  maxItems = 5
}) {
  // Filter for new transcriptions, sorted by most recent
  const recentNew = transcriptions
    .filter(t => t.isNew && t.duration !== null)
    .slice(0, maxItems);

  if (recentNew.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-emerald-500" />
        Recently Added
        <span className="ml-auto text-sm font-normal text-gray-500 dark:text-gray-400">
          {recentNew.length} new
        </span>
      </h3>

      <div className="space-y-3">
        {recentNew.map((transcription) => (
          <div
            key={transcription.id}
            onClick={() => onSelect(transcription)}
            className="
              flex items-center gap-3 p-3 rounded-xl cursor-pointer
              bg-gradient-to-r from-emerald-50 to-teal-50
              dark:from-emerald-900/20 dark:to-teal-900/20
              hover:from-emerald-100 hover:to-teal-100
              dark:hover:from-emerald-900/30 dark:hover:to-teal-900/30
              border border-emerald-200/50 dark:border-emerald-700/30
              transition-all duration-200
            "
          >
            <div className="flex-1 min-w-0">
              {transcription.titleGenerating ? (
                <div className="flex items-center gap-2">
                  <div className="h-5 w-32 bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200 dark:from-blue-800 dark:via-blue-700 dark:to-blue-800 rounded animate-shimmer bg-[length:200%_100%]"></div>
                  <Sparkles className="w-3 h-3 text-blue-500 animate-pulse" />
                </div>
              ) : (
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {transcription.title || 'Untitled'}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {formatDate(transcription.assemblyCreatedAt || transcription.createdAt)}
              </p>
            </div>
            <NewBadge />
          </div>
        ))}
      </div>
    </div>
  );
}
