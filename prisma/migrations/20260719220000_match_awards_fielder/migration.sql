-- Man of the Match + Best Fielder on Match; fielderId on CricketBall
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "manOfTheMatchId" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "bestFielderId" TEXT;
ALTER TABLE "CricketBall" ADD COLUMN IF NOT EXISTS "fielderId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Match_manOfTheMatchId_fkey'
  ) THEN
    ALTER TABLE "Match"
      ADD CONSTRAINT "Match_manOfTheMatchId_fkey"
      FOREIGN KEY ("manOfTheMatchId") REFERENCES "Player"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Match_bestFielderId_fkey'
  ) THEN
    ALTER TABLE "Match"
      ADD CONSTRAINT "Match_bestFielderId_fkey"
      FOREIGN KEY ("bestFielderId") REFERENCES "Player"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Match_manOfTheMatchId_idx" ON "Match"("manOfTheMatchId");
CREATE INDEX IF NOT EXISTS "Match_bestFielderId_idx" ON "Match"("bestFielderId");
CREATE INDEX IF NOT EXISTS "CricketBall_fielderId_idx" ON "CricketBall"("fielderId");
