import { Router, Response } from 'express';
import { CampaignRole, Prisma } from '@prisma/client';
import { z } from 'zod';
import { campaignDM, campaignMember } from '../middleware/compose';
import type { AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../config/database';
import { toJson } from '../utils/prisma-json';
import logger from '../utils/logger';

const router = Router();

const BoardStateSchema = z.object({
  background: z.string().max(64).optional(),
  elements: z.array(z.unknown()).max(1000).optional(),
}).passthrough();

/**
 * Players may move or resize an unlocked visible stage object only after the
 * GM explicitly enables collaborative editing on a revealed shared scene.
 * No raw board replacement or arbitrary property edits are accepted here.
 */
const PlayerStageTransformSchema = z.object({
  boardVersion: z.number().int().min(0),
  x: z.number().finite().min(0).max(1600),
  y: z.number().finite().min(0).max(900),
  width: z.number().finite().min(30).max(1600),
  height: z.number().finite().min(30).max(900),
}).strict();

const CreateSceneSchema = z.object({
  title: z.string().trim().min(1).max(160),
  location: z.string().trim().max(240).nullable().optional(),
  timeLabel: z.string().trim().max(160).nullable().optional(),
  revealed: z.boolean().optional(),
  boardVisibility: z.enum(['gm', 'shared']).optional(),
  active: z.boolean().optional(),
});

const UpdateSceneSchema = CreateSceneSchema.partial().extend({
  boardState: BoardStateSchema.optional(),
  summary: z.string().max(50_000).nullable().optional(),
  gmNotes: z.string().max(50_000).nullable().optional(),
});

const selectScene = {
  id: true,
  campaignId: true,
  title: true,
  location: true,
  timeLabel: true,
  imageUrl: true,
  participantIds: true,
  summary: true,
  gmNotes: true,
  revealed: true,
  active: true,
  boardVisibility: true,
  boardState: true,
  boardVersion: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CampaignSceneSelect;

function maySeeBoard(req: AuthenticatedRequest): boolean {
  return req.campaignMembership?.role === CampaignRole.DM;
}

/**
 * Never send GM-hidden Scene Board elements to non-GMs. Rendering already
 * hid them client-side, but redacting them here also prevents their asset ids
 * and notes from reaching the player's browser at all.
 */
function boardStateForPlayer(boardState: unknown): unknown {
  if (!boardState || typeof boardState !== 'object' || Array.isArray(boardState)) return boardState;
  const value = boardState as Record<string, unknown>;
  if (!Array.isArray(value.elements)) return boardState;

  return {
    ...value,
    elements: value.elements.filter((element) => {
      if (!element || typeof element !== 'object' || Array.isArray(element)) return true;
      return (element as Record<string, unknown>).hidden !== true;
    }),
  };
}


/** List scenes. Non-GMs receive only explicitly shared/revealed scenes. */
router.get('/:campaignId/fork/scenes', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isGm = maySeeBoard(req);
    const scenes = await prisma.campaignScene.findMany({
      where: {
        campaignId: req.params.campaignId,
        ...(isGm ? {} : { revealed: true, boardVisibility: 'shared' }),
      },
      select: selectScene,
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return res.status(200).json({
      scenes: isGm
        ? scenes
        : scenes.map(({ gmNotes: _gmNotes, ...scene }) => ({
            ...scene,
            boardState: boardStateForPlayer(scene.boardState),
          })),
    });
  } catch (error) {
    logger.error('Failed to list fork scenes', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list scenes' });
  }
});

/** Active scene board. Hidden scenes are absent, not redacted, for players. */
router.get('/:campaignId/fork/scenes/active', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isGm = maySeeBoard(req);
    const scene = await prisma.campaignScene.findFirst({
      where: {
        campaignId: req.params.campaignId,
        active: true,
        ...(isGm ? {} : { revealed: true, boardVisibility: 'shared' }),
      },
      select: selectScene,
      orderBy: { updatedAt: 'desc' },
    });
    if (!scene || isGm) return res.status(200).json({ scene });
    const { gmNotes: _gmNotes, ...playerScene } = scene;
    return res.status(200).json({
      scene: {
        ...playerScene,
        boardState: boardStateForPlayer(scene.boardState),
      },
    });
  } catch (error) {
    logger.error('Failed to load active scene board', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to load active scene' });
  }
});

router.post('/:campaignId/fork/scenes', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = CreateSceneSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid scene' });
    }
    const input = parsed.data;
    const makeActive = input.active ?? true;

    const scene = await prisma.$transaction(async (tx) => {
      if (makeActive) {
        await tx.campaignScene.updateMany({
          where: { campaignId: req.params.campaignId, active: true },
          data: { active: false },
        });
      }
      return tx.campaignScene.create({
        data: {
          campaignId: req.params.campaignId,
          title: input.title,
          location: input.location ?? null,
          timeLabel: input.timeLabel ?? null,
          revealed: input.revealed ?? false,
          boardVisibility: input.boardVisibility ?? 'gm',
          active: makeActive,
          participantIds: [],
          boardState: toJson({ background: '#f4efe6', elements: [] }),
          startedAt: makeActive ? new Date() : null,
        },
        select: selectScene,
      });
    });

    return res.status(201).json({ scene });
  } catch (error) {
    logger.error('Failed to create fork scene', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create scene' });
  }
});

