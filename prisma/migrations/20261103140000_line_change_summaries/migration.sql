ALTER TABLE "schedule_changes" ADD COLUMN "payload" JSONB;

CREATE TABLE "line_test_digests" (
  "id" VARCHAR(36) PRIMARY KEY,
  "recipient" VARCHAR(64) NOT NULL,
  "through_id" BIGINT NOT NULL,
  "text" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3)
);
CREATE INDEX "line_test_digests_recipient_sent_at_through_id_idx"
ON "line_test_digests"("recipient", "sent_at", "through_id");
