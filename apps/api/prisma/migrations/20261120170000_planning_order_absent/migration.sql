-- The place of a person in a restaurant's planning (and Badgeuse); people
-- without one come after, in alphabetical order.
ALTER TABLE "SiteAssignment" ADD COLUMN "planningOrder" INTEGER;

-- "Abs." on the Badgeuse: the person did not come to the planned shift.
ALTER TABLE "TimeEntry" ADD COLUMN "absent" BOOLEAN NOT NULL DEFAULT false;
