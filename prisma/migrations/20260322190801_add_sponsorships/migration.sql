-- CreateTable
CREATE TABLE "sponsorships" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "sponsor_name" VARCHAR(200) NOT NULL,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorships_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
