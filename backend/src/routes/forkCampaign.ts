import { Router, Response } from 'express';
import { CampaignRole, GameSystem, PlatformRole, Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticated, campaignDM } from '../middleware/compose';
import type { AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../config/database';
import { applyRoleToLiveSockets, announceRosterChange, broadcastToCampaign, broadcastToUser } from '../websocket/utils';
import { jsonOrNull, toJson } from '../utils/prisma-json';
import logger from '../utils/logger';
import { MAX_CHAT_MESSAGE_LENGTH } from '../validators/chatLimits';

import { resolveNpcPortrait } from '../fork/chatIdentity';
const router = Router();

const NpcActionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
}).passthrough();

const CreateNpcSchema = z.object({
  name: z.string().trim().min(1).max(120),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  gameSystem: z.nativeEnum(GameSystem).nullable().optional(),
  data: z.unknown().optional(),
  actions: z.array(NpcActionSchema).max(100).optional(),
  notes: z.string().max(20_000).nullable().optional(),
  gmNotes: z.string().max(50_000).nullable().optional(),
  revealed: z.boolean().optional(),
  favorite: z.boolean().optional(),
  controllerIds: z.array(z.string().uuid()).max(50).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
});

const UpdateNpcSchema = CreateNpcSchema.partial();

const GmAccessSchema = z.object({ gmAccess: z.boolean() });

/**
 * PUT /api/campaigns/:campaignId/members/:userId/gm-access
 *
 * Co-GM is a capability toggle, not a new persisted campaign role.
 * The database membership remains PLAYER/SPECTATOR, but REST and sockets
 * treat gmAccess=true as effective DM for campaign-level tools.
 *
 * Only the actual DM seat, campaign owner, or platform admin may change this
 * flag. A co-GM therefore cannot grant co-GM access to someone else.
 */
router.put(
  '/:campaignId/members/:userId/gm-access',
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actorId = req.session.userId!;
      const { campaignId, userId: targetUserId } = req.params;
      const parsed = GmAccessSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation Error', message: 'gmAccess must be true or false' });
      }

      const [campaign, actorMembership, actor, targetMembership] = await Promise.all([
        prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { id: true, ownerId: true },
        }),
        prisma.campaignMembership.findUnique({
          where: { userId_campaignId: { userId: actorId, campaignId } },
          select: { role: true },
        }),
        prisma.user.findUnique({
          where: { id: actorId },
          select: { platformRole: true },
        }),
        prisma.campaignMembership.findUnique({
          where: { userId_campaignId: { userId: targetUserId, campaignId } },
          select: { id: true, role: true, gmAccess: true },
        }),
      ]);

      if (!campaign) return res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });

      const mayManage =
        actorMembership?.role === CampaignRole.DM ||
        campaign.ownerId === actorId ||
        actor?.platformRole === PlatformRole.ADMIN;

      if (!mayManage) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only the campaign DM, campaign owner, or platform admin can change co-GM access',
        });
      }

      if (!targetMembership) {
        return res.status(404).json({ error: 'Not Found', message: 'Campaign member not found' });
      }
      if (targetMembership.role === CampaignRole.DM) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'The sitting DM already has full campaign control',
        });
      }

      const updated = await prisma.campaignMembership.update({
        where: { id: targetMembership.id },
        data: { gmAccess: parsed.data.gmAccess },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });

      const effectiveRole = updated.gmAccess ? CampaignRole.DM : updated.role;
      try {
        await applyRoleToLiveSockets(targetUserId, campaignId, effectiveRole);
        announceRosterChange(targetUserId, [campaignId], 'member.role');
      } catch (error) {
        logger.warn('Co-GM live role update failed; database change stands', {
          err: error,
          campaignId,
          targetUserId,
        });
      }

      return res.status(200).json({
        message: updated.gmAccess ? 'Co-GM access enabled' : 'Co-GM access disabled',
        membership: updated,
      });
    } catch (error) {
      logger.error('Failed to change co-GM access', { err: error });
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to change co-GM access' });
    }
  }
);

/**
 * GM NPC roster.
 *
 * There is deliberately no player-facing list endpoint in this foundation.
 * An unrevealed/prepared NPC is therefore not merely redacted — it is absent
 * from every player response.
 */
router.get('/:campaignId/fork/npcs', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const npcs = await prisma.campaignNpc.findMany({
      where: { campaignId: req.params.campaignId },
      orderBy: [{ favorite: 'desc' }, { name: 'asc' }],
    });
    return res.status(200).json({ npcs });
  } catch (error) {
    logger.error('Failed to list GM NPCs', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list NPCs' });
  }
});

