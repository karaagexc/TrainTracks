-- App Config table for global flags (maintenance mode, etc.)
-- This is a single-row config table.

CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Ensures only one row
    maintenance_mode BOOLEAN NOT NULL DEFAULT false,
    maintenance_message TEXT DEFAULT NULL,
    congestion_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE app_config
ADD COLUMN IF NOT EXISTS congestion_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Insert the default config row
INSERT INTO app_config (id, maintenance_mode) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to READ (anon users need to see maintenance status)
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app_config" ON app_config;
CREATE POLICY "Anyone can read app_config"
    ON app_config FOR SELECT
    USING (true);

-- Only authenticated users can update (you'll be the only one with DevOpts)
DROP POLICY IF EXISTS "Anyone can update app_config" ON app_config;
DROP POLICY IF EXISTS "Authenticated users can update app_config" ON app_config;
CREATE POLICY "Authenticated users can update app_config"
    ON app_config FOR UPDATE
    USING (auth.role() = 'authenticated');
