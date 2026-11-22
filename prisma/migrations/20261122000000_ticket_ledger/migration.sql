-- Additive deployment; no production connection is used to generate this SQL.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- AlterTable
ALTER TABLE "performances" ADD COLUMN     "repeater_discount" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "repeater_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ticket_sales_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ticket_sales_start" TIMESTAMP(3),
ADD COLUMN     "venue" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "performance_stages" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "start_time" VARCHAR(5);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "reservation_id" TEXT,
ALTER COLUMN "import_history_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "line_notification_settings" ADD COLUMN     "scheduler_owner" TEXT NOT NULL DEFAULT 'schedule';

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" TEXT NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "stage_id" BIGINT NOT NULL,
    "cast_id" BIGINT,
    "source" TEXT NOT NULL,
    "import_source" TEXT,
    "external_key" TEXT,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_lines" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "ticket_type_id" TEXT,
    "name" TEXT NOT NULL,
    "base_price" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL,
    "repeater" BOOLEAN NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "reservation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_history" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_mail" (
    "reservation_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "attempted_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "reservation_mail_pkey" PRIMARY KEY ("reservation_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_number_key" ON "reservations"("number");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_external_key_key" ON "reservations"("external_key");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_request_key_key" ON "reservations"("request_key");

-- CreateIndex
CREATE INDEX "reservations_performance_id_cast_id_idx" ON "reservations"("performance_id", "cast_id");

-- CreateIndex
CREATE INDEX "reservations_stage_id_cancelled_idx" ON "reservations"("stage_id", "cancelled");

-- CreateIndex
CREATE UNIQUE INDEX "sales_reservation_id_key" ON "sales"("reservation_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "performance_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_history" ADD CONSTRAINT "reservation_history_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_mail" ADD CONSTRAINT "reservation_mail_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Additional invariants apply to new ticket data only; historical finance rows are unchanged.
ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_price_nonnegative CHECK (price >= 0);
ALTER TABLE reservation_lines ADD CONSTRAINT reservation_lines_valid_amounts CHECK (base_price >= 0 AND discount >= 0 AND quantity > 0);
ALTER TABLE performance_stages ADD CONSTRAINT ticket_capacity_nonnegative CHECK (capacity IS NULL OR capacity >= 0);
ALTER TABLE performances ADD CONSTRAINT repeater_discount_nonnegative CHECK (repeater_discount >= 0);

COMMIT;
