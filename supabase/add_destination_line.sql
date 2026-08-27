-- Add destination_line_id for transfer trips
ALTER TABLE public.trip_history
ADD COLUMN IF NOT EXISTS destination_line_id TEXT;
