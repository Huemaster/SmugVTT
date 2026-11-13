<p align="center">
  <img src="assets/smugvtt-golden-apple.png" alt="SmugVTT golden apple emblem" width="128">
</p>

<h1 align="center">SmugVTT</h1>

<p align="center">
  <strong>Three Pillars. One Tabletop.</strong><br>
  <em>A VTT should adapt to the way people play.</em>
</p>

<p align="center">
  <a href="#the-three-pillars">Three pillars</a> ·
  <a href="#features-available-today">Features</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="#documentation-and-contributing">Documentation</a> ·
  <a href="#origin-and-license">Credits</a>
</p>

---

## A tabletop that leaves room for your rules

**SmugVTT** is a free, open-source, self-hosted virtual tabletop for groups who want one place to prepare, run and remember their RPG sessions. Bring your own world, your own rules and your own pace - and keep your campaign on infrastructure you control.

Put a tactical map in front of everyone when positioning matters. Run a session through conversation when it doesn't. Switch between tools as the story demands. Our long-term goal is a workspace where **Map, Chat and Canvas are equally useful ways to play**, rather than requiring every game to fit one kind of screen.

SmugVTT is an **independent fork of [CozyVTT](https://github.com/CheekyChinchilla/CozyVTT)**. We build on its existing foundation while developing our own visual identity, interface priorities and project direction. SmugVTT is not affiliated with or endorsed by CozyVTT's maintainers.

## The three pillars

| Pillar | Availability | Purpose |
| :--- | :--- | :--- |
| **Map** | Available now | Shared maps, tokens, visibility, lighting, and drawings for spatial play |
| **Chat** | Available now | Campaign conversation, whispers, dice rolls, and the record of what happened |
| **Canvas** | Planned | A separate, flexible workspace for free-form scenes, planning and visual collaboration |

**What's shipped versus what's planned:** Map and Chat already work. A standalone general-purpose **Canvas** workspace is part of the SmugVTT roadmap, **not** a released feature. Our initial public branding pass changes the app's identity and documentation; it does not yet implement the complete three-pillar layout.

Different groups need different tools. Some lean on a battlemap, others never open one, and many move between character moments, notes and encounters in the same night. SmugVTT's guiding idea is to support those choices instead of deciding how a table ought to play.

## Features available today

### Build scenes and run encounters

- **Maps with depth:** upload maps or paint them in the built-in map editor, then add fog of war, walls, windows, doors, and light sources as needed.
- **Tokens with purpose:** manage player characters, NPCs and objects, with hit points, conditions, visibility controls, stat blocks and reusable token templates.
- **Shared situational awareness:** use map pings, live drawings, initiative tracking, and session controls to keep the table oriented.
- **Optional structure:** use lighting and sightlines when they improve the game; choose a lighter setup when they don't.
- **Current token controls:** click a token to pick it up and click its destination to put it down, or select it and move it with the arrow keys.

### Keep the conversation together

- **Chat with context:** group messages, private whispers and a history of what the players said.
- **Dice at the table:** dice expressions, saved rolls and roll history without switching services.
- **Information when it's needed:** notes, handouts, campaign assets, character sheets and a creature library stay part of the same tabletop.
- **Different rulesets:** the current public base includes built-in sheets for D&D 5e, Pathfinder 2e and Call of Cthulhu 7e, along with flexible custom sheets.
- **More than one campaign:** separate games, memberships and permission levels can share the same server.

### Make the installation your own

- **A recognizable identity:** the golden apple, browser and home-screen icons, and the **Smug Gold** theme set this fork apart.
- **Theme choice stays yours:** other preset themes, fonts and administrator-defined branding remain available. Gold isn't mandatory.
- **Self-hosting first:** Docker Compose runs the frontend, backend, Nginx and PostgreSQL on infrastructure you administer.

Some technical names remain from upstream **on purpose**. They include selected `60zyvtt` storage keys, package/database identifiers and the `.cozyvtt` campaign archive extension. Changing those without migration work could damage compatibility with existing data and installations.

## Where SmugVTT is going

Our direction is **flexibility without imposing a rulebook**: a tabletop where the map, the conversation and the future Canvas receive equal attention, optional systems stay optional, and a GM can shift between light and structured play.

The public work is being developed in stages:

1. **Independent identity and dependable basics.** Branding, documentation, privacy-safe public examples, theme consistency and automated checks.
2. **A more adaptable workspace.** Make it easier to use Map and Chat together and develop the distinct Canvas pillar.
3. **System-friendly tools.** Better support for a range of rulesets and table styles without treating one campaign as the default.

These are priorities, not release dates or promises that unfinished features already exist. The [issues](https://github.com/Huemaster/SmugVTT/issues) and [pull requests](https://github.com/Huemaster/SmugVTT/pulls) show what's actually underway.

## Get started

### Quick start: Docker Compose

You'll need Docker with Compose, Git, and a modern browser. If installing without Docker, the runtime requirement is:

- Node.js 26+ (Docker provides Node.js inside its images).

Clone the project and create a private environment file:

```bash
git clone https://github.com/Huemaster/SmugVTT.git
cd SmugVTT
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` in place of the final command.

Open `.env` and replace the placeholders for **`DATABASE_PASSWORD`** and **`SESSION_SECRET`**. The session secret needs at least 32 characters of random text. If OpenSSL is installed, you can generate values like this:

```bash
openssl rand -hex 16  # example database password
openssl rand -hex 32  # example session secret
```

Then start the included services:

```bash
docker compose up -d --build
docker compose logs backend
```

Open **http://localhost** and finish the setup wizard. The backend logs provide a one-time setup token for creating the initial administrator.

For access from outside your machine, set up HTTPS, your public URL/`CORS_ORIGIN`, trusted proxy or tunnel settings, authentication safeguards, and backups **before** sharing an address. Read the [Deployment Guide](docs/DEPLOYMENT.md) and its hardening checklist. Do not upload `.env`, database backups, private campaigns or session logs to a public repository.

The backend switches to an unprivileged `appuser`. In the bundled Nginx containers, the master process runs as root while worker processes run as the `nginx` user. Each container drops every Linux capability except the few its start-up needs. The deployment guide explains the complete security model.

### About upgrades

SmugVTT does **not** automatically track each CozyVTT release. An upstream update may include database migrations or changes to character-sheet data. Back up first, check this repository's own release notes, and test important custom material on a disposable copy before upgrading a live instance.

## Documentation and contributing

| Resource | What you'll find |
| :--- | :--- |
| [Deployment Guide](docs/DEPLOYMENT.md) | Networking, Docker, hardening, storage, updates and backups |
| [User Guide](docs/USER_GUIDE.md) | Using the features that exist today |
| [GM Guide](docs/DM_GUIDE.md) and [Player Guide](docs/PLAYER_GUIDE.md) | Preparing, hosting and joining sessions |
| [Development Guide](docs/DEVELOPMENT.md) | Local development and automated checks |
| [Branding Guide](docs/BRANDING.md) | Golden apple artwork, palettes and instance customization |
| [Contributing](docs/CONTRIBUTING.md) | Bug reports, feature proposals and pull requests |
| [Security Policy](SECURITY.md) | Responsible security reporting |

Feedback and focused contributions are welcome via [GitHub Issues](https://github.com/Huemaster/SmugVTT/issues) and pull requests. **Use fictional sample data when reporting bugs.** Never attach private character sheets, real campaign exports, secret values, personal information, or sensitive logs.

The stack uses React, TypeScript, Express, Socket.IO, Prisma and PostgreSQL. Some implementation and documentation references still carry upstream terminology because SmugVTT evolves from an established codebase rather than being rebuilt from scratch.

## Origin and license

SmugVTT owes its foundation to the work of the **[CozyVTT developers and contributors](https://github.com/CheekyChinchilla/CozyVTT)**. We retain their authorship and license obligations. This fork is an independent project, not an official CozyVTT release.

The source is distributed under the [GNU Affero General Public License v3.0](LICENSE). Existing copyright notices and third-party/game-content attributions remain in place:

- [Third-party licenses](THIRD_PARTY_LICENSES.md)
- [Third-party notices](THIRD_PARTY_NOTICES.txt)
- [SRD attribution](SRD_ATTRIBUTION.md)

---

<p align="center"><strong>Three Pillars. One Tabletop.</strong><br><em>Make room for the way your group plays.</em></p>
