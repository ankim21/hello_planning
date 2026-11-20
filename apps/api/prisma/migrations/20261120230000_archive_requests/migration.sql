-- A site director asks HR to archive someone; meanwhile the person is hidden
-- from that site's planning.
CREATE TYPE "ArchiveStatus" AS ENUM ('PENDING', 'APPROVED', 'REFUSED', 'CANCELLED');

CREATE TABLE "ArchiveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ArchiveStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "ArchiveRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArchiveRequest_siteId_status_idx" ON "ArchiveRequest"("siteId", "status");
CREATE INDEX "ArchiveRequest_status_idx" ON "ArchiveRequest"("status");
ALTER TABLE "ArchiveRequest" ADD CONSTRAINT "ArchiveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArchiveRequest" ADD CONSTRAINT "ArchiveRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
