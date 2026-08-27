-- ============================================================
-- Trip History Table — Run in Supabase SQL Editor
-- ============================================================

-- 1. TRIP HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.trip_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    origin_id TEXT NOT NULL,
    origin_name TEXT NOT NULL,
    destination_id TEXT NOT NULL,
    destination_name TEXT NOT NULL,
    line_id TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    fare NUMERIC NOT NULL DEFAULT 0,
    distance_km NUMERIC NOT NULL DEFAULT 0,
    direction TEXT,
    duration_minutes INTEGER,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. INDEX for fast user queries (newest first)
CREATE INDEX IF NOT EXISTS idx_trip_history_user_date
    ON public.trip_history (user_id, completed_at DESC);

-- 3. ROW LEVEL SECURITY
ALTER TABLE public.trip_history ENABLE ROW LEVEL SECURITY;

-- Users can only read their own trips
CREATE POLICY "Users can read own trips"
    ON public.trip_history FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own trips
CREATE POLICY "Users can insert own trips"
    ON public.trip_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own trips (future: clear history)
CREATE POLICY "Users can delete own trips"
    ON public.trip_history FOR DELETE
    USING (auth.uid() = user_id);
