import { createClient } from '@supabase/supabase-js';

// Same Supabase project as letterSizd: one account + one friend list for both apps.
export const SUPABASE_URL = 'https://fotppunwikhxhvzzlgfy.supabase.co';
// Anon key — public by design; Row Level Security enforces access.
export const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvdHBwdW53aWtoeGh2enpsZ2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTQ2MDIsImV4cCI6MjEwMDM3MDYwMn0.XhR8V1VN4ffxqiShq2g5NOgx9DL9N1lstznNMlqFM3E';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'longbox-auth' },
});

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}
