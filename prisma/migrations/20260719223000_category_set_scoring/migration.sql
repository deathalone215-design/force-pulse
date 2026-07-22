-- Per-category set scoring for volleyball / badminton / pickleball
ALTER TABLE "TournamentCategory" ADD COLUMN IF NOT EXISTS "pointsPerSet" INTEGER;
ALTER TABLE "TournamentCategory" ADD COLUMN IF NOT EXISTS "setsToWin" INTEGER;
ALTER TABLE "TournamentCategory" ADD COLUMN IF NOT EXISTS "maxSets" INTEGER;
ALTER TABLE "TournamentCategory" ADD COLUMN IF NOT EXISTS "lastSetPoints" INTEGER;
ALTER TABLE "TournamentCategory" ADD COLUMN IF NOT EXISTS "pointCap" INTEGER;
