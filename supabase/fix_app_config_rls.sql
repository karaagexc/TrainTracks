-- Fix app_config update policy so maintenance mode cannot be flipped by anon clients.
DROP POLICY IF EXISTS "Anyone can update app_config" ON app_config;
DROP POLICY IF EXISTS "Authenticated users can update app_config" ON app_config;

CREATE POLICY "Authenticated users can update app_config"
    ON app_config FOR UPDATE
    USING (auth.role() = 'authenticated');
