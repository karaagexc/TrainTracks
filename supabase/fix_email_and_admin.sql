-- FIX: Sync Emails and Ensure Admin Access
-- Run this in Supabase SQL Editor

-- 1. Ensure `email` column exists in profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Sync email from auth.users to public.profiles
-- This fixes the "no email in there" issue
UPDATE public.profiles
SET email = auth.users.email
FROM auth.users
WHERE public.profiles.id = auth.users.id
AND public.profiles.email IS NULL;

-- 3. CRITICAL: Re-apply the RLS policy that allows reading is_admin
-- Drop the old one first to avoid conflicts
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;

CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING ( auth.uid() = id );

-- 4. Verify your specific user (checking if is_admin is true)
-- This is just for your verification in the SQL editor result
SELECT id, email, is_admin FROM public.profiles WHERE is_admin = TRUE;
