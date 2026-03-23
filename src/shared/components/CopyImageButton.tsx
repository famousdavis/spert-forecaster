// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState, useCallback, type RefObject } from 'react'
import { toast } from 'sonner'
import { copyElementAsImage } from '@/shared/lib/copy-image'
import { cn } from '@/lib/utils'
import { COLORS } from '@/shared/lib/colors'

// Firefox exposes ClipboardItem and navigator.clipboard.write on its API surface,
// but clipboard.write() silently fails for image/png at runtime because the feature
// is behind a disabled-by-default about:config flag. UA check is the only reliable detection.
const CLIPBOARD_IMAGE_SUPPORTED =
  typeof navigator !== 'undefined' &&
  !/firefox/i.test(navigator.userAgent)

type CopyStatus = 'idle' | 'copying' | 'success' | 'error'

interface CopyImageButtonProps {
  targetRef: RefObject<HTMLElement | null>
  title?: string
}

export function CopyImageButton({ targetRef, title = 'Copy as image' }: CopyImageButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle')

  const handleCopy = useCallback(async () => {
    if (!CLIPBOARD_IMAGE_SUPPORTED) return
    if (!targetRef.current) {
      toast.error('Failed to copy: element not found')
      return
    }

    setStatus('copying')
    try {
      await copyElementAsImage(targetRef.current)
      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      toast.error('Failed to copy image to clipboard')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }, [targetRef])

  const unsupportedTitle = 'Copy image is not supported in this browser — try Chrome, Edge, or Safari.'

  return (
    <button
      className={cn(
        'copy-image-button bg-transparent border-0 p-1 shrink-0 transition-opacity duration-200',
        !CLIPBOARD_IMAGE_SUPPORTED
          ? 'opacity-30 cursor-not-allowed'
          : status === 'copying' ? 'cursor-wait opacity-100'
          : status === 'idle' ? 'cursor-pointer opacity-50 hover:opacity-100'
          : 'opacity-100'
      )}
      onClick={CLIPBOARD_IMAGE_SUPPORTED ? handleCopy : undefined}
      disabled={!CLIPBOARD_IMAGE_SUPPORTED || status === 'copying'}
      title={CLIPBOARD_IMAGE_SUPPORTED ? title : unsupportedTitle}
      aria-label={CLIPBOARD_IMAGE_SUPPORTED ? title : unsupportedTitle}
    >
      {status === 'copying' && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-spin"
        >
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      )}
      {status === 'success' && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={COLORS.copy.success}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {status === 'error' && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={COLORS.copy.error}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
      {status === 'idle' && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}
