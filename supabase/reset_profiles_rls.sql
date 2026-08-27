-- FIX: Complete RLS Reset for Profiles
-- Run this in Supabase SQL Editor
-- This will FIX the "Connection timed out" / infinite loading loop

-- 1. Disable RLS momentarily to confirm access works (optional, but good for testing)
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 2. Drop disparate policies (to clear any infinite recursion loops)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

-- 3. Re-create CLEAN, simple policies
-- Policy A: Everyone can see profiles (needed for avatar/feed)
CREATE POLICY "Public profiles are viewable by everyone"
ON public.profiles FOR SELECT
USING ( true );

-- Policy B: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK ( auth.uid() = id );

-- Policy C: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING ( auth.uid() = id );

-- 4. Verify your own status is set correctly
-- (This just outputs your row to the results panel)
SELECT * FROM public.profiles WHERE is_admin = true;
