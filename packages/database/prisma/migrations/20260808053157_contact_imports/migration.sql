-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "contact_imports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "filename" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT,
    "sourceText" TEXT,
    "sourcePath" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "invalid" INTEGER NOT NULL DEFAULT 0,
    "optout" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contact_imports_idempotencyKey_key" ON "contact_imports"("idempotencyKey");

-- CreateIndex
CREATE INDEX "contact_imports_organizationId_idx" ON "contact_imports"("organizationId");

-- CreateIndex
CREATE INDEX "contact_imports_status_idx" ON "contact_imports"("status");

-- AddForeignKey
ALTER TABLE "contact_imports" ADD CONSTRAINT "contact_imports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

