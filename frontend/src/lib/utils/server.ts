import { createClient } from '@supabase/supabase-js'

// 서버 환경에서 Supabase 클라이언트 생성
export const createServerClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  // 환경 변수 확인 (오류 디버깅용)
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Server] Supabase 환경 변수가 설정되지 않았습니다:', {
      url: supabaseUrl ? '설정됨' : '없음',
      key: supabaseAnonKey ? '설정됨' : '없음'
    });
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
} 