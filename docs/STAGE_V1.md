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
- **GIF allowed:** Stage uploads share the campaign MAP image library, which
  now permits genuine GIF files alongside PNG, JPEG and WebP. The server
  inspects file magic bytes, forces the actual extension and applies its
  existing frame/pixel safety caps; a filename ending in .gif is not enough.
  Animated GIF artwork is supported, not videos. Large animated images may
  still cost significant memory on players' devices.
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
  resize **visible unlocked pictures**; they cannot replace board JSON,
  change speakers or edit hidden GM elements. The transform endpoint accepts
  only dimensions and position, checks a board version, and preserves hidden
  elements on the server. Spectators cannot edit.

## Persistence and rollout

This first slice extends existing scene-board JSON without a database migration.
The existing record continues to hold both Canvas elements and any legacy
`smugSceneStage` field; neither is deleted by this implementation.

**Unified navigation (stacked PR #17):** The desktop workspaces use **Map / Chat /
Stage** without a separate fourth Scene button. The full-size Stage is still
the existing Canvas scene-board renderer. Chat has a **Stage shortcut**, not a
second miniature Scene editor. Older Scene cast data stays in the database,
unchanged. GMs may explicitly choose **Import existing Scene cast** in Stage
Options: it copies linked images into large freeform picture elements without
rewriting or removing the older `smugSceneStage` record. GMs should review
positions and save the composition before presenting.

**Known limitations:** Saved Stage edits are propagated using the existing
scene polling, not a new real-time room-wide collaboration socket.
Concurrent writes can require a reload after HTTP 409. Multi-object player
drags are sequential scoped writes; there is no atomic group transform yet.
The legacy small-portrait Scene implementation remains in the source as a
compatibility reference but is no longer surfaced as a competing editor in
Chat. Import and saved-stage compatibility require continued testing. Live animated image behavior still depends on
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

## UX pass — checks and limits

The following regressions were found during source/interaction review and
fixed in the Stage unification branch:

- Normal four-second player board polling used to call the initial-load
  routine, clearing selected pictures and the resize handle. Routine refreshes
  now apply changed board snapshots without clearing selection; an in-flight
  drag/save is protected from an incoming poll.
- Right-clicking a picture could also begin a drag. Only primary-button
  events can begin moving or resizing.
- New 640×480 pictures began at 180,120, often under the floating table rail.
  The first now starts at 480,210, with small offsets for additional uploads.
- Chat's old 80-pixel Scene cast editor created a confusing second place to
  arrange portraits. The Chat rail now links back to one full-size Stage.
- VN/JRPG dialogue modes previously retained a misleading "Bubbles On"
  toggle label. They now use the neutral "Dialogue On/Off" wording.
- The GM's player-editing switch now states that it applies to unlocked
  pictures and warns if the scene is not yet revealed and shared.
- The first production Playwright run discovered that Stage offered GIF uploads
  but the backend MAP image MIME list excluded them. Both frontend and backend
  upload-type tables now allow validated GIF MAP assets, with the existing
  content-sniffing and animated-picture size limits unchanged.
- The full frontend suite still contained a pre-Stage upload test expecting MAP GIFs to be refused; the Stage branch now tests that MAP GIFs are accepted by the upload dialog, retaining the unrelated audio/document rejection cases.
- Once GIF uploads passed, four-browser Playwright testing caught a Chat
  "speaking as" presence card intercepting taps over Stage art on compact
  screens. Stage now hides that redundant overlay (the current speaker remains
  visible on the Stage image), without removing it from Map/Chat.
- A tall right-click Stage menu extended beyond the iPad viewport, so its
  Play Cue button was unreachable. The menu now clamps its origin to the
  viewport and scrolls internally.

**Automated behavior coverage:** `stageUX.test.ts`,
`SceneBoardUX.test.tsx`, `CampaignPageLayout.test.tsx`,
and production Playwright `frontend/e2e/stage.spec.ts` test version-aware
refreshes, disabled right-click dragging, shared-picture editing, three-pillar
navigation, GIF upload, default placement, dialogue styles and permissions.
The Playwright flow runs against the full production stack in four browser
projects (desktop Chromium, Pixel-sized Chromium, iPhone WebKit, iPad WebKit).
These tests are **not verified as passing until CI reports success**.

**Manual UX acceptance still needed before merge:** Test a real GM, player
and spectator concurrently. Drag while the four-second poll fires; resize
transparent and tall art; inspect GIF frames and overlays at 25%, Fit and 100%;
confirm emotes play exactly three silent cycles, including reduced-motion;
confirm old Scene cast import preserves originals and avoids duplicates;
exercise mouse, touch, keyboard and screen-reader focus; switch between Map,
Chat and Stage with unsaved changes and reconnect after a network drop.
These multi-user and visual acceptance checks cannot be proved by a simple
source review or test inventory alone.