router.post('/:campaignId/fork/npcs', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = CreateNpcSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid NPC',
      });
    }
    const input = parsed.data;

    const npc = await prisma.campaignNpc.create({
      data: {
        campaignId: req.params.campaignId,
        name: input.name,
        imageUrl: input.imageUrl ?? null,
        gameSystem: input.gameSystem ?? null,
        data: toJson(input.data ?? {}),
        actions: toJson(input.actions ?? []),
        notes: input.notes ?? null,
        gmNotes: input.gmNotes ?? null,
        revealed: input.revealed ?? false,
        favorite: input.favorite ?? false,
        controllerIds: input.controllerIds ?? [],
        tags: input.tags ?? [],
      },
    });

    return res.status(201).json({ npc });
  } catch (error) {
    logger.error('Failed to create GM NPC', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create NPC' });
  }
});

router.patch('/:campaignId/fork/npcs/:npcId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = UpdateNpcSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid NPC update',
      });
    }

    const existing = await prisma.campaignNpc.findFirst({
      where: { id: req.params.npcId, campaignId: req.params.campaignId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'Not Found', message: 'NPC not found' });

    const input = parsed.data;
    const data: Prisma.CampaignNpcUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.gameSystem !== undefined) data.gameSystem = input.gameSystem ?? null;
    if (input.data !== undefined) data.data = toJson(input.data);
    if (input.actions !== undefined) data.actions = toJson(input.actions);
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.gmNotes !== undefined) data.gmNotes = input.gmNotes;
    if (input.revealed !== undefined) data.revealed = input.revealed;
    if (input.favorite !== undefined) data.favorite = input.favorite;
    if (input.controllerIds !== undefined) data.controllerIds = { set: input.controllerIds };
    if (input.tags !== undefined) data.tags = { set: input.tags };

    const npc = await prisma.campaignNpc.update({
      where: { id: existing.id },
      data,
    });

    return res.status(200).json({ npc });
  } catch (error) {
    logger.error('Failed to update GM NPC', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update NPC' });
  }
});

router.delete('/:campaignId/fork/npcs/:npcId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await prisma.campaignNpc.deleteMany({
      where: { id: req.params.npcId, campaignId: req.params.campaignId },
    });
    if (!result.count) return res.status(404).json({ error: 'Not Found', message: 'NPC not found' });
    return res.status(200).json({ message: 'NPC deleted' });
  } catch (error) {
    logger.error('Failed to delete GM NPC', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete NPC' });
  }
});

router.post('/:campaignId/fork/npcs/:npcId/clone', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const source = await prisma.campaignNpc.findFirst({
      where: { id: req.params.npcId, campaignId: req.params.campaignId },
    });
    if (!source) return res.status(404).json({ error: 'Not Found', message: 'NPC not found' });

    const npc = await prisma.campaignNpc.create({
      data: {
        campaignId: source.campaignId,
        name: `${source.name} (Copy)`,
        imageUrl: source.imageUrl,
        gameSystem: source.gameSystem,
        data: jsonOrNull(source.data),
        actions: jsonOrNull(source.actions),
        notes: source.notes,
        gmNotes: source.gmNotes,
        revealed: false,
        favorite: source.favorite,
        controllerIds: source.controllerIds,
        tags: source.tags,
      },
    });

    return res.status(201).json({ npc });
  } catch (error) {
    logger.error('Failed to clone GM NPC', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to clone NPC' });
  }
});

const PerformActionSchema = z.object({
  actionId: z.string().trim().min(1).max(80),
});

