-- Keep issued numbers and audit records when an administrator removes a cancelled booking.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "reservations" ADD COLUMN "deleted_at" TIMESTAMP(3);
COMMIT;
