-- Football category match length (+ optional extra minutes)
ALTER TABLE "TournamentCategory" ADD COLUMN IF NOT EXISTS "fullTimeMinutes" INTEGER;
ALTER TABLE "TournamentCategory" ADD COLUMN IF NOT EXISTS "extraTimeMinutes" INTEGER;
