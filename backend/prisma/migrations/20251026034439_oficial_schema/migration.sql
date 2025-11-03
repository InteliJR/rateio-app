/*
  Warnings:

  - Added the required column `role` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COMERCIAL', 'LOGISTICA', 'IMPOSTO');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('BRL', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('KG', 'G', 'L', 'ML', 'M', 'CM', 'UN', 'CX', 'PC');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "UserRole" NOT NULL;

-- CreateTable
CREATE TABLE "taxes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_items" (
    "id" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "recoverable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freights" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "paymentTerm" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BRL',
    "additionalCosts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_taxes" (
    "id" TEXT NOT NULL,
    "freightId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "measurementUnit" "MeasurementUnit" NOT NULL,
    "inputGroup" TEXT,
    "paymentTerm" INTEGER NOT NULL,
    "acquisitionPrice" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BRL',
    "priceConvertedBrl" DECIMAL(12,2) NOT NULL,
    "additionalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxId" TEXT NOT NULL,
    "freightId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_change_logs" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_material_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" TEXT NOT NULL,
    "priceWithoutTaxesAndFreight" DECIMAL(12,2),
    "priceWithTaxesAndFreight" DECIMAL(12,2),
    "fixedCostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_raw_materials" (
    "productId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_raw_materials_pkey" PRIMARY KEY ("productId","rawMaterialId")
);

-- CreateTable
CREATE TABLE "fixed_costs" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT,
    "personnelExpenses" DECIMAL(12,2) NOT NULL,
    "generalExpenses" DECIMAL(12,2) NOT NULL,
    "proLabore" DECIMAL(12,2) NOT NULL,
    "depreciation" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "considerationPercentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "salesVolume" DECIMAL(12,2) NOT NULL,
    "overheadPerUnit" DECIMAL(12,2) NOT NULL,
    "calculationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_items_taxId_idx" ON "tax_items"("taxId");

-- CreateIndex
CREATE INDEX "freight_taxes_freightId_idx" ON "freight_taxes"("freightId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_materials_code_key" ON "raw_materials"("code");

-- CreateIndex
CREATE INDEX "raw_materials_code_idx" ON "raw_materials"("code");

-- CreateIndex
CREATE INDEX "raw_materials_name_idx" ON "raw_materials"("name");

-- CreateIndex
CREATE INDEX "raw_materials_taxId_idx" ON "raw_materials"("taxId");

-- CreateIndex
CREATE INDEX "raw_materials_freightId_idx" ON "raw_materials"("freightId");

-- CreateIndex
CREATE INDEX "raw_material_change_logs_rawMaterialId_idx" ON "raw_material_change_logs"("rawMaterialId");

-- CreateIndex
CREATE INDEX "raw_material_change_logs_changedAt_idx" ON "raw_material_change_logs"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_code_idx" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_fixedCostId_idx" ON "products"("fixedCostId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_costs_code_key" ON "fixed_costs"("code");

-- CreateIndex
CREATE INDEX "fixed_costs_calculationDate_idx" ON "fixed_costs"("calculationDate");

-- AddForeignKey
ALTER TABLE "revoked_tokens" ADD CONSTRAINT "revoked_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_items" ADD CONSTRAINT "tax_items_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "taxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_taxes" ADD CONSTRAINT "freight_taxes_freightId_fkey" FOREIGN KEY ("freightId") REFERENCES "freights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "taxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_freightId_fkey" FOREIGN KEY ("freightId") REFERENCES "freights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_change_logs" ADD CONSTRAINT "raw_material_change_logs_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_fixedCostId_fkey" FOREIGN KEY ("fixedCostId") REFERENCES "fixed_costs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_raw_materials" ADD CONSTRAINT "product_raw_materials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_raw_materials" ADD CONSTRAINT "product_raw_materials_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
