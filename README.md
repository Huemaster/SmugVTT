<p align="center">
  <img src="assets/smugvtt-golden-apple.png" alt="SmugVTT golden apple" width="128">
</p>

<h1 align="center">SmugVTT</h1>

<p align="center">
  <strong>Three Pillars. One Tabletop.</strong><br>
  <em>A VTT should adapt to the way people play.</em>
</p>

<p align="center">
  <a href="#why-smugvtt">Why SmugVTT?</a> ·
  <a href="#whats-new-in-v090">What's new</a> ·
  <a href="#feature-guide">Features</a> ·
  <a href="#getting-started">Install</a> ·
  <a href="#roadmap-and-limitations">Roadmap</a> ·
  <a href="#credits-and-license">Credits</a>
</p>

[![SmugVTT CI](https://github.com/Huemaster/SmugVTT/actions/workflows/ci.yml/badge.svg)](https://github.com/Huemaster/SmugVTT/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

---

## Why SmugVTT?

**SmugVTT** is a free, self-hosted virtual tabletop for groups who want maps, roleplay, and visual storytelling to matter equally. You can run a conventional tactical session, play mostly through in-character chat, stage an encounter with portraits and illustrations, or move between those styles as the game requires.

The design revolves around three connected spaces:

| Pillar | What you do there |
| :--- | :--- |
| **Map** | Explore, move tokens, track positions, handle tactical encounters and apply visual annotations. |
| **Chat** | Speak as characters, whisper, roll dice, follow the live conversation and preserve campaign history. |
| **Canvas** | Arrange visual material, stage participants and present scenes without making the battlemap the focus. |

**Scenes** tie visual staging to the live in-character conversation. They do not create a second, separate chat history. **Squad Command** is an optional system-oriented layer for units and tactical tools; it is not a requirement for other campaigns.

SmugVTT is an **independent fork of [CozyVTT](https://github.com/CheekyChinchilla/CozyVTT)**, not an official CozyVTT release. CozyVTT supplies the substantial underlying VTT engine, hosting architecture, accounts, campaign management, character sheets, maps, chat, dice, and much more. SmugVTT builds a different workflow on top of that foundation. We retain upstream attribution and the AGPL license.

## Release status

**v0.9.0 is SmugVTT's first integrated public source release.** The code previously described here as a collection of private/local patch builds has been integrated into the public repository. It went through frontend, backend/PostgreSQL, documentation, dependency advisory, and production Docker/browser CI checks as part of [PR #10](https://github.com/Huemaster/SmugVTT/pull/10).

- **Public source:** the default branch contains the integrated SmugVTT features described below, not just a branding-only foundation.
- **Installation:** the supported deployment is self-hosted with Docker Compose. A manual Node.js/PostgreSQL deployment is also documented.
- **Players:** connect through a modern web browser; they do **not** need Docker.
- **Not available yet:** a hosted public trial, an installer-free portable Windows application, and anonymous disposable demo campaigns. These are planned, not part of v0.9.0.
- **Versioning:** v0.9.0 is the **SmugVTT fork's** release number. Some internal package/database identifiers remain compatible with the CozyVTT foundation and must not be renamed without a migration.

For a release-by-release breakdown, see [v0.9.0 release notes](docs/releases/v0.9.0.md) and [CHANGELOG.md](CHANGELOG.md).

## What's new in v0.9.0?

### A connected Map / Chat / Canvas workspace

The campaign UI makes room for a full-width map and accessible conversation, Journal/handouts, Media and Dice panels. You can switch emphasis between tactical and narrative play rather than treating every session as a battlemap encounter.

**Token input is deliberately predictable:** a click or tap selects a token; press, drag and release to move it. A single click does not pick a token up for a second click to place it. Eligible selected tokens can also be moved with the arrow keys. Press **Esc** to clear selection or cancel an in-progress operation where supported. The release includes touch, keyboard and responsive layout regression tests.

Compact token details and hover feedback help GMs see relevant map information without repeatedly opening full character sheets.

### Roleplay-first Chat and Scenes

SmugVTT adds character-oriented presentation, in-character speaker information and portrait-related scene presentation to the existing chat.

- **In-character conversation:** speaker identity, quoted dialogue and staged portrait/speech presentation can accompany the live chat experience.
- **Scene staging:** use the Stage/Canvas workspaces to arrange participants and visual context, with stage state tied to the active stored scene.
- **Saved history:** the Stage reads canonical IC chat messages; it does not create a parallel message database.
- **Message moderation:** message edits, revision history, soft deletion and restoration are covered by permission checks. GM moderation of ordinary public messages does not grant access to private whispers.
- **Whispers:** the inherited private-message system limits recipients; server operators can still access stored data and backups, so this is not end-to-end encryption.
- **Reliability:** after a message mutation is saved, a temporary live-broadcast failure no longer reports that the saved write failed. Clients should still refresh if a connection is interrupted.

Some advanced staging and permission paths remain an active area for real-table playtesting; v0.9.0 is a working public baseline, not a claim of flawless support for every conceivable workflow.

### Canvas and visual presentation

Canvas supports arranging visual elements, scene art and text, with saved board state and GM/shared visibility controls in the scene workflow. Portraits and live dialogue can be presented alongside artwork instead of requiring a tactical map.

Map, Canvas and Scenes are related workspaces but not identical storage systems. Changes to visibility should be tested with a real player account before a campaign uses sensitive GM-only material.

### Optional Squad Command tools

SmugVTT includes the **Squad Command** game-system integration and generic unit-oriented tools. It is optional: groups using other systems should not have Squad Command mechanics imposed on them.

Current integration includes character-sheet and compact combat information, reusable GM NPC/unit concepts, sheetless token/unit interfaces, targeting and range feedback, and status-oriented HUD components. Some specialized actions and rule interactions remain under development and should be confirmed during play, rather than assumed to automate every rule.

For public examples, see [Examples/SquadCommand](Examples/SquadCommand/README.md): sample units and weapons are fictional teaching data, not an exported private campaign or a built-in campaign roster.

### Battlefield overlays and map assistance

The fork includes GM-facing tools for visual tactical zones, such as cover, elevation, smoke, obscuration, healing and hazards. The interface provides editable geometry, translucent/hatched visual treatments, and relevant token/zone feedback.

These tools are intended to assist adjudication, not silently impose one universal combat ruleset. In particular, zone effects, eligibility and one-shot healing behavior should be reviewed by the GM in the campaign's chosen system.

### Permissions, presentation and release hardening

v0.9.0 also brings together co-GM access controls, Scenes/NPC routes, message moderation, clearer mobile touch targets, a consistent SmugVTT title/theme, and documentation aligned with the integrated routes and schema.

The release-candidate consolidation repaired stale tests without disabling the CI gates, including accessibility, token drag/select behavior, compact panel names, scene/chat coverage, database-schema documentation and route-permission test inventory.

## Feature guide

| Area | Available in v0.9.0 | Notes |
| :--- | :--- | :--- |
| Campaigns and accounts | Campaign creation, invites, GM/player/spectator roles | Foundation from CozyVTT; restrict public registration if not needed |
| Maps and tokens | Fog, lighting, walls, rulers, drawings, token movement | Includes SmugVTT selection/drag refinements |
| Chat and dice | Public chat, whispers, dice commands and saved history | Speaker/Scene presentation is extended by SmugVTT |
| Journal and Media | Handouts, assets and presentation panels | Respect owner and GM visibility |
| Canvas and Scene | Saved visual boards and portrait-based live staging | Advanced workflows still need player-side verification |
| Squad Command | Optional system with unit/HUD integrations | Rule automation and edge cases are still evolving |
| Battlefield zones | GM overlays and contextual visual/positional feedback | Not a replacement for GM adjudication |
| Hosting | Docker Compose; documented manual deployment | No bundled one-click desktop installer |
| Public guest demo | **Not yet** | Planned, with fictional content and isolated guests |

## Getting started

The recommended way to host SmugVTT is Docker Compose. The app runs on your own server or PC; **your players open a URL in their browsers**.

**Requirements**

- Docker with Compose v2, Git and a modern browser for the recommended deployment.
- Node.js 26+ for a manual installation (Docker supplies its own Node.js runtime).
- PostgreSQL 15 for a manual installation (Docker supplies a database container).

**1. Get the public source**

~~~bash
git clone https://github.com/Huemaster/SmugVTT.git
cd SmugVTT
cp .env.example .env
~~~

On Windows PowerShell use **Copy-Item .env.example .env** for the last command.

**2. Secure the configuration**

Set **DATABASE_PASSWORD** and **SESSION_SECRET** to unique random values in the local **.env** file. Do not use example/default secrets.

~~~bash
openssl rand -hex 16  # database password; letters and digits only
openssl rand -hex 32  # session secret
~~~

**3. Start the stack**

~~~bash
docker compose up -d --build
docker compose logs backend
~~~

Open **http://localhost** and complete the setup wizard with the setup token in the backend logs.

Do not expose the instance publicly until HTTPS, **CORS_ORIGIN**, proxy settings, registration, account security and backups are configured correctly. The production stack keeps the database/backend ports internal and includes privilege restrictions. For internet access and Cloudflare Tunnel configuration, follow the [Deployment Guide](docs/DEPLOYMENT.md).

**Without Docker:** a manual Node.js 26+/PostgreSQL 15 deployment is supported by the [Deployment Guide](docs/DEPLOYMENT.md#manual-deployment). It is an administrator-oriented setup, **not** yet a portable installer.

### Updating an existing SmugVTT instance

Back up the PostgreSQL database and **backend/uploads/** before changing source or images. Check the migration guidance and test an upgrade against a disposable copy when you have important campaign data. Then rebuild using the documented deployment method.

~~~bash
git pull origin main
docker compose up -d --build
docker compose logs backend
~~~

If you need to revert database migrations, restore the pre-upgrade backup rather than assuming an older app version can read new tables. **Do not merge CozyVTT 1.7 migrations or replace SmugVTT's Prisma schema without a separate compatibility review.** SmugVTT does not automatically follow upstream releases.

## Safety, privacy and data ownership

Self-hosters control their own instance, uploads and database. Public guest access should remain disabled unless the host has deliberately hardened the installation.

- Never commit **.env**, database dumps, uploads, chat transcripts, personal artwork, real campaign records or access tokens.
- Review GM-only Scene/Canvas visibility using a separate player account before a live game.
- The public examples intentionally use fictional, generic sample data; private development campaigns are not bundled as sample adventures.
- Preserve backups before upgrades and protect them as carefully as the database.
- The server operator may read messages and backups; stored whispers are not end-to-end encrypted.
- A future hosted demo will need a separate database, restricted guests, automated reset and upload limits.

## Roadmap and limitations

**Current release:** v0.9.0 integrates the project's first public Map/Chat/Canvas/Scene-focused source baseline, optional squad tooling and reviewed CI repairs.

**Next focus:** player-facing usability, Scene/Canvas permissions and persistence QA, clearer combat feedback, more complete rule-edge testing, and a small set of fictional showcase materials.

**Planned, not shipped:** an isolated browser-accessible public demo, disposable guest campaigns, a Docker-free one-click Windows launcher, and more polished guided onboarding. These are separate projects, not prerequisites to running v0.9.0 yourself.

Development changes should remain small, reviewable and independently testable. Passing CI means the automated checks passed; it does not replace user testing or guarantee compatibility with every local customization.

## Documentation and contributions

- [v0.9.0 release notes](docs/releases/v0.9.0.md) — detailed additions, repairs, verification, known limitations and upgrade guidance
- [Deployment Guide](docs/DEPLOYMENT.md) — production, manual install, backups, hardening and proxies
- [User Guide](docs/USER_GUIDE.md) — general app features
- [DM Guide](docs/DM_GUIDE.md) and [Player Guide](docs/PLAYER_GUIDE.md) — tabletop instructions
- [Development Guide](docs/DEVELOPMENT.md) — working on source and tests
- [Branding Guide](docs/BRANDING.md) — fork identity and compatible branding
- [Contributing](docs/CONTRIBUTING.md) — changes and issue reports
- [Security Policy](SECURITY.md) — reporting vulnerabilities privately
- [Changelog](CHANGELOG.md) — upstream history and fork releases

Feedback from narrative-focused GMs, text-based roleplayers and tactical groups is welcome. When opening an issue, use **fictional examples only** and exclude secrets, personal data, private maps and chat history. Changes should include regression checks where practical.

## Credits and license

SmugVTT is based on [CozyVTT](https://github.com/CheekyChinchilla/CozyVTT). Most inherited core features and much of the architecture originate with CozyVTT's maintainers and contributors, whose work is credited here. SmugVTT is maintained independently and is **not endorsed by CozyVTT**.

SmugVTT remains licensed under the [GNU Affero General Public License v3.0](LICENSE). Existing original copyright notices and relevant third-party attributions are retained:

- [Third-party licenses](THIRD_PARTY_LICENSES.md)
- [Third-party notices](THIRD_PARTY_NOTICES.txt)
- [SRD attribution](SRD_ATTRIBUTION.md)
