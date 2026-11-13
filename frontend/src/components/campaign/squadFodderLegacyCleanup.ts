/**
 * Conservative legacy cleanup rules. A numbered name is ONLY a candidate.
 * The actual sheet must still carry the old spawner's `fodder.isSpawned` flag.
 * Fodder templates and PCs must never qualify, even if named `Example Infantry 1`.
 */
import { TokenType, type Character, type CharacterTemplate, type Token } from '@/types';

export interface LegacyFodderDecision {
  matchedTemplate: string | null;
  verified: boolean;
  reason: string;
}

export function templateFromNumberedName(name: string, templateNames: readonly string[]): string | null {
  const candidate = name.trim().replace(/\s+/g, ' ');
  const matched = /^(.+?)\s+([1-9]\d*)$/.exec(candidate);
  if (!matched) return null;
  return templateNames.find((template) => template.trim().replace(/\s+/g, ' ').toLowerCase() === matched[1].toLowerCase()) ?? null;
}

export function classifyLegacyFodder(
  character: Character,
  templates: readonly Pick<CharacterTemplate, 'name'>[],
  referencedCharacterIds: ReadonlySet<string>,
  protectedCharacterIds: ReadonlySet<string>,
): LegacyFodderDecision {
  const matchedTemplate = templateFromNumberedName(character.name, templates.map((template) => template.name));
  if (!matchedTemplate) return { matchedTemplate: null, verified: false, reason: 'Not an exact numbered master-template name' };
  if (character.gameSystem !== 'SQUAD_COMMAND') return { matchedTemplate, verified: false, reason: 'Not a Squad Command character' };
  if (protectedCharacterIds.has(character.id)) return { matchedTemplate, verified: false, reason: 'Assigned to a player or membership' };
  if (referencedCharacterIds.has(character.id)) return { matchedTemplate, verified: false, reason: 'Still referenced on a campaign map' };
  const data = character.data as Record<string, unknown> | undefined;
  const fodder = data && typeof data.fodder === 'object' && data.fodder !== null && !Array.isArray(data.fodder)
    ? data.fodder as Record<string, unknown> : null;
  if (data?.isPlayerCharacter === true) return { matchedTemplate, verified: false, reason: 'Marked as a player character' };
  if (fodder?.isSpawned !== true) return { matchedTemplate, verified: false, reason: 'Missing the legacy Fodder spawn marker' };
  return { matchedTemplate, verified: true, reason: 'Verified unused legacy spawned unit' };
}

/**
 * Reconstruct provenance of PRE-v0.8.2c spawned sheets from their old map tokens.
 * The original spawner set token.metadata.smugSquadFodder and sourceTemplateId/name,
 * but NEVER set the sheet-level `data.fodder.isSpawned` flag.
 *
 * No orphan sheet can be authorized by this method: linked tokens are mandatory.
 * Every reference, on every map, must corroborate a matching NPC spawn from a
 * presently owned Squad Command master template. If anything differs, preserve the sheet.
 */
export function classifyActiveLegacyFodder(
  character: Character,
  templates: readonly Pick<CharacterTemplate, 'id' | 'name'>[],
  references: readonly { mapId: string; token: Token }[],
  protectedCharacterIds: ReadonlySet<string>,
): LegacyFodderDecision {
  const matchedTemplate = templateFromNumberedName(character.name, templates.map((template) => template.name));
  if (!matchedTemplate) return { matchedTemplate: null, verified: false, reason: 'Not an exact numbered master-template name' };
  if (character.gameSystem !== 'SQUAD_COMMAND') return { matchedTemplate, verified: false, reason: 'Not a Squad Command sheet' };
  if (protectedCharacterIds.has(character.id)) return { matchedTemplate, verified: false, reason: 'Assigned to a player or membership' };
  const data = character.data as Record<string, unknown> | undefined;
  if (data?.isPlayerCharacter === true) return { matchedTemplate, verified: false, reason: 'Marked as a player character' };
  if (references.length === 0) return { matchedTemplate, verified: false, reason: 'No linked map token proves old Fodder provenance' };

  const master = templates.find((template) => template.name.trim().replace(/\s+/g, ' ').toLowerCase() === matchedTemplate.toLowerCase());
  if (!master) return { matchedTemplate, verified: false, reason: 'The original master template is unavailable' };

  for (const reference of references) {
    const token = reference.token;
    const metadata = token.metadata as Record<string, unknown> | undefined;
    if (token.characterId !== character.id) return { matchedTemplate, verified: false, reason: 'A token does not link to this sheet' };
    if (token.type !== TokenType.NPC) return { matchedTemplate, verified: false, reason: 'A linked token is not an NPC' };
    if (token.controlledBy != null) return { matchedTemplate, verified: false, reason: 'A linked token has a player controller' };
    if (token.name.trim() !== character.name.trim()) return { matchedTemplate, verified: false, reason: 'Linked token and sheet names differ' };
    if (metadata?.smugSquadFodder !== true) return { matchedTemplate, verified: false, reason: 'A linked token lacks the old Fodder spawner marker' };
    if (metadata.sourceTemplateId !== master.id || metadata.sourceTemplateName !== master.name) {
      return { matchedTemplate, verified: false, reason: 'A linked token does not match its owned master template' };
    }
  }
  return { matchedTemplate, verified: true, reason: 'Verified active legacy Fodder through all linked map tokens' };
}
