import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// Escolhe o backend: Supabase quando configurado, demonstração local quando não.
const usarSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const backend = usarSupabase
  ? (await import('./supabase.js')).backend
  : (await import('./local.js')).backend;
