-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "isServiceLead" BOOLEAN NOT NULL DEFAULT false;
