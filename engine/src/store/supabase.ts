import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EngineConfig } from '../config/env.js';

export function createSupabase(cfg: EngineConfig): SupabaseClient {
  // Service-role client — SERVER-SIDE ONLY. No session persistence in a worker.
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
