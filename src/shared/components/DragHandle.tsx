// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

export function DragHandle() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-[2px] cursor-grab active:cursor-grabbing"
    >
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
    </div>
  )
}
