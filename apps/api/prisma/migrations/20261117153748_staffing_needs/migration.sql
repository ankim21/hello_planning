-- CreateTable
CREATE TABLE "StaffingNeed" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "service" "Service" NOT NULL,
    "postId" TEXT,
    "department" "Department",
    "count" INTEGER NOT NULL,

    CONSTRAINT "StaffingNeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffingNeed_siteId_idx" ON "StaffingNeed"("siteId");

-- AddForeignKey
ALTER TABLE "StaffingNeed" ADD CONSTRAINT "StaffingNeed_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingNeed" ADD CONSTRAINT "StaffingNeed_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
