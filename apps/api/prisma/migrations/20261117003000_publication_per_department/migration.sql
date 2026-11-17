-- Kitchen and salle are published separately: the head chef publishes the
-- kitchen, the site director either. A week already published stays
-- published for both.
ALTER TABLE "Publication" DROP CONSTRAINT "Publication_pkey";
ALTER TABLE "Publication" ADD COLUMN "department" "Department" NOT NULL DEFAULT 'SALLE';
INSERT INTO "Publication" ("siteId", "weekStart", "department", "publishedById", "publishedAt")
  SELECT "siteId", "weekStart", 'KITCHEN', "publishedById", "publishedAt" FROM "Publication";
ALTER TABLE "Publication" ALTER COLUMN "department" DROP DEFAULT;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_pkey" PRIMARY KEY ("siteId", "weekStart", "department");
