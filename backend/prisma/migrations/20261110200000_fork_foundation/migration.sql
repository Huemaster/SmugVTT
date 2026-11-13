-- Generic CozyVTT fork foundation.
-- Additive only: existing campaigns, characters, maps, chat, TW data and uploads are untouched.

ALTER TABLE "CampaignMembership"
ADD COLUMN "gmAccess" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Message"
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT;

CREATE TABLE "CampaignNpc" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "gameSystem" "GameSystem",
    "data" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "gmNotes" TEXT,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "controllerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignNpc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageRevision" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "editorId" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageBookmark" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'important',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageBookmark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignScene" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "timeLabel" TEXT,
    "imageUrl" TEXT,
    "participantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "gmNotes" TEXT,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignScene_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "gmNotes" TEXT,
    "imageUrl" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "relatedIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EncounterMember" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB,
    CONSTRAINT "EncounterMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionTransaction" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actionId" TEXT,
    "actionName" TEXT NOT NULL,
    "targetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "beforeState" JSONB,
    "afterState" JSONB,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sessionId" TEXT,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "visibility" TEXT NOT NULL DEFAULT 'gm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key"
ON "MessageReaction"("messageId", "userId", "emoji");

CREATE UNIQUE INDEX "MessageBookmark_messageId_userId_category_key"
ON "MessageBookmark"("messageId", "userId", "category");

CREATE INDEX "CampaignNpc_campaignId_name_idx" ON "CampaignNpc"("campaignId", "name");
CREATE INDEX "CampaignNpc_campaignId_favorite_idx" ON "CampaignNpc"("campaignId", "favorite");
CREATE INDEX "MessageRevision_messageId_createdAt_idx" ON "MessageRevision"("messageId", "createdAt");
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");
CREATE INDEX "MessageBookmark_messageId_idx" ON "MessageBookmark"("messageId");
CREATE INDEX "CampaignScene_campaignId_createdAt_idx" ON "CampaignScene"("campaignId", "createdAt");
CREATE INDEX "CampaignEntry_campaignId_kind_idx" ON "CampaignEntry"("campaignId", "kind");
CREATE INDEX "Encounter_campaignId_active_idx" ON "Encounter"("campaignId", "active");
CREATE INDEX "EncounterMember_encounterId_sortOrder_idx" ON "EncounterMember"("encounterId", "sortOrder");
CREATE INDEX "ActionTransaction_campaignId_createdAt_idx" ON "ActionTransaction"("campaignId", "createdAt");
CREATE INDEX "CampaignEvent_campaignId_createdAt_idx" ON "CampaignEvent"("campaignId", "createdAt");

ALTER TABLE "CampaignNpc"
ADD CONSTRAINT "CampaignNpc_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageRevision"
ADD CONSTRAINT "MessageRevision_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageReaction"
ADD CONSTRAINT "MessageReaction_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageBookmark"
ADD CONSTRAINT "MessageBookmark_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignScene"
ADD CONSTRAINT "CampaignScene_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignEntry"
ADD CONSTRAINT "CampaignEntry_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Encounter"
ADD CONSTRAINT "Encounter_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncounterMember"
ADD CONSTRAINT "EncounterMember_encounterId_fkey"
FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionTransaction"
ADD CONSTRAINT "ActionTransaction_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignEvent"
ADD CONSTRAINT "CampaignEvent_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
