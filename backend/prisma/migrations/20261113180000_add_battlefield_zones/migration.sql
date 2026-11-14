-- Generic, optional battlefield annotations. Existing drawings remain unchanged.
ALTER TABLE "MapDrawing" ADD COLUMN "zoneType" TEXT;
ALTER TABLE "MapDrawing" ADD COLUMN "fillOpacity" INTEGER;
