import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// 이 API 경로는 Dynamic Server Component로 설정합니다.
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const cookieStore = cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value
          }
        }
      }
    )
    
    // 세션에서 사용자 정보 가져오기
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      console.error('세션 정보 가져오기 오류:', error)
      return NextResponse.json({ user: null, error: error.message }, { status: 401 })
    }
    
    return NextResponse.json({ 
      user: session?.user || null,
      isLoggedIn: !!session?.user,
    }, { status: 200 })
    
  } catch (error: any) {
    console.error('사용자 정보 가져오기 오류:', error)
    return NextResponse.json({ 
      user: null, 
      error: error.message || '사용자 정보를 가져오는 중 오류가 발생했습니다' 
    }, { status: 500 })
  }
} 