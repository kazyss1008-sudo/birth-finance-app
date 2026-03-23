-- CreateTable
CREATE TABLE "goods" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unit_price" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "goods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_sales" (
    "id" BIGSERIAL NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "performance_stage_id" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "goods_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_performance_id_name_key" ON "goods"("performance_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "goods_sales_goods_id_performance_stage_id_key" ON "goods_sales"("goods_id", "performance_stage_id");

-- AddForeignKey
ALTER TABLE "goods" ADD CONSTRAINT "goods_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_sales" ADD CONSTRAINT "goods_sales_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_sales" ADD CONSTRAINT "goods_sales_performance_stage_id_fkey" FOREIGN KEY ("performance_stage_id") REFERENCES "performance_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
