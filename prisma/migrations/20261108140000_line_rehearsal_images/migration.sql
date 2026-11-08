ALTER TABLE "line_notification_settings"
ADD COLUMN "rehearsal_image_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "line_rehearsal_deliveries" (
    "id" VARCHAR(36) NOT NULL,
    "recipient" VARCHAR(64) NOT NULL,
    "pages" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "line_rehearsal_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "line_rehearsal_deliveries_created_at_idx" ON "line_rehearsal_deliveries"("created_at");
