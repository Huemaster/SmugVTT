-- Persistent Scene Board support.
-- Additive: existing CampaignScene rows remain valid and all prior campaign data is untouched.

ALTER TABLE "CampaignScene"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "boardVisibility" TEXT NOT NULL DEFAULT 'gm',
ADD COLUMN "boardState" JSONB NOT NULL DEFAULT '{"background":"#f4efe6","elements":[]}',
ADD COLUMN "boardVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "CampaignScene_campaignId_active_idx"
ON "CampaignScene"("campaignId", "active");
