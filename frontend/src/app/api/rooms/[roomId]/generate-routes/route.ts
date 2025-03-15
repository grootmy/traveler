import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;
    
    // 쿠키를 사용하여 서버 측 Supabase 클라이언트 생성
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
    
    // Authorization 헤더에서 토큰 추출
    const authHeader = request.headers.get('Authorization');
    let user;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // 토큰으로 사용자 정보 가져오기
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !authUser) {
        return NextResponse.json(
          { error: '인증되지 않은 사용자입니다.' },
          { status: 401 }
        );
      }
      
      user = authUser;
    } else {
      // 쿠키 기반 인증 시도
      const { data: { user: cookieUser }, error: cookieAuthError } = await supabase.auth.getUser();
      
      if (cookieAuthError || !cookieUser) {
        return NextResponse.json(
          { error: '인증되지 않은 사용자입니다.' },
          { status: 401 }
        );
      }
      
      user = cookieUser;
    }
    
    // 방 정보 가져오기
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();
    
    if (roomError || !roomData) {
      return NextResponse.json(
        { error: '방을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    
    // 방장 권한 확인
    if (roomData.owner_id !== user.id) {
      return NextResponse.json(
        { error: '방장만 경로 생성을 시작할 수 있습니다.' },
        { status: 403 }
      );
    }
    
    // 멤버 정보 가져오기
    const { data: membersData, error: membersError } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId);
    
    if (membersError) {
      return NextResponse.json(
        { error: '멤버 정보를 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
    
    // 준비된 멤버 수 확인
    const readyMembers = membersData.filter(member => member.status === 'ready');
    
    // 경로 생성 로직
    // 여기서는 간단한 예시로 3개의 더미 경로를 생성합니다
    const routes = [
      generateDummyRoute(roomId, '코스 A', roomData.region),
      generateDummyRoute(roomId, '코스 B', roomData.region),
      generateDummyRoute(roomId, '코스 C', roomData.region)
    ];
    
    // 생성된 경로 저장
    for (const route of routes) {
      try {
        const { error: insertError } = await supabase
          .from('routes')
          .insert({
            room_id: route.room_id,
            route_data: route.route_data,
            travel_time: route.travel_time,
            total_cost: route.total_cost,
            created_at: route.created_at
          });
        
        if (insertError) {
          console.error('경로 저장 오류:', insertError);
          return NextResponse.json(
            { error: `경로 저장 중 오류가 발생했습니다: ${insertError.message}` },
            { status: 500 }
          );
        }
      } catch (insertErr: any) {
        console.error('경로 저장 예외:', insertErr);
        return NextResponse.json(
          { error: `경로 저장 중 예외가 발생했습니다: ${insertErr.message}` },
          { status: 500 }
        );
      }
    }
    
    // 방 상태 업데이트
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ status: 'routes_generated' })
      .eq('id', roomId);
    
    if (updateError) {
      console.error('방 상태 업데이트 오류:', updateError);
      return NextResponse.json(
        { error: `방 상태 업데이트 중 오류가 발생했습니다: ${updateError.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: '경로가 성공적으로 생성되었습니다.',
      readyMembersCount: readyMembers.length,
      totalMembersCount: membersData.length
    });
    
  } catch (error: any) {
    console.error('경로 생성 오류:', error);
    return NextResponse.json(
      { error: error.message || '경로 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 더미 경로 생성 함수
function generateDummyRoute(roomId: string, title: string, region: string) {
  // 지역별 더미 장소 데이터
  const placesByRegion: Record<string, any[]> = {
    '서울': [
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '경복궁',
        description: '조선시대 대표적인 궁궐로, 아름다운 전통 건축물을 감상할 수 있습니다.',
        category: '관광',
        location: { lat: 37.579617, lng: 126.977041 },
        address: '서울특별시 종로구 사직로 161',
        image_url: 'https://example.com/gyeongbokgung.jpg'
      },
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '북촌한옥마을',
        description: '전통 한옥이 밀집한 지역으로, 한국의 전통 문화를 체험할 수 있습니다.',
        category: '관광',
        location: { lat: 37.582978, lng: 126.983397 },
        address: '서울특별시 종로구 계동길 37',
        image_url: 'https://example.com/bukchon.jpg'
      },
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '광장시장',
        description: '다양한 전통 음식을 맛볼 수 있는 유명한 시장입니다.',
        category: '음식',
        location: { lat: 37.570397, lng: 126.999504 },
        address: '서울특별시 종로구 종로5가 395-8',
        image_url: 'https://example.com/gwangjang.jpg'
      }
    ],
    '부산': [
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '해운대 해수욕장',
        description: '부산의 대표적인 해변으로, 아름다운 바다 경관을 감상할 수 있습니다.',
        category: '관광',
        location: { lat: 35.158795, lng: 129.160728 },
        address: '부산광역시 해운대구 해운대해변로 264',
        image_url: 'https://example.com/haeundae.jpg'
      },
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '감천문화마을',
        description: '다양한 색상의 집들이 모여 있는 예술적인 마을입니다.',
        category: '관광',
        location: { lat: 35.134176, lng: 129.010388 },
        address: '부산광역시 사하구 감내2로 203',
        image_url: 'https://example.com/gamcheon.jpg'
      },
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '자갈치시장',
        description: '부산의 대표적인 수산물 시장으로, 신선한 해산물을 맛볼 수 있습니다.',
        category: '음식',
        location: { lat: 35.096896, lng: 129.030511 },
        address: '부산광역시 중구 자갈치해안로 52',
        image_url: 'https://example.com/jagalchi.jpg'
      }
    ],
    '제주': [
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '성산일출봉',
        description: '유네스코 세계자연유산으로 지정된 화산 분화구입니다.',
        category: '관광',
        location: { lat: 33.458031, lng: 126.942436 },
        address: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
        image_url: 'https://example.com/seongsan.jpg'
      },
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '만장굴',
        description: '세계적으로 유명한 용암 동굴로, 독특한 지질 구조를 볼 수 있습니다.',
        category: '관광',
        location: { lat: 33.528077, lng: 126.771408 },
        address: '제주특별자치도 제주시 구좌읍 만장굴길 182',
        image_url: 'https://example.com/manjang.jpg'
      },
      {
        id: `place-${Math.random().toString(36).substring(2, 9)}`,
        name: '제주 흑돼지 거리',
        description: '제주 흑돼지를 전문으로 하는 음식점들이 모여 있는 거리입니다.',
        category: '음식',
        location: { lat: 33.499621, lng: 126.529167 },
        address: '제주특별자치도 제주시 일도2동 1100',
        image_url: 'https://example.com/blackpork.jpg'
      }
    ]
  };
  
  // 기본 지역이 없으면 서울로 설정
  const places = placesByRegion[region] || placesByRegion['서울'];
  
  // 무작위로 장소 순서 섞기
  const shuffledPlaces = [...places].sort(() => Math.random() - 0.5);
  
  // 여행 시간 및 비용 계산 (더미 데이터)
  const travelTime = Math.floor(Math.random() * 120) + 180; // 3~5시간
  const totalCost = Math.floor(Math.random() * 50000) + 30000; // 3만원~8만원
  
  const routeData = {
    title: title,
    places: shuffledPlaces,
    travel_time: travelTime,
    total_cost: totalCost
  };
  
  return {
    room_id: roomId,
    route_data: routeData,
    travel_time: travelTime,
    total_cost: totalCost,
    created_at: new Date().toISOString()
  };
} 