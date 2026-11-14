/** Regression: deleted chat messages stay hidden after reloading saved history. */
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

describe('Chat history soft deletion round-trip', () => {
  let userId: string;
  let campaignId: string;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const stamp = Date.now();
    const email = `chat_soft_delete_${stamp}@test.invalid`;
    const user = await createTestUser({ email, isApproved: true });
    userId = user.id;
    const campaign = await createTestCampaign(userId, { name: `Chat soft delete ${stamp}` });
    campaignId = campaign.id;
    await prisma.campaignMembership.create({ data: { campaignId, userId, role: 'DM', characterIds: [] } });
    agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([userId]);
  });

  it('returns deletion state after refresh and clears it after restore', async () => {
    const message = await prisma.message.create({
      data: { campaignId, userId, type: 'PLAYER', content: 'This message should stay deleted' },
    });
    const historyUrl = `/api/campaigns/${campaignId}/messages?limit=50`;
    const readMessage = async () => {
      const result = await agent.get(historyUrl);
      expect(result.status).toBe(200);
      return result.body.messages.find((m: { id: string }) => m.id === message.id);
    };
    expect((await readMessage()).deletedAt).toBeNull();

    const deletedAt = new Date('2026-11-13T10:00:00.000Z');
    await prisma.message.update({ where: { id: message.id }, data: { deletedAt, deletedById: userId } });
    const afterDelete = await readMessage();
    expect(afterDelete).toBeDefined();
    expect(afterDelete.deletedAt).toBe(deletedAt.toISOString());
    expect(afterDelete.deletedById).toBe(userId);

    await prisma.message.update({ where: { id: message.id }, data: { deletedAt: null, deletedById: null } });
    const afterRestore = await readMessage();
    expect(afterRestore.deletedAt).toBeNull();
    expect(afterRestore.deletedById).toBeNull();
  });
});
