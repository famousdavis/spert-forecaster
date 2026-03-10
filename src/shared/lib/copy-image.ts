// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { toPng } from 'html-to-image'

const IGNORE_CLASS = 'copy-image-button'

/** Filter that excludes UI-only elements (buttons, toolbars) from image capture */
export const imageFilter = (node: Node) => {
  if (node instanceof Element && node.classList.contains(IGNORE_CLASS)) return false
  return true
}

/** Capture a DOM element as a base64 PNG data URL */
export function captureElementAsPng(element: HTMLElement): Promise<string> {
  return toPng(element, { filter: imageFilter, backgroundColor: '#ffffff', pixelRatio: 2 })
}

/**
 * Copy a DOM element as a PNG image to the clipboard
 */
export async function copyElementAsImage(element: HTMLElement): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard API is not available. Copy-to-image requires a secure (HTTPS) context.')
  }

  const dataUrl = await captureElementAsPng(element)

  // Convert data URL to blob (direct base64 decode avoids CSP connect-src restrictions)
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'image/png' })

  // Copy to clipboard
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
