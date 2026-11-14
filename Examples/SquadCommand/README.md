# Squad Command — generic public example

**Status: v0.9.0 has an integrated selectable Squad Command game system and supporting source modules.** This folder contains documentation and two generic sample units/weapons only; it is not a seeded campaign, and the examples are not automatically imported. Specialized rules and edge-case testing remain in development.

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

## Integration and follow-up checklist

- [x] Public-safe terminology and minimal examples documented.
- [x] Publish a reviewed integrated source baseline, not only patch installers.
- [x] Integrate generic selectable game-system types, registry/schema, routes, and UI for v0.9.0.
- [ ] Continue testing legacy local-save compatibility and imported custom records.
- [x] Keep this public sample folder limited to generic fictional units and weapons; do not publish private data.
- [ ] Expand live multiplayer/player-permission and specialized rule-edge verification beyond the v0.9.0 CI baseline.
- [x] Pass the v0.9.0 frontend/backend, permissions, documentation and Docker/browser CI baseline.
- [x] Document the integrated v0.9.0 release, separating shipped code from work in progress.

This folder contains public learning/reference data. The optional Squad Command system exists in the v0.9.0 source, but the learning files are not a feature-complete combat ruleset.
