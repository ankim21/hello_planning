-- The posts each site uses. A site without any line uses every active post.
CREATE TABLE "SitePost" (
    "siteId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,

    CONSTRAINT "SitePost_pkey" PRIMARY KEY ("siteId","postId")
);
ALTER TABLE "SitePost" ADD CONSTRAINT "SitePost_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SitePost" ADD CONSTRAINT "SitePost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A day of récupération JF counts in the weekly counter, like a congé payé.
UPDATE "AbsenceType" SET "countsInCounter" = true WHERE "name" = 'Récupération JF';
