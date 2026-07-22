-- Planned start time for fixtures (manual scheduler pick-time, e.g. Final at 5 PM)
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
