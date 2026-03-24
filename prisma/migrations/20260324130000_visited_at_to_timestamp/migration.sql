-- AlterColumn: change visited_at from DATE to TIMESTAMP
ALTER TABLE "sales" ALTER COLUMN "visited_at" SET DATA TYPE TIMESTAMP USING "visited_at"::timestamp;
