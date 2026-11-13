<p align="center">
  <img src="assets/smugvtt-golden-apple.png" alt="SmugVTT golden apple" width="128">
</p>
<h1 align="center">SmugVTT</h1>
<p align="center"><strong>Three Pillars. One Tabletop.</strong><br><em>A VTT should adapt to the way people play.</em></p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#license-and-credits">License &amp; credits</a>
</p>

**SmugVTT** is a free, self-hosted virtual tabletop for playing tabletop RPGs in your browser. Run campaigns, share maps, roll dice, and keep your table connected without relying on a hosted service.

Built on [CozyVTT](https://github.com/CheekyChinchilla/CozyVTT), SmugVTT aims to support different systems and styles of play without prescribing how a group should run its game.

## Features

| | |
| --- | --- |
| **Maps and tokens** | Interactive maps, token management, fog of war, walls, lighting, pings, and drawings |
| **Chat and dice** | Real-time campaign chat, whispers, dice notation, saved rolls, and roll history |
| **Character sheets** | D&D 5e, Pathfinder 2e, Call of Cthulhu 7e, and flexible custom sheets |
| **Campaign management** | Multiple campaigns, user roles, sessions, handouts, notes, and an initiative tracker |
| **Customization** | Theme and font choices, instance branding, and reusable creature and token templates |
| **Self-hosting** | Docker Compose deployment with PostgreSQL, a Node.js backend, and a React frontend |

The current application supports **map-based play** and **chat/dice**. A separate general-purpose **Canvas** workspace is part of the project's design direction; it isn't a shipped standalone feature yet. The guiding idea is to make Map, Chat, and Canvas equally useful ways to play.

See the [User Guide](docs/USER_GUIDE.md) for more detail on the existing tools.

## Quick start

**Requirements:** Docker with Docker Compose, Git, and a modern web browser. This is the recommended self-hosted installation method.

~~~bash
git clone https://github.com/Huemaster/SmugVTT.git
cd SmugVTT
cp .env.example .env
~~~

On Windows PowerShell, replace the last command with `Copy-Item .env.example .env`.

Open `.env` and replace the placeholder values for **`DATABASE_PASSWORD`** and **`SESSION_SECRET`** with strong, unique secrets. The session secret must be at least 32 characters long. For example, on a system with OpenSSL:

~~~bash
openssl rand -hex 16   # database password
openssl rand -hex 32   # session secret
~~~

Then start the production-oriented Docker stack:

~~~bash
docker compose up -d --build
docker compose logs backend
~~~

Open **http://localhost** in your browser and complete the setup wizard. The backend logs contain the one-time setup token requested by the wizard.

For public access, configure the correct `CORS_ORIGIN`, HTTPS, trusted proxy settings, and backups before sharing your instance. See the [Deployment Guide](docs/DEPLOYMENT.md) for detailed setup, upgrades, and troubleshooting. Your data lives on infrastructure you control.

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) — Docker, networking, updates, backups, and troubleshooting
- [User Guide](docs/USER_GUIDE.md) — platform features and everyday use
- [GM Guide](docs/DM_GUIDE.md) · [Player Guide](docs/PLAYER_GUIDE.md) — using SmugVTT at the table
- [Development Guide](docs/DEVELOPMENT.md) — working on the code
- [Branding Guide](docs/BRANDING.md) — artwork, palette, and appearance settings
- [Security Policy](SECURITY.md) — safe deployment and vulnerability reporting

## Project and contributions

SmugVTT is independently maintained. Feedback, bug reports, and contributions are welcome through this repository's [Issues](https://github.com/Huemaster/SmugVTT/issues) and pull requests.

The application uses React, TypeScript, Express, Socket.IO, PostgreSQL, and Prisma. The existing documentation and some technical identifiers retain their upstream names for compatibility.

## License and credits

SmugVTT is an **independent fork of [CozyVTT](https://github.com/CheekyChinchilla/CozyVTT)**. Credit belongs to CozyVTT's original maintainers and contributors for the foundation of this project. SmugVTT is not an official CozyVTT release.

The code is available under the [GNU Affero General Public License v3](LICENSE). The original license notices and applicable third-party attributions are retained; see [Third-Party Licenses](THIRD_PARTY_LICENSES.md), [Third-Party Notices](THIRD_PARTY_NOTICES.txt), and [SRD Attribution](SRD_ATTRIBUTION.md).
