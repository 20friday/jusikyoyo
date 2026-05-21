import { createClient } from '@supabase/supabase-js';

// RLS를 우회하는 서비스롤 클라이언트 (어드민 전용)
export function createAdminClient() {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
