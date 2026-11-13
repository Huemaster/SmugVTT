# Squad Command — generic public example

**Status: documentation and sample templates only. Not yet a selectable game system in the public build.**

Squad Command is the intended public, system-optional identity for the combat/unit-management tools developed in local SmugVTT builds. The core VTT should work without selecting it.

## Naming and content policy

- Use **Squad Command** in public-facing UI, documentation, labels, and new source identifiers.
- Default placeholders are **Faction 1**, **Faction 2**, **Faction 3**, and **Faction 4**. Factions are user-editable; the public repository should not ship campaign-specific faction names, insignia, stories, maps, or art.
- Ship at most two **educational example units** and two **example weapons**. Do not seed a game-specific roster, equipment encyclopedia, or personal campaign data.
- Keep the useful generic mechanics: unit stats, range and targeting, shields, suppression, rally, overwatch, action economy, condition displays, template spawning, and sheetless token state. These are optional module features, not assumed rules for other campaigns.
- Preserve user data on upgrades. Renaming public labels must not silently change persisted IDs, break stored character references, or delete existing campaigns. A conversion should use an explicit reversible migration or an import adapter with tests.
- Do not publish exported databases, local assets, chat transcripts, saved campaign names, real member lists, or credentials.

## Learning templates

See [sample-templates.json](sample-templates.json). These two units and two weapons use generic names and placeholder values intended to explain the data structure, **not balance a particular game**. They are not automatically imported.

## Public integration checklist

- [x] Public-safe terminology and minimal examples documented.
- [ ] Receive and audit the **complete latest local source** (not only older patch installers).
- [ ] Convert internal source, types, registry/schema, routes, and UI consistently.
- [ ] Choose and test compatibility mapping for pre-existing local saves.
- [ ] Remove all original preset units/weapons, private names, unique artwork, and campaign data from publicly distributed assets.
- [ ] Integrate and test Map / Chat / Canvas / Scene and Squad Command interactions against the actual current codebase.
- [ ] Run builds, tests, GM/player permissions checks, and a clean-install Docker smoke test.
- [ ] Publish a source-complete development release with honest release notes.

This file is a public design/reference artifact. It should not be mistaken for a feature-complete release.
