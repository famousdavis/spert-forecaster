// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ProductivityAdjustment } from '@/shared/types'
import { isValidDateRange } from '@/shared/lib/dates'

interface ProductivityAdjustmentFormProps {
  adjustment: ProductivityAdjustment | null
  onSubmit: (data: Omit<ProductivityAdjustment, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

export function ProductivityAdjustmentForm({
  adjustment,
  onSubmit,
  onCancel,
}: ProductivityAdjustmentFormProps) {
  const [name, setName] = useState(adjustment?.name ?? '')
  const [startDate, setStartDate] = useState(adjustment?.startDate ?? '')
  const [endDate, setEndDate] = useState(adjustment?.endDate ?? '')
  const [factorPercent, setFactorPercent] = useState(
    adjustment ? Math.round(adjustment.factor * 100) : 50
  )
  const [reason, setReason] = useState(adjustment?.reason ?? '')

  // Validation
  const [startDateError, setStartDateError] = useState('')
  const [endDateError, setEndDateError] = useState('')

  const validateStartDate = () => {
    if (!isValidDateRange(startDate, true)) {
      setStartDateError('Date must be between 2000 and 2050')
    } else {
      setStartDateError('')
    }
  }

  const validateEndDate = () => {
    if (!isValidDateRange(endDate, true)) {
      setEndDateError('Date must be between 2000 and 2050')
    } else if (endDate && startDate && endDate < startDate) {
      setEndDateError('End date must be on or after start date')
    } else {
      setEndDateError('')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    onSubmit({
      name: name.trim(),
      startDate,
      endDate,
      factor: factorPercent / 100,
      enabled: adjustment?.enabled ?? true, // New adjustments are enabled by default
      reason: reason.trim() || undefined,
    })
  }

  const isValid =
    name.trim().length > 0 &&
    startDate.length === 10 &&
    endDate.length === 10 &&
    isValidDateRange(startDate) &&
    isValidDateRange(endDate) &&
    endDate >= startDate &&
    !startDateError &&
    !endDateError

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
      <h4 className="font-medium text-[0.9rem] dark:text-gray-100">
        {adjustment ? 'Edit Adjustment' : 'Add Productivity Adjustment'}
      </h4>

      {/* Single row: All inputs */}
      <div className="flex flex-wrap items-start gap-3">
        {/* Name */}
        <div className="min-w-[120px] flex-[1_1_140px]">
          <label
            htmlFor="adjName"
            className="mb-1 block text-[0.8rem] font-semibold text-spert-text-secondary"
          >
            Name <span className="text-spert-error">*</span>
          </label>
          <input
            id="adjName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Holiday"
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

        {/* Start Date */}
        <div className="flex-[0_0_130px]">
          <label
            htmlFor="adjStartDate"
            className="mb-1 block text-[0.8rem] font-semibold text-spert-text-secondary"
          >
            Start <span className="text-spert-error">*</span>
          </label>
          <input
            id="adjStartDate"
            type="date"
            value={startDate}
            onChange={(e) => {
              const newStart = e.target.value
              setStartDate(newStart)
              setStartDateError('')
              // Auto-seed end date to start + 1 day when empty or before the new start
              if (newStart && (!endDate || endDate < newStart)) {
                const next = new Date(newStart + 'T00:00:00')
                next.setDate(next.getDate() + 1)
                const nextStr = next.toISOString().slice(0, 10)
                setEndDate(nextStr)
                setEndDateError('')
              }
            }}
            onBlur={validateStartDate}
            min="2000-01-01"
            max="2050-12-31"
            className={cn(
              'w-full rounded p-[0.4rem] text-[0.85rem] dark:text-gray-100',
              startDateError
                ? 'border border-spert-error bg-white dark:bg-gray-700'
                : startDate
                  ? 'border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700'
                  : 'border-2 border-spert-blue bg-spert-bg-highlight dark:bg-gray-700'
            )}
            required
          />
          {startDateError && (
            <div className="mt-[0.2rem] text-[0.7rem] text-spert-error">
              {startDateError}
            </div>
          )}
        </div>

        {/* End Date */}
        <div className="flex-[0_0_130px]">
          <label
            htmlFor="adjEndDate"
            className="mb-1 block text-[0.8rem] font-semibold text-spert-text-secondary"
          >
            End <span className="text-spert-error">*</span>
          </label>
          <input
            id="adjEndDate"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              setEndDateError('')
            }}
            onBlur={validateEndDate}
            min="2000-01-01"
            max="2050-12-31"
            className={cn(
              'w-full rounded p-[0.4rem] text-[0.85rem] dark:text-gray-100',
              endDateError
                ? 'border border-spert-error bg-white dark:bg-gray-700'
                : endDate
                  ? 'border border-spert-border dark:border-gray-600 bg-white dark:bg-gray-700'
                  : 'border-2 border-spert-blue bg-spert-bg-highlight dark:bg-gray-700'
            )}
            required
          />
          {endDateError && (
            <div className="mt-[0.2rem] text-[0.7rem] text-spert-error">
              {endDateError}
            </div>
          )}
        </div>

        {/* Factor */}
        <div className="flex-[0_0_220px]">
          <label
            htmlFor="adjFactor"
            className="mb-1 block text-[0.8rem] font-semibold text-spert-text-secondary"
          >
            Factor: {factorPercent}%
          </label>
          <input
            id="adjFactor"
            type="range"
            min="0"
            max="100"
            step="5"
            value={factorPercent}
            onChange={(e) => setFactorPercent(Number(e.target.value))}
            className="mt-[0.3rem] w-full"
          />
          <div className="grid grid-cols-3 text-[0.65rem] text-spert-text-helper">
            <span className="text-left">0% (no work)</span>
            <span className="text-center">50% (half velocity)</span>
            <span className="text-right">100% (full velocity)</span>
          </div>
          <p className="mt-1 text-[0.7rem] text-spert-text-helper dark:text-gray-400">
            A factor of 0% means no work is completed; 100% means normal velocity.
          </p>
        </div>

        {/* Memo */}
        <div className="min-w-[80px] flex-[2_1_160px]">
          <label
            htmlFor="adjReason"
            className="mb-1 block text-[0.8rem] font-semibold text-spert-text-secondary"
          >
            Memo
          </label>
          <input
            id="adjReason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder=""
            className="w-full rounded border border-spert-border dark:border-gray-600 p-[0.4rem] text-[0.85rem] bg-white dark:bg-gray-700 dark:text-gray-100"
          />
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
          {adjustment ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  )
}
