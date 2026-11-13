/**
 * Game-system-agnostic action contracts for the fork.
 *
 * A game system owns its rules. UI surfaces (character sheets, GM NPC panel,
 * chat macros, token actions) should all describe an action with this contract
 * and hand it to the same system resolver.
 */
export type ForkActorType = 'character' | 'npc' | 'token' | 'vehicle' | 'narrator';
export type ForkActionVisibility = 'public' | 'gm' | 'self';

export interface ForkActionRequest {
  campaignId: string;
  actorType: ForkActorType;
  actorId?: string;
  actionId: string;
  targetIds?: string[];
  visibility?: ForkActionVisibility;
  options?: Record<string, unknown>;
}

export interface ForkStateChange {
  entityType: string;
  entityId: string;
  field: string;
  before: unknown;
  after: unknown;
}

export interface ForkActionResult {
  ok: boolean;
  summary: string;
  changes: ForkStateChange[];
  transactionId?: string;
  chatMessageId?: string;
}
