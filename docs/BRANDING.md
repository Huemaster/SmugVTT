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
This first branding pass changes product naming, the default artwork, web manifest, browser metadata and public repository presentation. The proposed three-pillar Map / Chat / Canvas workspace is a development direction, not an advertised shipped capability.

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
