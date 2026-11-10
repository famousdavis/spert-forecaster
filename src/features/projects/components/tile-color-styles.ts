// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Tile colour (v0.50.0): the tints, the archived tints, the Tile color button and its popover,
// as the literal class strings of FCD-Design-1's mock-up (`app.src.html`, md5 b6ffb17c…: `TINT.a`
// `:174`, `ARCHIVED_BG.a` `:179-182`, `C.colorBtn` … `C.popHint` `:148-156`, `SWATCH` and the
// none-dot `:189-191`), which are GanttApp's stored hexes at d437e84 (16 % of the swatch over
// white in light, 22 % over `#16213e` in dark). Every string is written out whole so Tailwind
// finds it.

import type { ProjectColor } from '@/shared/lib/project-prefs'

/** The tile's background by colour: replaces TILE_BG (`none` is TILE_BG itself, D18). */
export const TILE_TINT: Record<ProjectColor | 'none', string> = {
  none: 'bg-[#f9f9f9] dark:bg-[#16213e]',
  blue: 'bg-[#e0ebfe] dark:bg-[#1e3667]',
  teal: 'bg-[#d9f4f1] dark:bg-[#164255]',
  slate: 'bg-[#e6e9ec] dark:bg-[#27334f]',
  purple: 'bg-[#f1e4fe] dark:bg-[#362c67]',
  pink: 'bg-[#fce2ef] dark:bg-[#452a52]',
}

/** An archived tile's background: half the tint over the untinted surface (GanttApp's color-mix; D20). */
export const TILE_TINT_ARCHIVED: Record<ProjectColor | 'none', string> = {
  none: 'bg-[#f9f9f9] dark:bg-[#16213e]',
  blue: 'bg-[color-mix(in_srgb,#e0ebfe_50%,#f9f9f9)] dark:bg-[color-mix(in_srgb,#1e3667_50%,#16213e)]',
  teal: 'bg-[color-mix(in_srgb,#d9f4f1_50%,#f9f9f9)] dark:bg-[color-mix(in_srgb,#164255_50%,#16213e)]',
  slate: 'bg-[color-mix(in_srgb,#e6e9ec_50%,#f9f9f9)] dark:bg-[color-mix(in_srgb,#27334f_50%,#16213e)]',
  purple: 'bg-[color-mix(in_srgb,#f1e4fe_50%,#f9f9f9)] dark:bg-[color-mix(in_srgb,#362c67_50%,#16213e)]',
  pink: 'bg-[color-mix(in_srgb,#fce2ef_50%,#f9f9f9)] dark:bg-[color-mix(in_srgb,#452a52_50%,#16213e)]',
}

/** The swatch colours, for the button's dot and the popover's dots. */
export const SWATCH_BG: Record<ProjectColor, string> = {
  blue: 'bg-[#3b82f6]',
  teal: 'bg-[#14b8a6]',
  slate: 'bg-[#64748b]',
  purple: 'bg-[#a855f7]',
  pink: 'bg-[#ec4899]',
}

/**
 * The Tile color button: the five shared icons' box, without a hue of its own. No `relative
 * z-[1]` of its own (the mock-up's had one): the revealed row it sits in carries ABOVE_OPEN.
 */
export const COLOR_BUTTON =
  'inline-flex size-7 flex-none items-center justify-center p-0 border-0 rounded-[6px] bg-transparent cursor-pointer text-[#808080] dark:text-[#9ca3af] transition-[background-color] duration-[120ms] hover:bg-[#f5f5f5] focus-visible:bg-[#f5f5f5] dark:hover:bg-[#2d3748] dark:focus-visible:bg-[#2d3748] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070f3] dark:focus-visible:outline-[#60a5fa]'
export const COLOR_DOT = 'size-[15px] rounded-full border-2 border-current'
/** No colour: a diagonal stroke through the dot. */
export const NONE_DOT = 'bg-[linear-gradient(135deg,transparent_44%,currentColor_44%,currentColor_56%,transparent_56%)]'

/** Placed from the tile (its containing block): 6 px in from its right edge, 6 px above its bottom edge. */
export const POPOVER =
  'absolute z-20 right-1.5 top-[calc(100%-6px)] w-max max-w-[280px] p-2.5 rounded-[8px] border cursor-default bg-white text-[#333] border-[#ddd] shadow-[0_8px_24px_rgba(15,23,42,0.10)] dark:bg-gray-900 dark:text-[#e2e8f0] dark:border-[#4a5568] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
export const POP_TITLE = 'm-0 mb-1.5 text-[0.8rem] font-semibold leading-[normal] text-[#666] dark:text-[#a0aec0]'
export const SWATCHES = 'grid grid-cols-[repeat(2,auto)] gap-x-1.5 gap-y-1'
export const SW =
  'relative inline-flex items-center gap-[7px] py-1 pr-2.5 pl-[5px] border-2 border-transparent rounded-full text-[0.85rem] leading-[normal] cursor-pointer hover:bg-[#f5f5f5] dark:hover:bg-[#2d3748] has-checked:border-[#333] has-checked:font-semibold dark:has-checked:border-[#e2e8f0] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#0070f3] dark:has-focus-visible:outline-[#60a5fa]'
export const SW_RADIO = 'absolute opacity-0 size-px m-0'
export const SW_DOT = 'size-[18px] flex-none rounded-full border border-[rgba(0,0,0,0.25)] dark:border-[rgba(255,255,255,0.35)]'
/** The popover's No color dot. */
export const SW_NONE =
  'border-[#666] dark:border-[#a0aec0] text-[#666] dark:text-[#a0aec0] bg-[linear-gradient(135deg,transparent_44%,currentColor_44%,currentColor_56%,transparent_56%)]'
export const POP_HINT = 'mt-1.5 mb-0 text-[0.75rem] leading-[normal] text-[#666] dark:text-[#a0aec0]'
