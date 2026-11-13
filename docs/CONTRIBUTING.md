# Contributing to SmugVTT

SmugVTT is an independently maintained fork of [CozyVTT](https://github.com/CheekyChinchilla/CozyVTT). Contributions are welcome, but maintainership is volunteer-based and acceptance is not guaranteed.

## Bugs and feature requests

Before opening a new report, search [existing issues](https://github.com/Huemaster/SmugVTT/issues). For bugs, include a short reproduction, expected and actual behavior, the affected version/commit, your browser and operating system, and whether you use Docker or a manual installation.

For significant feature work, open an issue to discuss the approach before submitting a large pull request. Keep pull requests focused, explain the change and its impact, and include tests when behavior changes.

**Security reports must not be filed publicly.** Follow the [security policy](../SECURITY.md) and use private vulnerability reporting when available.

**Never include passwords, tokens, `.env` files, database backups, private campaigns, real character records, private chat logs, or other personal information** in issues, examples, logs, screenshots, or pull requests. Use fictional test data.

## Working on the code

The project has a React/TypeScript frontend, Node.js/TypeScript backend, PostgreSQL database, and Docker Compose deployment. Start with the [development guide](DEVELOPMENT.md).

From `frontend/`, relevant checks include:

```bash
npm ci
npm run typecheck
npm run lint
npm run test:run
npm run build
```

From `backend/`, the commands include:

```bash
npm ci
npx prisma generate
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

Backend integration tests require a test PostgreSQL database. The existing [GitHub Actions workflow](../.github/workflows/ci.yml) also checks documentation, dependencies, production images, and browser smoke tests.

Use the project's existing lint rules and design tokens. Do not introduce hardcoded colors into themed UI, and preserve keyboard and screen-reader accessibility. Keep frontend and backend data contracts in sync when changing shared behavior.

## Compatibility and attribution

The `.cozyvtt` archive extension, database names, package identifiers, and some browser storage keys are compatibility-sensitive; do not rename them without migration work.

Retain original copyright notices and the [AGPL-3.0 license](../LICENSE), along with applicable [third-party licenses](../THIRD_PARTY_LICENSES.md) and [notices](../THIRD_PARTY_NOTICES.txt). Contributions to this repository must be compatible with AGPL-3.0.

SmugVTT is an independent fork, not the official CozyVTT project.
