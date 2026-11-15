# Stage v1 — unified visual scene design (development)

**Status:** Draft PR; not part of released SmugVTT v0.9.0. No release or merge is implied.

The Stage is the user-facing direction for the existing **Canvas + Scene** records.
Map handles spatial/tactical play; Chat owns canonical conversation and dice;
Stage composes visual-novel and 16/32-bit-JRPG-style roleplay presentations.

## Design contract

- **Large, fixed starting size:** New images begin at 640 × 480 Stage units, but can
  be freely dragged and resized. The visual field is currently 1600 × 900 units.
- **No dedicated background image slot:** Illustrations, landscapes, transparent
  characters, props and other art are all image objects with user-selected positions
  and dimensions. The existing flat Stage background color is not an image layer.
- **GIF allowed:** The existing campaign image upload accepts GIFs along with PNG,
  JPEG and WebP. No video playback support is proposed in v1.
- **Optional snap:** Freeform positioning is the default. Each editor can turn on
  a 20-unit snap for dragging and resizing, without imposing a tactical grid.
- **Retain existing layers:** z-order, lock, hidden, rotation, duplication and
  imported compositions stay in the Canvas storage/rendering substrate; no
  parallel Stage renderer or second chat history is introduced.
- **Right-click > Speaking as / Character is:** Link an image to a character or
  NPC's canonical IC Chat speaker identity. Speech bubbles follow linked art,
  and active speakers are highlighted.
- **Dialogue styles:** Choose speech bubbles, a large visual-novel dialogue box,
  or an austere 16/32-bit-JRPG-inspired box. These are view preferences; Chat
  messages remain canonical. Only explicitly quoted IC speech appears.
- **Silent bounded effects:** Images can use Float, Bob, Shake, Hop, Pulse,
  Fade, Slide and Jolt. Graphic mood indicators cover anger, stress, sweat,
  gloom, alert, question, exclamation, sparkle, heart and thought. These are
  consistent vector game-status-style marks, **not OS/phone emoji**. Each
  manual/Chat-triggered cue plays only three cycles, and
  `prefers-reduced-motion` disables movement.
- **GM permission first:** Player editing defaults **off** and is enabled only
  by a GM switch for an active shared/revealed scene. Players may drag or
  resize **visible unlocked** elements; they cannot replace board JSON,
  change speakers or edit hidden GM elements. The transform endpoint accepts
  only dimensions and position, checks a board version, and preserves hidden
  elements on the server. Spectators cannot edit.

## Persistence and rollout

This first slice extends existing scene-board JSON without a database migration.
The existing record continues to hold both Canvas elements and any legacy
`smugSceneStage` field; neither is deleted by this implementation.

**Unified navigation (follow-up stacked PR):** The desktop workspaces use
**Map / Chat / Stage** without a separate fourth Scene button. The full-size
Stage is still the existing Canvas scene-board renderer. The legacy small
Scene cast is retained as a read-only-ish Chat-side *Scene preview* so no
stored cast is discarded. GMs may explicitly choose **Import existing Scene
cast** in Stage Options: it copies linked images into large freeform picture
elements without rewriting or removing the older `smugSceneStage` record.
GMs should review positions and save the composition before presenting.

**Known limitations:** Saved Stage edits are propagated using the existing
scene polling, not a new real-time room-wide collaboration socket.
Concurrent writes can require a reload after HTTP 409. Multi-object player
drags are sequential scoped writes; there is no atomic group transform yet.
The legacy small-portrait Scene surface has not been removed in this slice;
its migration to freeform Stage objects must be handled without destroying
existing scene/cast data. Live animated image behavior still depends on
the browser's GIF support and the hosting server's image upload limits.

## Next slices, in order

1. Complete Stage usability testing on both desktop and compact layouts,
   including legacy cast import with different compositions and independent
   GM/player accounts; preserve the old stored data until migration is verified.
2. Replace polling with reliable, permission-aware live board updates and
   conflict-safe object edits; test GM + player + spectator simultaneously.
3. Add expression-set/pose swapping, controllable camera focus, timed
   transitions and saved stage-layout presets without introducing video.
4. Add optional advanced VN presentation macros and soundtrack cues only
   with explicit GM controls. **v1 uses no sound effects**.

All changes must remain separate from the Windows Portable work and upstream
CozyVTT backports, and must pass frontend, backend/PostgreSQL, docs, security
and production Docker/browser checks before consideration for merge.
