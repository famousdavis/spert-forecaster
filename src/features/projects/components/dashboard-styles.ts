// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Projects dashboard's look, v0.49.0: GanttApp's grid, tile and project dialog
// (`styles/projects-tab.css` at d437e84), as the literal class strings of FCD-Design-1's
// mock-up (`app.src.html`, md5 b6ffb17c…, its `C` table) that William reviewed. The
// labelled buttons' strings are shared with the welcome empty state and live in
// `@/shared/components/toolbar-button-styles`; the five icon buttons carry their own look
// (`@/shared/components/icon-button-styles`, v0.48.2).
//
// ⚠️ The reveal, the whole-tile click and the grid depend on PAIRS of classes, and a class
// string is not proof that it renders:
// - the revealed row's `group-hover/tile:` and `group-focus-within/tile:` match only inside
//   an element carrying `group/tile` (the tile root);
// - the grid's `@min-[560px]:` / `@min-[860px]:` match only inside an ANCESTOR carrying
//   `@container`; on the grid itself they never match;
// - the name button's `::after` covers the tile because the tile root is `relative`, and the
//   grip, Delete and the revealed row sit above it only because each is `relative z-[1]`.
// `ProjectList.test.tsx` pins each pair; the browser check at release pins the rendering.
//
// Hover is `hover:` utilities only: Tailwind 4 wraps them in `@media (hover: hover)`, so a
// touch screen never shows a hover look, and `[@media(hover:none)]` shows the revealed row
// there at rest.

/** The heading row: "Projects" on the left, the toolbar on the right; wraps on a narrow screen. */
export const HEAD_ROW = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-3'
export const HEADING = 'text-2xl leading-[normal] font-bold text-[#333] dark:text-[#e2e8f0]'

/** The container the grid measures. Must be an ancestor of the grid, never the grid itself. */
export const GRID_AREA = '@container'
/** One column, two from 560 px of container width, three from 860; 16 px gaps. */
export const GRID = 'grid grid-cols-1 gap-4 @min-[560px]:grid-cols-2 @min-[860px]:grid-cols-3 list-none m-0 p-0'

/** The tile root. `group/tile` names the group the revealed row reads; `relative` anchors the name button's `::after`. */
export const TILE =
  'group/tile relative flex flex-col gap-0.5 min-w-0 pt-[10px] pr-[10px] pb-2 pl-3 border-2 rounded-[8px] cursor-pointer transition-[border-color,box-shadow,opacity,background-color] duration-[120ms] ease-in-out'
/** The untinted tile (D18). */
export const TILE_BG = 'bg-[#f9f9f9] dark:bg-[#16213e]'
/** At rest: the border colour and its hover (D21). Swapped out whole for TILE_DROP, never appended to. */
export const TILE_BORDER = 'border-[#eee] dark:border-[#2d3748]'
export const TILE_HOVER =
  'hover:border-[#93c5fd] hover:shadow-[0_2px_10px_rgba(15,23,42,0.10)] dark:hover:border-[#3b82f6] dark:hover:shadow-[0_2px_10px_rgba(0,0,0,0.35)]'
/** The drop box on the hovered tile (B25): the only border colour while it shows, in both themes. */
export const TILE_DROP = 'border-spert-blue'
/** An archived tile's border at rest (D20): dashed. Swapped out whole for TILE_DROP, like TILE_BORDER. */
export const TILE_ARCHIVED_BORDER = 'border-dashed border-[#ddd] dark:border-[#4a5568]'

export const NAME_ROW = 'flex items-start gap-1.5'
/** The drag grip, lifted above the name button's `::after`: under it, no drag can start (measured). */
export const GRIP = 'relative z-[1] flex-none inline-flex mt-[5px] cursor-grab'
export const NAME =
  'flex-auto min-w-0 m-0 pt-px text-[1.05rem] font-semibold leading-[1.35] [overflow-wrap:anywhere]'
/** The name's colour; an archived tile's name takes the meta colour instead (D20). */
export const NAME_COLOR = 'text-[#333] dark:text-[#e2e8f0]'
export const NAME_ARCHIVED = 'text-[#666] dark:text-[#a0aec0]'
/** The name button. Its `::after` covers the whole tile, so a click anywhere on the tile opens Sprint History (D15). */
export const OPEN =
  "bg-transparent border-0 p-0 m-0 text-left font-semibold cursor-pointer underline-offset-[3px] group-hover/tile:underline focus-visible:underline focus-visible:outline-none after:absolute after:inset-0 after:rounded-[6px] after:content-[''] focus-visible:after:shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#0070f3] dark:focus-visible:after:shadow-[0_0_0_2px_var(--color-gray-900),0_0_0_4px_#60a5fa]"
