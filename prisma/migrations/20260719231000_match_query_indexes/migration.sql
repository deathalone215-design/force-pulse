-- Speeds up live-board delta + match tracking queries
CREATE INDEX IF NOT EXISTS "Match_status_idx" ON "Match"("status");
CREATE INDEX IF NOT EXISTS "Match_updatedAt_idx" ON "Match"("updatedAt");
CREATE INDEX IF NOT EXISTS "Match_roundId_idx" ON "Match"("roundId");
CREATE INDEX IF NOT EXISTS "Match_roundId_status_idx" ON "Match"("roundId", "status");
CREATE INDEX IF NOT EXISTS "Match_roundId_updatedAt_idx" ON "Match"("roundId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Round_categoryId_idx" ON "Round"("categoryId");
CREATE INDEX IF NOT EXISTS "Round_categoryId_number_idx" ON "Round"("categoryId", "number");
CREATE INDEX IF NOT EXISTS "CricketBall_matchId_idx" ON "CricketBall"("matchId");
CREATE INDEX IF NOT EXISTS "CricketBall_matchId_createdAt_idx" ON "CricketBall"("matchId", "createdAt");
CREATE INDEX IF NOT EXISTS "MatchEvent_matchId_idx" ON "MatchEvent"("matchId");
CREATE INDEX IF NOT EXISTS "MatchSet_matchId_idx" ON "MatchSet"("matchId");
CREATE INDEX IF NOT EXISTS "TournamentCategory_tournamentId_idx" ON "TournamentCategory"("tournamentId");
CREATE INDEX IF NOT EXISTS "Team_categoryId_idx" ON "Team"("categoryId");
