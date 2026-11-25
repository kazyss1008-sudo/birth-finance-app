BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "performances" ADD COLUMN "venue_map_url" TEXT;
COMMIT;
