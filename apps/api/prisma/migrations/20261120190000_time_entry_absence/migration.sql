-- The absence put on the planning when "Abs." is validated on the Badgeuse,
-- so that it is removed again if the validation is.
ALTER TABLE "TimeEntry" ADD COLUMN "absenceId" TEXT;
