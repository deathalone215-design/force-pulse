-- Enable Supabase Realtime for live scoring tables (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Match'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "Match";
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'MatchSet'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "MatchSet";
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'MatchEvent'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "MatchEvent";
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'CricketBall'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "CricketBall";
    END IF;
  END IF;
END $$;

-- Public live board already exposes scores; allow anon SELECT so Realtime payloads deliver.
-- Only enable RLS policies when RLS is already on (don't force-enable RLS on Prisma tables).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'Match' AND c.relrowsecurity
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "force_pulse_anon_select_match" ON "Match"';
    EXECUTE 'CREATE POLICY "force_pulse_anon_select_match" ON "Match" FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'MatchSet' AND c.relrowsecurity
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "force_pulse_anon_select_matchset" ON "MatchSet"';
    EXECUTE 'CREATE POLICY "force_pulse_anon_select_matchset" ON "MatchSet" FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'MatchEvent' AND c.relrowsecurity
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "force_pulse_anon_select_matchevent" ON "MatchEvent"';
    EXECUTE 'CREATE POLICY "force_pulse_anon_select_matchevent" ON "MatchEvent" FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'CricketBall' AND c.relrowsecurity
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "force_pulse_anon_select_cricketball" ON "CricketBall"';
    EXECUTE 'CREATE POLICY "force_pulse_anon_select_cricketball" ON "CricketBall" FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;
