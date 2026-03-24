-- AlterTable
ALTER TABLE "sales" ADD COLUMN "reservation_no" VARCHAR(50);
ALTER TABLE "sales" ADD COLUMN "ticket_type" VARCHAR(100);
ALTER TABLE "sales" ADD COLUMN "payment_method" VARCHAR(100);
ALTER TABLE "sales" ADD COLUMN "customer_name" VARCHAR(200);
ALTER TABLE "sales" ADD COLUMN "customer_kana" VARCHAR(200);
ALTER TABLE "sales" ADD COLUMN "note" TEXT;
