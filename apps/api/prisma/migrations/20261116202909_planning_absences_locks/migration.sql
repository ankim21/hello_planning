-- CreateEnum
CREATE TYPE "DayLockStatus" AS ENUM ('LOCKED', 'PAYROLL');

-- CreateEnum
CREATE TYPE "AbsenceCategory" AS ENUM ('EMPLOYER_PAID', 'THIRD_PARTY_PAID', 'UNPAID', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "DayPart" AS ENUM ('FULL_DAY', 'HALF_DAY', 'CUSTOM');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#9ca3af';

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "breakMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "meals" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "DayLock" (
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DayLockStatus" NOT NULL,
    "setById" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayLock_pkey" PRIMARY KEY ("siteId","date")
);

-- CreateTable
CREATE TABLE "AbsenceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AbsenceCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "earnsLeave" BOOLEAN NOT NULL,
    "compensatoryIndemnity" BOOLEAN NOT NULL,
    "employeeCanRequest" BOOLEAN NOT NULL,
    "overtimeMajorees" BOOLEAN,
    "blocksPlanning" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AbsenceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "absenceTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dayPart" "DayPart" NOT NULL DEFAULT 'FULL_DAY',
    "startTime" TEXT,
    "endTime" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceType_name_key" ON "AbsenceType"("name");

-- CreateIndex
CREATE INDEX "Absence_employeeId_startDate_idx" ON "Absence"("employeeId", "startDate");

-- AddForeignKey
ALTER TABLE "DayLock" ADD CONSTRAINT "DayLock_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_absenceTypeId_fkey" FOREIGN KEY ("absenceTypeId") REFERENCES "AbsenceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