router.post('/:campaignId/fork/npcs/:npcId/act', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = PerformActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: 'Choose an NPC action' });
    }

    const npc = await prisma.campaignNpc.findFirst({
      where: { id: req.params.npcId, campaignId: req.params.campaignId },
    });
    if (!npc) return res.status(404).json({ error: 'Not Found', message: 'NPC not found' });

    const actions = Array.isArray(npc.actions) ? npc.actions : [];
    const action = actions.find((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      return (entry as Record<string, unknown>).id === parsed.data.actionId;
    }) as Record<string, unknown> | undefined;

    if (!action || typeof action.name !== 'string') {
      return res.status(404).json({ error: 'Not Found', message: 'NPC action not found' });
    }

    const description = typeof action.description === 'string' ? action.description : '';
    const summary = description
      ? `${npc.name} — ${action.name}: ${description}`
      : `${npc.name} — ${action.name}`;

    const userId = req.session.userId!;
    const [user, message, event] = await prisma.$transaction(async (tx) => {
      const actingUser = await tx.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      if (!actingUser) throw new Error('Acting user not found');

      const writtenMessage = await tx.message.create({
        data: {
          campaignId: req.params.campaignId,
          userId,
          type: 'CHARACTER_ACTION',
          content: description ? `${action.name}: ${description}` : String(action.name),
          metadata: toJson({
            speaker: {
              type: 'npc',
              id: npc.id,
              name: npc.name,
              imageUrl: await resolveNpcPortrait(req.params.campaignId, npc.name, npc.imageUrl),
            },
            chatMode: 'ic',
            forkAction: true,
            actorType: 'npc',
            actorId: npc.id,
            actorName: npc.name,
            actionId: parsed.data.actionId,
            actionName: action.name,
          }),
        },
      });

      const writtenEvent = await tx.campaignEvent.create({
        data: {
          campaignId: req.params.campaignId,
          category: 'npc.action',
          summary,
          visibility: 'gm',
          payload: toJson({
            npcId: npc.id,
            npcName: npc.name,
            actionId: parsed.data.actionId,
            actionName: action.name,
          }),
        },
      });

      return [actingUser, writtenMessage, writtenEvent] as const;
    });

    // NPC actions use the same Speak-As metadata as manually typed IC chat.
    broadcastToCampaign(req.params.campaignId, 'chat.message', {
      id: message.id,
      userId,
      userName: user.displayName,
      content: message.content,
      type: message.type,
      metadata: message.metadata as Record<string, unknown>,
      timestamp: message.createdAt.toISOString(),
    });

    return res.status(200).json({ message, event });
  } catch (error) {
    logger.error('Failed to perform GM NPC action', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to perform NPC action' });
  }
});


const EditForkChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
});

type ForkChatAccess = {
  message: {
    id: string;
    campaignId: string;
    userId: string | null;
    recipientId: string | null;
    type: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    editedAt: Date | null;
    deletedAt: Date | null;
    deletedById: string | null;
  };
  mayManage: boolean;
};

async function forkChatAccess(campaignId: string, messageId: string, actorId: string): Promise<ForkChatAccess | null> {
  const [message, campaign, membership, actor] = await Promise.all([
    prisma.message.findFirst({
      where: { id: messageId, campaignId },
      select: {
        id: true,
        campaignId: true,
        userId: true,
        recipientId: true,
        type: true,
        content: true,
        metadata: true,
        editedAt: true,
        deletedAt: true,
        deletedById: true,
      },
    }),
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { ownerId: true } }),
    prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: actorId, campaignId } },
      select: { role: true, gmAccess: true },
    }),
    prisma.user.findUnique({ where: { id: actorId }, select: { platformRole: true } }),
  ]);

  if (!message || !campaign || !membership) return null;
  const effectiveGm =
    membership.role === CampaignRole.DM ||
    membership.gmAccess ||
    campaign.ownerId === actorId ||
    actor?.platformRole === PlatformRole.ADMIN;

  // Whisper privacy stays intact: only its sender may mutate it. A campaign GM
  // who was not the sender cannot use moderation endpoints to reveal or alter it.
  const ownMessage = message.userId === actorId;
  const mayModeratePublic = effectiveGm && message.recipientId === null;
  return { message, mayManage: ownMessage || mayModeratePublic };
}

function broadcastForkChatMutation(
  message: ForkChatAccess['message'],
  payload: Record<string, unknown>,
): void {
  // The database mutation has already committed. A missing or temporarily
  // unavailable Socket.IO instance must not turn a successful REST write into
  // a misleading 500 (or prompt clients to repeat the write).
  try {
    if (message.recipientId) {
      if (message.userId) broadcastToUser(message.userId, 'chat.mutated', payload);
      broadcastToUser(message.recipientId, 'chat.mutated', payload);
    } else {
      broadcastToCampaign(message.campaignId, 'chat.mutated', payload);
    }
  } catch (error) {
    // Never log the payload: it may contain private whisper content.
    logger.warn('chat.mutated broadcast failed; saved change stands', {
      err: error,
      campaignId: message.campaignId,
    });
  }
}

