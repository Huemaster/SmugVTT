import { CampaignRole } from '@prisma/client';
import { prisma } from '../config/database';

export type ForkChatSpeakerType = 'self' | 'character' | 'npc' | 'narrator';
export type ForkChatMode = 'ic' | 'ooc' | 'narrator';

export interface ResolvedChatSpeaker {
  type: ForkChatSpeakerType;
  id?: string;
  name: string;
  imageUrl?: string | null;
  themeColor?: string;
  chatChime?: string;
}

export async function resolveNpcPortrait(
  campaignId: string,
  npcName: string,
  ownImageUrl?: string | null,
): Promise<string | null> {
  if (ownImageUrl) return ownImageUrl;

  const matches = await prisma.character.findMany({
    where: { campaignId, name: npcName },
    select: { tokenImageUrl: true },
    take: 2,
  });

  // Never guess when duplicate character names exist.
  if (matches.length !== 1) return null;
  return matches[0].tokenImageUrl ?? null;
}

function themeColorFromData(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const value = (data as Record<string, unknown>).themeColor;
  return typeof value === 'string' && value.length <= 40 ? value : undefined;
}

async function resolveNpcThemeColor(campaignId: string, npcName: string): Promise<string | undefined> {
  const matches = await prisma.character.findMany({
    where: { campaignId, name: npcName },
    select: { data: true },
    take: 2,
  });
  return matches.length === 1 ? themeColorFromData(matches[0].data) : undefined;
}

function chatChimeFromData(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const value = (data as Record<string, unknown>).chatChime;
  return value === 'default' || value === 'bell' || value === 'soft' || value === 'spark' || value === 'wood'
    ? value
    : undefined;
}

async function resolveNpcChatChime(campaignId: string, npcName: string): Promise<string | undefined> {
  const matches = await prisma.character.findMany({
    where: { campaignId, name: npcName },
    select: { data: true },
    take: 2,
  });
  return matches.length === 1 ? chatChimeFromData(matches[0].data) : undefined;
}

export class ChatIdentityError extends Error {}

export async function resolveChatIdentity(input: {
  campaignId: string;
  userId: string;
  userName: string;
  role: CampaignRole | string | undefined;
  speakerType?: ForkChatSpeakerType;
  speakerId?: string;
  mode?: ForkChatMode;
}): Promise<{ speaker: ResolvedChatSpeaker; chatMode: ForkChatMode }> {
  const speakerType = input.speakerType ?? 'self';
  const chatMode: ForkChatMode = input.mode ?? (speakerType === 'self' ? 'ooc' : 'ic');

  if (chatMode === 'narrator' && input.role !== CampaignRole.DM) {
    throw new ChatIdentityError('Only the GM can use Narrator mode');
  }

  if (speakerType === 'self') {
    return {
      speaker: { type: 'self', name: input.userName },
      chatMode,
    };
  }

  if (speakerType === 'narrator') {
    if (input.role !== CampaignRole.DM) throw new ChatIdentityError('Only the GM can speak as Narrator');
    return {
      speaker: { type: 'narrator', name: 'Narrator' },
      chatMode: 'narrator',
    };
  }

  if (!input.speakerId) throw new ChatIdentityError('That speaking identity is unavailable');

  if (speakerType === 'npc') {
    if (input.role !== CampaignRole.DM) throw new ChatIdentityError('Only the GM can speak as an NPC');
    const npc = await prisma.campaignNpc.findFirst({
      where: { id: input.speakerId, campaignId: input.campaignId },
      select: { id: true, name: true, imageUrl: true },
    });
    if (!npc) throw new ChatIdentityError('That NPC is unavailable');
    return {
      speaker: { type: 'npc', id: npc.id, name: npc.name, imageUrl: await resolveNpcPortrait(input.campaignId, npc.name, npc.imageUrl), themeColor: await resolveNpcThemeColor(input.campaignId, npc.name), chatChime: await resolveNpcChatChime(input.campaignId, npc.name) },
      chatMode: chatMode === 'narrator' ? 'ic' : chatMode,
    };
  }

  const character = await prisma.character.findFirst({
    where: { id: input.speakerId, campaignId: input.campaignId },
    select: { id: true, name: true, tokenImageUrl: true, data: true },
  });
  if (!character) throw new ChatIdentityError('That character is unavailable');

  if (input.role !== CampaignRole.DM) {
    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: input.userId, campaignId: input.campaignId } },
      select: { characterIds: true },
    });
    if (!membership?.characterIds.includes(character.id)) {
      throw new ChatIdentityError('You do not control that character');
    }
  }

  return {
    speaker: {
      type: 'character',
      id: character.id,
      name: character.name,
      imageUrl: character.tokenImageUrl,
      themeColor: themeColorFromData(character.data),
      chatChime: chatChimeFromData(character.data),
    },
    chatMode: chatMode === 'narrator' ? 'ic' : chatMode,
  };
}