export const BADGE =
  'flex-none self-center px-[7px] py-px rounded-[4px] text-[0.72rem] font-semibold leading-[normal] whitespace-nowrap bg-[#e5e7eb] text-[#374151] dark:bg-[#2d3748] dark:text-[#e2e8f0]'
/** Above the name button's `::after`, for the controls that carry no `z-[1]` of their own (v0.48.2's shared buttons). */
export const ABOVE_OPEN = 'relative z-[1]'
export const META = 'm-0 pl-4 text-[0.85rem] leading-[1.45] text-[#666] dark:text-[#a0aec0]'
export const ACTIONS = 'flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 mt-auto pt-1.5 pl-2.5'
/**
 * The revealed row: hidden at rest, shown on tile hover, on focus inside the tile, while the
 * tile's colour popover is open (`data-popopen="true"` on the tile root, v0.50.0, GanttApp
 * parity), and always where there is no hover.
 */
export const REVEAL =
  'flex flex-wrap items-center gap-0.5 opacity-0 transition-opacity duration-[120ms] ease-in-out group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 group-data-[popopen=true]/tile:opacity-100 [@media(hover:none)]:opacity-100'
/** An archived tile's Unarchive group: always shown (D4). Carries ABOVE_OPEN where it is used. */
export const STAY = 'flex flex-wrap items-center gap-0.5'

export const NOTE = 'text-sm text-spert-text-secondary dark:text-gray-300'

/** "Show archived (N)" (v0.50.0, GanttApp's `.pt-check`). */
export const CHECK = 'inline-flex items-center gap-2 text-[0.9rem] leading-[normal] cursor-pointer text-[#666] dark:text-[#a0aec0]'
export const CHECKBOX = 'size-4 m-0 accent-spert-blue'
// "All projects are archived…" takes ALL_ARCHIVED_CLASS (`@/shared/components/AllArchivedNotice`),
// one string for Projects, Sprint History and Forecast.

// ── The project dialog (GanttApp's ProjectDialog shape; Forecaster's fields) ──
export const OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50'
export const DIALOG =
  'w-full max-w-[560px] max-h-full overflow-auto px-8 py-7 rounded-[12px] text-[#333] dark:text-[#e2e8f0] shadow-[0_20px_60px_rgba(0,0,0,0.3)]'
/** The dialog's surface: the untinted tile's colour (D18). */
export const DIALOG_BG = 'bg-[#f9f9f9] dark:bg-[#16213e]'
export const DIALOG_TITLE = 'text-xl leading-[normal] font-bold mb-4'
export const FIELD = 'mb-[0.9rem] min-w-0'
export const LABEL = 'block mb-[0.3rem] text-sm font-semibold leading-[normal] text-[#666] dark:text-[#a0aec0]'
/** A field, without its border colour (INPUT_BORDER, or INPUT_BORDER_ERROR in its place). */
export const INPUT_BASE =
  'w-full px-3 py-[0.6rem] text-base leading-[normal] border rounded-[4px] bg-white text-[#333] placeholder:text-[#666] dark:bg-[#2d3748] dark:text-[#e2e8f0] dark:placeholder:text-[#a0aec0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0070f3] dark:focus-visible:outline-[#60a5fa] disabled:cursor-not-allowed disabled:opacity-70 dark:[color-scheme:dark]'
export const INPUT_BORDER = 'border-[#8a8a8a] dark:border-[#8b9bb4]'
/** A date the form refuses: Forecaster's error border, in both themes. */
export const INPUT_BORDER_ERROR = 'border-spert-error'
export const DIALOG_BUTTONS = 'flex flex-wrap justify-end gap-3 mt-5'
const DIALOG_BUTTON =
  'inline-flex items-center gap-[0.4rem] px-5 py-[0.6rem] border rounded-[6px] text-[0.9rem] leading-[1.3] whitespace-nowrap cursor-pointer font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070f3] dark:focus-visible:outline-[#60a5fa]'
/** Cancel / Close: the secondary look at the dialog's size, weight 600 (GanttApp's `.pt-dlg-buttons .pt-btn`). */
export const DIALOG_CANCEL = `${DIALOG_BUTTON} bg-white text-[#333] border-[#8a8a8a] enabled:hover:bg-[#f5f5f5] dark:bg-gray-900 dark:text-[#e2e8f0] dark:border-[#8b9bb4] dark:enabled:hover:bg-[#2d3748]`
/** Add Project / Update Project. */
export const DIALOG_SUBMIT = `${DIALOG_BUTTON} bg-spert-blue text-white border-spert-blue enabled:hover:bg-[#005bc4] enabled:hover:border-[#005bc4]`
export const HINT = 'mt-3 text-right text-[0.78rem] leading-[normal] text-[#666] dark:text-[#a0aec0]'
export const REASON = 'mb-3 text-sm text-spert-text-secondary dark:text-gray-300'
