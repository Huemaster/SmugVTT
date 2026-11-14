# SmugVTT branding guide

SmugVTT is an independent virtual-tabletop fork of [CozyVTT](https://github.com/CheekyChinchilla/CozyVTT).

## Identity
- **Name:** SmugVTT
- **Tagline:** Three Pillars. One Tabletop.
- **Motto:** A VTT should adapt to the way people play.
- **Symbol:** a golden pixel-art apple with a green leaf.
- **Colors:** gold `#D8A83E`, amber `#95631F`, ink `#19191F`, slate `#30313B`, ivory `#F1E9DA`.
- **Editable icon master:** `assets/brand-apple.svg`; PNG icons in `frontend/public` and `assets/default-logo.png`.

The Smug Gold theme is the default for new installations, but the brand palette is **not** a forced user theme. Preserve existing themes and per-instance logo/mascot customization.

## Current release scope
SmugVTT v0.9.0 integrates the fork's public Map / Chat / Canvas / Scene-oriented source baseline, optional Squad Command tooling and reviewed frontend/backend CI repairs. Product naming, default artwork, web manifest, browser metadata and repository presentation use SmugVTT branding. See [the release notes](releases/v0.9.0.md) for shipped functionality, known limitations and future work. Do not imply the experimental hosted demo or portable installer is already available.

## Compatibility
Do not globally rename lowercase `cozyvtt` identifiers. Browser storage keys (`cozyvtt_user_theme`, `cozyvtt_prefs`), archive suffixes, persisted settings, database names, API identifiers and package names may be needed for upgrades or user-data portability. Change any of them only with an explicit migration and tests. Existing customized instance names and user preferences must remain untouched.

## Credits and license
Retain the AGPL-3.0 license, upstream attribution and third-party notices. SmugVTT is not an official CozyVTT release. The fork funding page must not silently redirect donations to upstream or an unverified account.

## Before publishing a release
- Validate a fresh setup and upgrade from an existing CozyVTT instance.
- Check login, dashboard, setup wizard, PWA metadata and browser icons.
- Check existing user themes and admin-installed branding.
- Run `npm run typecheck`, `npm run lint` and `npm run test:run` in the frontend, plus backend tests.
- Review release contents and complete the normal quality checks.
