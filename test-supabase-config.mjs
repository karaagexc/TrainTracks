import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function setup() {
    console.log("Testing app_config table...");

    const { data, error } = await supabase
        .from('app_config')
        .select('*')
        .single();

    if (error) {
        console.log("Table doesn't exist yet. Error:", error.message);
        console.log("\nYou need to run this SQL in Supabase Dashboard > SQL Editor:");
        console.log("  File: supabase/app_config_migration.sql\n");
    } else {
        console.log("app_config table exists. Current config:", data);
    }
}

setup();
