import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

interface RouteParams {
  params: {
    roomId: string
  }
}

export async function GET(request: Request, { params }: RouteParams) {
  const { roomId } = params
  
  if (!roomId) {
    return NextResponse.json({ error: '방 ID가 필요합니다' }, { status: 400 })
  }

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
    
    // 방 정보 가져오기
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('textid, title, owner_id, purpose_category, expected_members, district, status, code')
      .eq('textid', roomId)
      .single()
    
    if (roomError || !roomData) {
      console.error('방 정보 가져오기 오류:', roomError)
      return NextResponse.json({ error: '방 정보를 찾을 수 없습니다' }, { status: 404 })
    }
    
    return NextResponse.json(roomData, { status: 200 })
    
  } catch (error: any) {
    console.error('방 정보 가져오기 오류:', error)
    return NextResponse.json({ 
      error: error.message || '방 정보를 가져오는 중 오류가 발생했습니다' 
    }, { status: 500 })
  }
}

// 이 라우트가 항상 동적으로 렌더링되어야 함을 명시
export const dynamic = 'force-dynamic'; 