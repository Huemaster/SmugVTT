import type { GameSystem } from './gameSystem';

export interface CampaignNpcAction {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface CampaignNpc {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string | null;
  gameSystem: GameSystem | null;
  data: Record<string, unknown>;
  actions: CampaignNpcAction[];
  notes: string | null;
  gmNotes: string | null;
  revealed: boolean;
  favorite: boolean;
  controllerIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

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
