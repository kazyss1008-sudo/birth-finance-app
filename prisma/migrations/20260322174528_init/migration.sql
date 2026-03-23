-- CreateEnum
CREATE TYPE "PerformanceStatus" AS ENUM ('PREPARING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "login_id" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255),
    "display_name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performances" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "stage_count" INTEGER NOT NULL DEFAULT 0,
    "default_norma_unit_price" INTEGER NOT NULL DEFAULT 0,
    "status" "PerformanceStatus" NOT NULL DEFAULT 'PREPARING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_stages" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "stage_no" INTEGER NOT NULL,
    "stage_name" VARCHAR(100) NOT NULL,
    "stage_date" DATE,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "performance_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casts" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "norma_ticket_count" INTEGER NOT NULL DEFAULT 0,
    "norma_unit_price" INTEGER NOT NULL DEFAULT 0,
    "is_ticket_back_target" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "casts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_back_rules" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "step_no" INTEGER NOT NULL,
    "min_ticket_count" INTEGER NOT NULL,
    "max_ticket_count" INTEGER,
    "back_unit_price" INTEGER NOT NULL,

    CONSTRAINT "ticket_back_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_import_histories" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_encoding" VARCHAR(20) NOT NULL,
    "imported_row_count" INTEGER NOT NULL,
    "inserted_sales_count" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "error_message" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_import_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_raw_rows" (
    "id" BIGSERIAL NOT NULL,
    "import_history_id" BIGINT NOT NULL,
    "row_no" INTEGER NOT NULL,
    "raw_json" JSONB NOT NULL,

    CONSTRAINT "sales_raw_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "import_history_id" BIGINT NOT NULL,
    "cast_id" BIGINT NOT NULL,
    "handled_cast_name" VARCHAR(200) NOT NULL,
    "ticket_count" INTEGER NOT NULL,
    "sales_amount" INTEGER NOT NULL,
    "visited_at" DATE NOT NULL,
    "source_row_no" INTEGER NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "expense_date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "expense_category_id" BIGINT NOT NULL,
    "item_name" VARCHAR(200) NOT NULL,
    "payee" VARCHAR(200) NOT NULL,
    "memo" TEXT,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" BIGSERIAL NOT NULL,
    "performance_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "amount" INTEGER NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "performance_stages_performance_id_stage_no_key" ON "performance_stages"("performance_id", "stage_no");

-- CreateIndex
CREATE UNIQUE INDEX "casts_performance_id_name_key" ON "casts"("performance_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_back_rules_performance_id_step_no_key" ON "ticket_back_rules"("performance_id", "step_no");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- AddForeignKey
ALTER TABLE "performance_stages" ADD CONSTRAINT "performance_stages_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casts" ADD CONSTRAINT "casts_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_back_rules" ADD CONSTRAINT "ticket_back_rules_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_import_histories" ADD CONSTRAINT "sales_import_histories_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_raw_rows" ADD CONSTRAINT "sales_raw_rows_import_history_id_fkey" FOREIGN KEY ("import_history_id") REFERENCES "sales_import_histories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_import_history_id_fkey" FOREIGN KEY ("import_history_id") REFERENCES "sales_import_histories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cast_id_fkey" FOREIGN KEY ("cast_id") REFERENCES "casts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expense_category_id_fkey" FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
