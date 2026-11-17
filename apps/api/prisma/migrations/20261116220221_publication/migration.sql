-- CreateTable
CREATE TABLE "Publication" (
    "siteId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("siteId","weekStart")
);

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
