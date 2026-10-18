-- Additive only: existing schedule tables and all finance data are preserved.
ALTER TABLE "casts" ADD COLUMN "email" VARCHAR(254),
 ADD COLUMN "schedule_password_hash" VARCHAR(255),
 ADD COLUMN "schedule_auth_version" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "schedule_changes" (
 "id" BIGSERIAL PRIMARY KEY, "details" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "notified_at" TIMESTAMP(3)
);
CREATE INDEX "schedule_changes_notified_at_created_at_idx" ON "schedule_changes"("notified_at", "created_at");
CREATE TABLE "schedule_digests" (
 "day" VARCHAR(10) PRIMARY KEY, "text" TEXT NOT NULL, "change_ids" JSONB NOT NULL,
 "recipient" VARCHAR(254) NOT NULL, "sent_at" TIMESTAMP(3)
);
CREATE TABLE "cast_login_attempts" (
 "key" VARCHAR(100) PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 1, "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "cast_login_attempts_expires_at_idx" ON "cast_login_attempts"("expires_at");
