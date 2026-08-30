# SPERT Suite — Import Spec Deviations

This file tracks deliberate deviations from `IMPORT-SPEC-REFERENCE.md` in
SPERT Forecaster. Each entry documents the deviation, why it was made, and
how the deviation is mitigated.

## SD-1: Import copy-suffix changed from `' (2)'` to `' - Copy (N)'` (v0.34.0)

**Spec reference:** `IMPORT-SPEC-REFERENCE.md` line 408 —
`'copy' — new ID, ' (2)' suffix (unconditional)`.

**Change:** The import copy path now uses the same `' - Copy (N)'` naming
convention as the Projects-tab Clone button (which has always used this
convention — see `cloneProject` in `src/shared/state/project-store.ts`). The
old hardcoded `' (2)'` suffix is replaced by the iterating `nextCopyName()`
helper shared between the import copy path and `cloneProject`.

**Consequence:** Users who previously imported duplicate projects saw `"X (2)"`.
After v0.34.0, they see `"X - Copy (1)"`. User-visible on any import where a
copy decision was made.

**Mitigation:** Both import and clone paths now use the same shared
`nextCopyName()` helper, ensuring consistent naming across all duplication
paths. The CHANGELOG discloses the rename, and the helper handles trailing
whitespace and intra-batch collisions automatically.

**Source comment:** See the `nextCopyName` JSDoc in
`src/shared/state/import-utils.ts` for the `SD-1` reference, and the
matching usage in `cloneProject` (`src/shared/state/project-store.ts`).

## SD-2: `update` availability no longer requires an ID conflict, and the field-class table moves into the source (v0.43.0)

**Spec reference:** `IMPORT-SPEC-REFERENCE.md` §3 — the per-field merge-class
table and clause **C7**, *"`update` requires an ID conflict"*. ⚠️ **Neither the
spec file nor its only other copy is reachable from a checkout:**
`IMPORT-SPEC-REFERENCE.md` is gitignored and absent, and the reconciliation that
elaborated it lives in the merged body of PR #193, which needs network. **That
unreachability is itself part of what this entry fixes.**

**Change:** three coupled parts.

1. **C7 is replaced by a positive-evidence rule.** `update` is offered when the
   incoming payload demonstrates it is the *same project*, not merely that it
   arrived under the same ID. An ID conflict *is* that evidence; a **name**
   conflict must supply it as **at least one shared sprint ID**
   (`hasMatchingExistingSprintId`). The pre-existing §4.1 rule — no existing
   sprint absent from the incoming set — is unchanged and still applies.
2. **`mergeProjectForUpdate` now pins `id: existing.id` explicitly.** Under C7,
   `id`/`projectId` were no-ops *by construction* because incoming and existing
   IDs were necessarily equal. ⚠️ **Relaxing C7 destroys that invariant**, and
   without the pin the merged project would silently adopt the incoming
   (Story Map) ID while its sprints were remapped to the existing one —
   orphaning every sprint. PR #193's reconciliation warned of exactly this:
   *"a dependency on C7, not a triviality: change C7 and they become live."*
3. **The field-class table now lives in `src/shared/state/import-utils.ts`** as
   three `Record<keyof T, UpdateFieldClass>` constants covering all 29 keys —
   `PROJECT_UPDATE_FIELD_CLASSES` (11), `SPRINT_UPDATE_FIELD_CLASSES` (11),
   `MILESTONE_UPDATE_FIELD_CLASSES` (7).

**Why this became necessary:** `mergeProjectForUpdate` spreads
`{ ...existing, ...incoming }`, which makes *take-incoming* the default for
every key **and does not read the class table**. Four fields have silently
fallen through that default across three revisions — `unitOfMeasure`, then
`createdAt`/`updatedAt`, then `sprintNumber` — each caught by a reviewer rather
than by a check, and the most recent in the *sprint* table. A field added to
`Project`, `Sprint` or `Milestone` without a class entry now fails `tsc`.

**Consequence — user-visible, two ways.**
- After a cloud migration reassigns a project's ID (collision or
  permission-denied), a later Story Map send matches by **name**. Previously
  only skip / copy / **replace** were offered, and `replace` destroys the
  forecast configuration `update` exists to protect. `update` is now reachable
  when identity is demonstrable.
- **The pre-selected default changes** for an evidenced Story Map name conflict:
  from `copy` to `update`. `copy` encodes an assumption — *"same name, different
  project"* — that a shared sprint ID has just falsified.

**Mitigation.**
- The write-time veto **composes through `availableActions`** rather than
  mirroring its logic, so the availability rule has exactly one definition.
  ⚠️ Three hand-mirrors of that rule already existed in this file and **all
  three had gone stale**; a fourth was deliberately not written.
- ⚠️ The tables make omission impossible and the classification **discoverable**;
  they **cannot make it true**. `Record<keyof T, UpdateFieldClass>` accepts any
  member for any key, so a wrong-but-valid entry compiles. Deleting the
  milestone `color`/`showOnChart` claw-backs leaves `tsc` and the whole suite
  green while the table still asserts the opposite. **Do not read a green
  typecheck as "the table is correct."**
- Every guard added here was verified by mutation, not by reading.

**Source comment:** the three constants sit immediately above the
`// --- Update merge: …` banner in `src/shared/state/import-utils.ts`,
module-local and `void`-ed. The comments that previously read *"§3's class
table"* — with no document named — now cite the constants and this entry.
