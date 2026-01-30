// components/transcriptions/NewBadge.js
import React from 'react';

export default function NewBadge({ className = '' }) {
  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold
        uppercase tracking-wider
        bg-gradient-to-r from-emerald-200 to-teal-200
        dark:from-emerald-800/60 dark:to-teal-800/60
        text-emerald-800 dark:text-emerald-200
        shadow-sm
        ${className}
      `}
    >
      New
    </span>
  );
}
