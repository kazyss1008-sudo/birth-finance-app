-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_cast_id_fkey";

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "cast_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
