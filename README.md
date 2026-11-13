<p align="center">
  <img src="assets/smugvtt-golden-apple.png" alt="SmugVTT golden apple" width="128">
</p>

<h1 align="center">SmugVTT</h1>

<p align="center">
  <strong>Three Pillars. One Tabletop.</strong><br>
  <em>A VTT should adapt to the way people play.</em>
</p>

<p align="center">
  <a href="#the-idea">The idea</a> ·
  <a href="#project-status">Project status</a> ·
  <a href="#direction">Direction</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#credits-and-license">Credits</a>
</p>

---

## The idea

**SmugVTT** is an independently maintained fork of [CozyVTT](https://github.com/CheekyChinchilla/CozyVTT), created to explore a virtual tabletop that adjusts to different ways of playing rather than expecting every session to follow the same workflow.

The guiding principle is **Three Pillars. One Tabletop.** A campaign might depend on maps, unfold almost entirely through conversation, or benefit from a space for arranging information and ideas. No single approach should dominate the interface.

This is a **solo-maintained project**, not a company, a team, or an official CozyVTT release. The existing application and most of its functionality come from CozyVTT. SmugVTT's purpose is to take that foundation in a different design direction, with clear credit to the original project.

## The three pillars

| Pillar | Public status | Direction |
| :--- | :--- | :--- |
| **Map** | Existing CozyVTT foundation | A full-screen workspace that can take priority when the table needs it |
| **Chat** | Existing CozyVTT foundation | A first-class part of play, not something that has to compete with the map for attention |
| **Canvas** | **Planned; not released** | A flexible space for free-form material, scene organization, and collaborative ideas |

These are **design goals**, not a claim that SmugVTT invented the existing Map or Chat functionality. In particular, the separate Canvas pillar and the complete three-pillar layout have **not** been released in the public fork.

## Project status

The first public development pass concentrates on establishing an identity and a dependable starting point:

- **SmugVTT branding:** independent project name, golden-apple artwork, browser icons, and application-facing text.
- **Smug Gold:** a default gold-and-slate theme, while preserving the option to choose other themes or custom instance branding.
- **Public documentation:** fork-specific installation instructions, contribution information, and upstream attribution.
- **Compatibility:** existing storage identifiers and archive formats are retained where changing them would require a migration.

**What this is not:** a new VTT engine, a claim of ownership over CozyVTT's features, or a completed redesign. Features inherited from CozyVTT are documented in the existing [User Guide](docs/USER_GUIDE.md) rather than presented here as SmugVTT additions.

## Direction

SmugVTT is intended to become a tabletop that is easier to reshape around a particular game or group. The priorities are:

1. **A more flexible workspace.** Allow Map, Chat, and eventually Canvas to stand on their own instead of following one fixed layout.
2. **Tools without mandatory workflows.** Keep system-specific behavior optional, so the interface does not assume every campaign uses the same rules or structure.
3. **A cleaner public foundation.** Keep the generic fork separate from private campaign material, and review changes for compatibility before incorporating upstream updates.

No release dates are attached to these priorities. The [issues](https://github.com/Huemaster/SmugVTT/issues) and [pull requests](https://github.com/Huemaster/SmugVTT/pulls) show what is actually being worked on.

## Getting started

SmugVTT is self-hosted. The recommended setup uses Docker Compose. A manual installation requires:

- Node.js 26+ (Docker provides its own Node.js runtime).

With Docker, Git, and a modern browser installed, clone the repository and create a local configuration file:

```bash
git clone https://github.com/Huemaster/SmugVTT.git
cd SmugVTT
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` for the last command.

Set unique values for **`DATABASE_PASSWORD`** and **`SESSION_SECRET`** inside `.env`. The session secret must be at least 32 random characters. For example, with OpenSSL:

```bash
openssl rand -hex 16  # database password
openssl rand -hex 32  # session secret
```

Start the application:

```bash
docker compose up -d --build
docker compose logs backend
```

Open **http://localhost** and follow the initial setup. The backend logs provide the one-time setup token. For current controls, including click interactions and keyboard shortcuts, refer to the [User Guide](docs/USER_GUIDE.md).

**Before exposing an instance to the internet**, review the [Deployment Guide](docs/DEPLOYMENT.md) for HTTPS, `CORS_ORIGIN`, proxy settings, account security and backups. Never commit `.env` files, private campaign exports, character records, chat history, or database backups.

The backend switches to an unprivileged `appuser`. In the bundled Nginx containers, the master process runs as root while worker processes run as the `nginx` user. Each container drops every Linux capability except the few its start-up needs. The [deployment documentation](docs/DEPLOYMENT.md) explains the security model in more detail.

### Updating an installation

SmugVTT does not automatically follow every CozyVTT release. Upstream changes may include database migrations and changes to stored data. Back up an installation and test important custom material on a disposable copy before upgrading.

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) — hosting, configuration, hardening and backups
- [User Guide](docs/USER_GUIDE.md) — reference for existing application functionality
- [Development Guide](docs/DEVELOPMENT.md) — building and testing the code
- [Branding Guide](docs/BRANDING.md) — SmugVTT's visual identity
- [Contributing](docs/CONTRIBUTING.md) — bug reports and proposed changes
- [Security Policy](SECURITY.md) — reporting vulnerabilities privately

Bug reports and focused proposals are welcome. Please use **fictional examples** rather than personal information or private campaign files.

## Credits and license

SmugVTT is based on **[CozyVTT](https://github.com/CheekyChinchilla/CozyVTT)**. The original maintainers and contributors deserve credit for the code and functionality that form this fork's foundation. SmugVTT is independent and is not endorsed by the CozyVTT project.

The source remains licensed under the [GNU Affero General Public License v3.0](LICENSE). Original copyright notices and applicable third-party and game-content attributions are retained:

- [Third-party licenses](THIRD_PARTY_LICENSES.md)
- [Third-party notices](THIRD_PARTY_NOTICES.txt)
- [SRD attribution](SRD_ATTRIBUTION.md)
