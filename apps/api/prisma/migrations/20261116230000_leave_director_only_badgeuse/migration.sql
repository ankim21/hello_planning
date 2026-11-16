-- Leave requests are decided by the site director only: the head chef's
-- first approval is removed.
ALTER TABLE "LeaveRequest" DROP COLUMN "needsChef",
DROP COLUMN "chefApprovedById",
DROP COLUMN "chefApprovedAt";

-- Meals are validated together with the hours in the Badgeuse.
ALTER TABLE "TimeEntry" ADD COLUMN "meals" INTEGER NOT NULL DEFAULT 0;
