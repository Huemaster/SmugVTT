/**
 * Exercises the fork's Scene, NPC, co-GM and chat moderation routes against
 * real campaign membership. Keeping requests here makes route inventory
 * changes require an executable test, while the campaignRoleGuards suite
 * verifies role denials for the standard campaignDM/member routes.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  cleanupCampaigns,
  cleanupUsers,
  createTestCampaign,
  createTestUser,
  prisma,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();
const ids: string[] = [];
const campaigns: string[] = [];
let campaignId: string;
let dmId: string;
let playerId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const [dmUser, playerUser] = await Promise.all([
    createTestUser({ displayName: 'Fork route DM' }),
    createTestUser({ displayName: 'Fork route player' }),
  ]);
  ids.push(dmUser.id, playerUser.id);
  dmId = dmUser.id;
  playerId = playerUser.id;
  const campaign = await createTestCampaign(dmId, { name: `Fork routes ${Date.now()}` });
  campaignId = campaign.id;
  campaigns.push(campaignId);
  await prisma.campaignMembership.createMany({ data: [
    { userId: dmId, campaignId, role: 'DM', characterIds: [] },
    { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
  ] });
  [dm, player] = await Promise.all([login(dmUser.email), login(playerUser.email)]);
});

afterAll(async () => {
  await cleanupCampaigns(campaigns);
  await cleanupUsers(ids);
  await prisma.$disconnect();
});

describe('co-GM access is managed by the sitting DM or campaign owner only', () => {
  it('lets the DM grant a player co-GM access and refuses a player trying the same', async () => {
    const denied = await player.put(`/api/campaigns/${campaignId}/members/${playerId}/gm-access`).send({ gmAccess: true });
    expect(denied.status).toBe(403);

    const granted = await dm.put(`/api/campaigns/${campaignId}/members/${playerId}/gm-access`).send({ gmAccess: true });
    expect(granted.status).toBe(200);
    expect(granted.body.membership.gmAccess).toBe(true);
    expect((await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: playerId, campaignId } },
    }))?.gmAccess).toBe(true);
    // Restore the ordinary player role before testing player-only denials.
    expect((await dm.put(`/api/campaigns/${campaignId}/members/${playerId}/gm-access`).send({ gmAccess: false })).status).toBe(200);
  });
});

describe('Scene and NPC endpoints', () => {
  it('serves member Scene reads while withholding mutations from players', async () => {
    expect((await dm.get(`/api/campaigns/${campaignId}/fork/scenes`)).status).toBe(200);
    expect((await dm.get(`/api/campaigns/${campaignId}/fork/scenes/active`)).status).toBe(200);
    expect((await player.get(`/api/campaigns/${campaignId}/fork/scenes`)).status).toBe(200);
    expect((await player.get(`/api/campaigns/${campaignId}/fork/scenes/active`)).status).toBe(200);
    expect((await player.post(`/api/campaigns/${campaignId}/fork/scenes`).send({ title: 'Player scene' })).status).toBe(403);
    expect((await player.get(`/api/campaigns/${campaignId}/fork/npcs`)).status).toBe(403);
  });

  it('creates, updates, activates, reads and deletes an NPC and Scene as the DM', async () => {
    const createdNpc = await dm.post(`/api/campaigns/${campaignId}/fork/npcs`).send({ name: 'Test NPC' });
    expect(createdNpc.status).toBe(201);
    const npcId = createdNpc.body.npc.id as string;
    expect((await dm.get(`/api/campaigns/${campaignId}/fork/npcs`)).body.npcs.map((npc: { id: string }) => npc.id)).toContain(npcId);
    expect((await dm.patch(`/api/campaigns/${campaignId}/fork/npcs/${npcId}`).send({ name: 'Updated NPC' })).status).toBe(200);
    expect((await dm.post(`/api/campaigns/${campaignId}/fork/npcs/${npcId}/clone`).send({})).status).toBe(201);
    expect((await dm.post(`/api/campaigns/${campaignId}/fork/npcs/${npcId}/act`).send({})).status).toBeLessThan(500);
    expect((await dm.delete(`/api/campaigns/${campaignId}/fork/npcs/${npcId}`)).status).toBe(200);

    const createdScene = await dm.post(`/api/campaigns/${campaignId}/fork/scenes`).send({ title: 'Test Scene' });
    expect(createdScene.status).toBe(201);
    const sceneId = createdScene.body.scene.id as string;
    expect((await dm.patch(`/api/campaigns/${campaignId}/fork/scenes/${sceneId}`).send({ title: 'Updated Scene' })).status).toBe(200);
    expect((await dm.delete(`/api/campaigns/${campaignId}/fork/scenes/${sceneId}`)).status).toBe(200);
  });
});

describe('chat moderation endpoints', () => {
  it('allows a DM to moderate public messages but keeps whispers private to their participants', async () => {
    const publicMessage = await prisma.message.create({
      data: { campaignId, userId: playerId, type: 'PLAYER', content: 'Public note' },
    });
    expect((await player.patch(`/api/campaigns/${campaignId}/fork/chat/${publicMessage.id}`).send({ content: 'No' })).status).toBe(403);
    expect((await dm.patch(`/api/campaigns/${campaignId}/fork/chat/${publicMessage.id}`).send({ content: 'Edited' })).status).toBe(200);
    expect((await dm.get(`/api/campaigns/${campaignId}/fork/chat/${publicMessage.id}/revisions`)).status).toBe(200);
    expect((await dm.delete(`/api/campaigns/${campaignId}/fork/chat/${publicMessage.id}`)).status).toBe(200);
    expect((await dm.post(`/api/campaigns/${campaignId}/fork/chat/${publicMessage.id}/restore`).send({})).status).toBe(200);

    const recipient = await createTestUser({ displayName: 'Whisper recipient' });
    ids.push(recipient.id);
    await prisma.campaignMembership.create({ data: { userId: recipient.id, campaignId, role: 'PLAYER', characterIds: [] } });
    const recipientAgent = await login(recipient.email);
    const whisper = await prisma.message.create({
      data: { campaignId, userId: playerId, recipientId: recipient.id, type: 'WHISPER', content: 'Secret' },
    });
    expect((await dm.patch(`/api/campaigns/${campaignId}/fork/chat/${whisper.id}`).send({ content: 'Leaked' })).status).toBe(403);
    expect((await recipientAgent.get(`/api/campaigns/${campaignId}/fork/chat/${whisper.id}/revisions`)).status).toBe(403);
    expect((await player.delete(`/api/campaigns/${campaignId}/fork/chat/${whisper.id}`)).status).toBe(200);
  });

  it('answers safely when the referenced message is missing', async () => {
    const missing = randomUUID();
    expect((await dm.patch(`/api/campaigns/${campaignId}/fork/chat/${missing}`).send({ content: 'x' })).status).toBe(404);
    expect((await dm.delete(`/api/campaigns/${campaignId}/fork/chat/${missing}`)).status).toBe(404);
    expect((await dm.post(`/api/campaigns/${campaignId}/fork/chat/${missing}/restore`).send({})).status).toBe(404);
    expect((await dm.get(`/api/campaigns/${campaignId}/fork/chat/${missing}/revisions`)).status).toBe(404);
  });
});
