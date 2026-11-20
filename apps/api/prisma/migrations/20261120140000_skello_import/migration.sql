-- Contract types that exist in Skello and had no equivalent here.
ALTER TYPE "ContractType" ADD VALUE 'INTERN';
ALTER TYPE "ContractType" ADD VALUE 'TEMPORARY';

-- Skello's employee number, so that an import can be run again without
-- creating the same person twice.
ALTER TABLE "Employee" ADD COLUMN "skelloId" TEXT;
CREATE UNIQUE INDEX "Employee_skelloId_key" ON "Employee"("skelloId");