router.patch('/:campaignId/fork/chat/:messageId', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = req.session.userId!;
    const access = await forkChatAccess(req.params.campaignId, req.params.messageId, actorId);
    if (!access) return res.status(404).json({ error: 'Not Found', message: 'Message not found' });
    if (!access.mayManage) return res.status(403).json({ error: 'Forbidden', message: 'You cannot edit this message' });
    if (access.message.deletedAt) return res.status(409).json({ error: 'Conflict', message: 'Restore the message before editing it' });
    if (access.message.type === 'SYSTEM' || access.message.type === 'DICE_ROLL') {
      return res.status(409).json({ error: 'Conflict', message: 'This message type cannot be edited' });
    }

    const parsed = EditForkChatMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid message content' });
    }
    if (parsed.data.content === access.message.content) {
      return res.status(200).json({ message: access.message });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.messageRevision.create({
        data: {
          messageId: access.message.id,
          editorId: actorId,
          content: access.message.content,
          ...(access.message.metadata !== null ? { metadata: toJson(access.message.metadata) } : {}),
        },
      });
      return tx.message.update({
        where: { id: access.message.id },
        data: { content: parsed.data.content, editedAt: new Date() },
      });
    });

    const payload = {
      id: updated.id,
      content: updated.content,
      metadata: updated.metadata,
      editedAt: updated.editedAt?.toISOString() ?? null,
      deletedAt: updated.deletedAt?.toISOString() ?? null,
      deletedById: updated.deletedById,
    };
    broadcastForkChatMutation(access.message, payload);
    return res.status(200).json({ message: updated });
  } catch (error) {
    logger.error('Failed to edit fork chat message', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to edit message' });
  }
});

router.delete('/:campaignId/fork/chat/:messageId', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = req.session.userId!;
    const access = await forkChatAccess(req.params.campaignId, req.params.messageId, actorId);
    if (!access) return res.status(404).json({ error: 'Not Found', message: 'Message not found' });
    if (!access.mayManage) return res.status(403).json({ error: 'Forbidden', message: 'You cannot delete this message' });
    if (access.message.type === 'SYSTEM') return res.status(409).json({ error: 'Conflict', message: 'System messages cannot be deleted here' });

    const updated = access.message.deletedAt
      ? await prisma.message.findUniqueOrThrow({ where: { id: access.message.id } })
      : await prisma.message.update({
          where: { id: access.message.id },
          data: { deletedAt: new Date(), deletedById: actorId },
        });

    const payload = {
      id: updated.id,
      content: updated.content,
      metadata: updated.metadata,
      editedAt: updated.editedAt?.toISOString() ?? null,
      deletedAt: updated.deletedAt?.toISOString() ?? null,
      deletedById: updated.deletedById,
    };
    broadcastForkChatMutation(access.message, payload);
    return res.status(200).json({ message: updated });
  } catch (error) {
    logger.error('Failed to delete fork chat message', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete message' });
  }
});

router.post('/:campaignId/fork/chat/:messageId/restore', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = req.session.userId!;
    const access = await forkChatAccess(req.params.campaignId, req.params.messageId, actorId);
    if (!access) return res.status(404).json({ error: 'Not Found', message: 'Message not found' });
    if (!access.mayManage) return res.status(403).json({ error: 'Forbidden', message: 'You cannot restore this message' });
    if (access.message.type === 'SYSTEM') return res.status(409).json({ error: 'Conflict', message: 'System messages are not managed here' });

    const updated = await prisma.message.update({
      where: { id: access.message.id },
      data: { deletedAt: null, deletedById: null },
    });
    const payload = {
      id: updated.id,
      content: updated.content,
      metadata: updated.metadata,
      editedAt: updated.editedAt?.toISOString() ?? null,
      deletedAt: null,
      deletedById: null,
    };
    broadcastForkChatMutation(access.message, payload);
    return res.status(200).json({ message: updated });
  } catch (error) {
    logger.error('Failed to restore fork chat message', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to restore message' });
  }
});

router.get('/:campaignId/fork/chat/:messageId/revisions', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = req.session.userId!;
    const access = await forkChatAccess(req.params.campaignId, req.params.messageId, actorId);
    if (!access) return res.status(404).json({ error: 'Not Found', message: 'Message not found' });
    if (!access.mayManage) return res.status(403).json({ error: 'Forbidden', message: 'You cannot view this message history' });

    const revisions = await prisma.messageRevision.findMany({
      where: { messageId: access.message.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ revisions });
  } catch (error) {
    logger.error('Failed to list fork chat revisions', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to load message history' });
  }
});

export default router;
