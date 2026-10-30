import { createClient } from '@supabase/supabase-js';
import { classifySupabaseKey } from './supabaseKeys';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local');
}

if (['secret', 'service_role'].includes(classifySupabaseKey(supabaseAnonKey))) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY must be a publishable or anon key. Backend keys must not be used in the browser.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
