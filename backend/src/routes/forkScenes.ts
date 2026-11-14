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
