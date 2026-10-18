CREATE TABLE "line_destinations" (
 "id" VARCHAR(64) PRIMARY KEY, "type" VARCHAR(10) NOT NULL,
 "name" VARCHAR(200) NOT NULL, "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "line_destination_type" CHECK ("type" IN ('user', 'group'))
);
CREATE TABLE "line_notification_settings" (
 "id" INTEGER PRIMARY KEY DEFAULT 1, "mode" VARCHAR(10) NOT NULL DEFAULT 'TEST',
 "test_target_id" VARCHAR(64), "production_target_id" VARCHAR(64),
 CONSTRAINT "line_settings_singleton" CHECK ("id" = 1),
 CONSTRAINT "line_mode" CHECK ("mode" IN ('TEST', 'PRODUCTION'))
);
INSERT INTO "line_notification_settings" ("id", "mode") VALUES (1, 'TEST');
