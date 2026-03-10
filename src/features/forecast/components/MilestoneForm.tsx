// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Milestone } from '@/shared/types'
import { DEFAULT_MILESTONE_COLORS } from '../constants'

interface MilestoneFormProps {
  milestone: Milestone | null
  existingCount: number // Used to pick default color
  unitOfMeasure: string
  onSubmit: (data: Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

export function MilestoneForm({
  milestone,
  existingCount,
  unitOfMeasure,
  onSubmit,
  onCancel,
}: MilestoneFormProps) {
  const defaultColor = DEFAULT_MILESTONE_COLORS[existingCount % DEFAULT_MILESTONE_COLORS.length]
  const [name, setName] = useState(milestone?.name ?? '')
  const [backlogSize, setBacklogSize] = useState(milestone ? String(milestone.backlogSize) : '')
  const [color, setColor] = useState(milestone?.color ?? defaultColor)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    onSubmit({
      name: name.trim(),
      backlogSize: Number(backlogSize),
      color,
    })
  }

  const parsedBacklog = Number(backlogSize)
  const isValid =
    name.trim().length > 0 &&
    backlogSize.length > 0 &&
    !isNaN(parsedBacklog) &&
    parsedBacklog > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
      <h4 className="font-medium text-[0.9rem] dark:text-gray-100">
        {milestone ? 'Edit Milestone' : 'Add Milestone'}
      </h4>

      <div className="flex flex-wrap items-start gap-3">
        {/* Name */}
        <div className="min-w-[150px] flex-[2_1_180px]">
          <label
            htmlFor="milestoneName"
            className="mb-1 block text-[0.8rem] font-semibold text-spert-text-secondary"
          >
            Name <span className="text-spert-error">*</span>
          </label>
          <input
            id="milestoneName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., MVP"
            maxLength={50}
            autoFocus
            className={cn(
              'w-full rounded p-[0.4rem] text-[0.85rem] dark:text-gray-100',
              name
                ? 'border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700'
                : 'border-2 border-spert-blue bg-spert-bg-highlight dark:bg-gray-700'
            )}
            required
          />
        </div>

        {/* Remaining Work */}
        <div className="flex-[1_1_120px]">
          <label
            htmlFor="milestoneBacklog"
            className="mb-1 block text-[0.8rem] font-semibold text-spert-text-secondary"
          >
            Remaining Work <span className="text-spert-error">*</span>
          </label>
          <input
            id="milestoneBacklog"
            type="number"
            value={backlogSize}
            onChange={(e) => setBacklogSize(e.target.value)}
            placeholder={unitOfMeasure}
            min="0.01"
            step="any"
            className={cn(
              'w-full rounded p-[0.4rem] text-[0.85rem] dark:text-gray-100',
              backlogSize
                ? 'border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700'
                : 'border-2 border-spert-blue bg-spert-bg-highlight dark:bg-gray-700'
            )}
            required
          />
          <div className="mt-[0.2rem] text-[0.65rem] text-spert-text-helper">
            How much is left ({unitOfMeasure})
          </div>
        </div>

        {/* Color */}
        <div className="flex-[0_0_auto]">
          <span className="mb-1 block text-[0.8rem] font-semibold text-spert-text-secondary">
            Color
          </span>
          <div className="flex items-center gap-1.5 h-[34px]">
            {DEFAULT_MILESTONE_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                className={cn(
                  'size-7 rounded-full cursor-pointer border-2 transition-[border-color,box-shadow] duration-150',
                  color === preset
                    ? 'border-gray-800 dark:border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]'
                    : 'border-transparent hover:border-gray-400 dark:hover:border-gray-500'
                )}
                style={{ backgroundColor: preset }}
                title={preset}
              />
            ))}
            <label
              className={cn(
                'relative size-7 rounded-full cursor-pointer border-2 overflow-hidden transition-[border-color,box-shadow] duration-150',
                !DEFAULT_MILESTONE_COLORS.includes(color as typeof DEFAULT_MILESTONE_COLORS[number])
                  ? 'border-gray-800 dark:border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]'
                  : 'border-transparent hover:border-gray-400 dark:hover:border-gray-500'
              )}
              style={{ backgroundColor: color }}
              title="Custom color"
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                +
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded border-none bg-spert-text-light px-4 py-2 text-[0.9rem] text-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid}
          className={cn(
            'rounded border-none px-4 py-2 text-[0.9rem] font-semibold text-white',
            isValid
              ? 'cursor-pointer bg-spert-blue'
              : 'cursor-not-allowed bg-spert-border-medium'
          )}
        >
          {milestone ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  )
}
