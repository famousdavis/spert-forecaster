// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { useState } from 'react'

interface ConnectAiConsentModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (consentRead: boolean) => void
}

/**
 * The consent gate shown before a pairing is created.
 *
 * Read Mode is the only toggle. There is no write consent to grant: the
 * session is created with writes refused, permanently, and the server
 * enforces that independently of anything this dialog records.
 */
export function ConnectAiConsentModal({
  open, onCancel, onConfirm,
}: ConnectAiConsentModalProps) {
  const [consentRead, setConsentRead] = useState(true)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-ai-consent-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3
          id="connect-ai-consent-title"
          className="text-lg font-semibold text-spert-text dark:text-gray-100"
        >
          Connect an AI assistant
        </h3>

        <div className="mt-4 space-y-3 text-sm text-spert-text dark:text-gray-300">
          <p>
            This lets an AI assistant — Claude, ChatGPT, Copilot, Gemini and
            others — read the project you have open so it can explain your
            forecast, and answer questions about what the numbers mean.
          </p>
          <p className="font-medium">
            The connection is read-only. The AI cannot change anything in
            SPERT&nbsp;Forecaster.
          </p>

          <label className="flex items-start gap-3 rounded border border-spert-border p-3 dark:border-gray-600">
            <input
              type="checkbox"
              checked={consentRead}
              onChange={(e) => setConsentRead(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Read Mode</span>
              <span className="block text-spert-muted dark:text-gray-400">
                Upload a copy of the currently open project to SPERT&apos;s cloud
                so the assistant can read it. Without this, the assistant can
                still explain how forecasting works, but cannot see your data.
                You can turn Read Mode off at any time, which deletes the
                uploaded copy.
              </span>
            </span>
          </label>

          <ul className="list-disc space-y-1 pl-5 text-spert-muted dark:text-gray-400">
            <li>Only the project you currently have open is uploaded.</li>
            <li>
              The copy is deleted when you disconnect, turn Read Mode off, or
              sign out.
            </li>
            <li>
              This happens whether your storage setting is Local or Cloud —
              Read Mode uploads regardless.
            </li>
            <li>
              The pairing stops being readable seven days after your last
              activity, and is deleted shortly after.
            </li>
          </ul>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-spert-border px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(consentRead)}
            className="rounded bg-spert-blue px-4 py-2 text-sm font-medium text-white"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}
