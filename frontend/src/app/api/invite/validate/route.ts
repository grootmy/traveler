import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 초대 코드를 정규화합니다. 대문자로 변환하고 하이픈과 공백을 제거합니다.
 */
function normalizeInviteCode(code: string): string {
  if (!code) return '';
  // 앞뒤 공백 제거 추가
  const trimmedCode = code.trim();
  console.log('정규화 전 코드:', JSON.stringify(trimmedCode));
  
  // 알파벳과 숫자 외 모든 문자 제거하고 대문자로 변환
  const normalized = trimmedCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  console.log('정규화 후 코드:', JSON.stringify(normalized));
  return normalized;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  
  console.log('원본 요청 코드:', JSON.stringify(code));
  
  if (!code) {
    return NextResponse.json({ 
      isValid: false, 
      error: '초대 코드가 필요합니다' 
    }, { status: 400 });
  }
  
  const normalizedCode = normalizeInviteCode(code);
  
  if (normalizedCode.length < 6) {
    return NextResponse.json({ 
      isValid: false, 
      error: '유효하지 않은 초대 코드 형식입니다' 
    }, { status: 400 });
  }
  
  try {
    // Supabase 클라이언트 생성
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );
    
    console.log('DB 쿼리 실행:', JSON.stringify(normalizedCode));
    
    // 대소문자 구분 없이 방 조회 시도 (첫 번째 방법)
    let { data, error } = await supabase
      .from('rooms')
      .select('textid, title, owner_id, purpose_category, expected_members, district, status, code')
      .ilike('code', normalizedCode)
      .maybeSingle();
    
    // 첫 번째 방법으로 찾지 못하면 다른 방법 시도
    if (!data && error) {
      console.log('ilike로 검색 실패, 정확한 일치 시도');
      
      // 정확한 일치로 다시 시도
      const result = await supabase
        .from('rooms')
        .select('textid, title, owner_id, purpose_category, expected_members, district, status, code')
        .eq('code', normalizedCode)
        .maybeSingle();
        
      data = result.data;
      error = result.error;
      
      // 여전히 실패하면 모든 코드를 가져와서 수동으로 비교
      if (!data && error) {
        console.log('정확한 일치 검색 실패, 모든 코드와 수동 비교');
        
        const { data: allRooms, error: roomsError } = await supabase
          .from('rooms')
          .select('textid, title, owner_id, purpose_category, expected_members, district, status, code');
          
        if (!roomsError && allRooms) {
          // 수동으로 대소문자 구분 없이 비교
          const matchingRoom = allRooms.find(
            room => normalizeInviteCode(room.code) === normalizedCode
          );
          
          if (matchingRoom) {
            console.log('수동 비교로 일치하는 방 찾음:', matchingRoom.code);
            data = matchingRoom;
            error = null;
          }
        }
      }
    }
    
    if (!data) {
      console.error('초대 코드 검증 오류:', error);
      
      // 디버깅: 모든 방의 코드 출력
      const { data: allRooms } = await supabase
        .from('rooms')
        .select('code')
        .limit(10);
        
      console.log('데이터베이스의 방 코드들:', allRooms?.map(r => r.code));
      
      return NextResponse.json({ 
        isValid: false, 
        error: '존재하지 않는 초대 코드입니다' 
      }, { status: 404 });
    }
    
    if (data.status === 'closed') {
      return NextResponse.json({ 
        isValid: false, 
        error: '이미 종료된 여행입니다' 
      }, { status: 403 });
    }
    
    return NextResponse.json({ 
      isValid: true, 
      roomInfo: data 
    });
  } catch (error: any) {
    console.error('초대 코드 검증 서버 오류:', error);
    return NextResponse.json({ 
      isValid: false, 
      error: '초대 코드 검증 중 오류가 발생했습니다' 
    }, { status: 500 });
  }
} 