router.patch('/:campaignId/fork/scenes/:sceneId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = UpdateSceneSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid scene update' });
    }

    const existing = await prisma.campaignScene.findFirst({
      where: { id: req.params.sceneId, campaignId: req.params.campaignId },
      select: { id: true, active: true },
    });
    if (!existing) return res.status(404).json({ error: 'Not Found', message: 'Scene not found' });

    const input = parsed.data;
    const data: Prisma.CampaignSceneUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.location !== undefined) data.location = input.location;
    if (input.timeLabel !== undefined) data.timeLabel = input.timeLabel;
    if (input.revealed !== undefined) data.revealed = input.revealed;
    if (input.boardVisibility !== undefined) data.boardVisibility = input.boardVisibility;
    if (input.boardState !== undefined) {
      data.boardState = toJson(input.boardState);
      data.boardVersion = { increment: 1 };
    }
    if (input.summary !== undefined) data.summary = input.summary;
    if (input.gmNotes !== undefined) data.gmNotes = input.gmNotes;
    if (input.active !== undefined) {
      data.active = input.active;
      data.startedAt = input.active ? new Date() : undefined;
      if (!input.active && existing.active) data.endedAt = new Date();
    }

    const scene = await prisma.$transaction(async (tx) => {
      if (input.active === true) {
        await tx.campaignScene.updateMany({
          where: { campaignId: req.params.campaignId, active: true, id: { not: existing.id } },
          data: { active: false, endedAt: new Date() },
        });
      }
      return tx.campaignScene.update({
        where: { id: existing.id },
        data,
        select: selectScene,
      });
    });

    return res.status(200).json({ scene });
  } catch (error) {
    logger.error('Failed to update fork scene', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update scene' });
  }
});

/**
 * Narrow player-edit endpoint: optimistic board version, fixed transform fields,
 * no access to GM-hidden elements, scene settings, links or other metadata.
 * Preserve hidden elements in the stored board rather than saving redacted
 * player reads back over them.
 */
router.patch('/:campaignId/fork/scenes/:sceneId/elements/:elementId/transform', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const input = PlayerStageTransformSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid Stage transform' });
    }
    const role = req.campaignMembership?.role;
    if (role !== CampaignRole.DM && role !== CampaignRole.PLAYER) {
      return res.status(403).json({ error: 'Forbidden', message: 'Only campaign players and GMs can move Stage elements' });
    }

    const scene = await prisma.campaignScene.findFirst({
      where: { id: req.params.sceneId, campaignId: req.params.campaignId, active: true },
      select: { id: true, boardState: true, boardVersion: true, revealed: true, boardVisibility: true },
    });
    if (!scene || (role !== CampaignRole.DM && (!scene.revealed || scene.boardVisibility !== 'shared'))) {
      return res.status(404).json({ error: 'Not Found', message: 'Shared Stage not found' });
    }

    const raw = scene.boardState;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return res.status(409).json({ error: 'Conflict', message: 'Stage data changed. Reload before editing.' });
    }
    const board = raw as Record<string, unknown>;
    if (role !== CampaignRole.DM && board.allowPlayerEditing !== true) {
      return res.status(403).json({ error: 'Forbidden', message: 'The GM has not enabled player editing for this Stage' });
    }
    if (scene.boardVersion !== input.data.boardVersion) {
      return res.status(409).json({ error: 'Conflict', message: 'Stage changed. Reload and try again.' });
    }

    const elements = board.elements;
    if (!Array.isArray(elements)) return res.status(409).json({ error: 'Conflict', message: 'Stage has no editable elements' });
    const index = elements.findIndex((value) => value && typeof value === 'object' && !Array.isArray(value)
      && (value as Record<string, unknown>).id === req.params.elementId);
    const target = elements[index];
    if (index < 0 || !target || typeof target !== 'object' || Array.isArray(target)
      || (target as Record<string, unknown>).hidden === true || (target as Record<string, unknown>).locked === true
      || (role !== CampaignRole.DM && (target as Record<string, unknown>).type !== 'image')) {
      return res.status(404).json({ error: 'Not Found', message: 'Editable Stage element not found' });
    }
    const { boardVersion, ...transform } = input.data;
    const next = { ...board, elements: elements.map((value, at) => at === index ? { ...(value as Record<string, unknown>), ...transform } : value) };

    const updated = await prisma.campaignScene.updateMany({
      where: { id: scene.id, active: true, boardVersion },
      data: { boardState: toJson(next), boardVersion: { increment: 1 } },
    });
    if (updated.count !== 1) {
      return res.status(409).json({ error: 'Conflict', message: 'Stage changed. Reload and try again.' });
    }
    const saved = await prisma.campaignScene.findUnique({ where: { id: scene.id }, select: selectScene });
    if (!saved) return res.status(404).json({ error: 'Not Found', message: 'Stage not found' });
    if (role === CampaignRole.DM) return res.status(200).json({ scene: saved });
    const { gmNotes: _notes, ...publicScene } = saved;
    return res.status(200).json({ scene: { ...publicScene, boardState: boardStateForPlayer(saved.boardState) } });
  } catch (error) {
    logger.error('Failed to transform Stage element', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update Stage element' });
  }
});

router.delete('/:campaignId/fork/scenes/:sceneId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await prisma.campaignScene.deleteMany({
      where: { id: req.params.sceneId, campaignId: req.params.campaignId },
    });
    if (!result.count) return res.status(404).json({ error: 'Not Found', message: 'Scene not found' });
    return res.status(200).json({ message: 'Scene deleted' });
  } catch (error) {
    logger.error('Failed to delete fork scene', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete scene' });
  }
});

export default router;
