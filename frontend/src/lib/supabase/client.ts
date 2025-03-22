import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();
  return { data, error };
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
}

export async function saveUserPreferences(userId: string, preferences: any) {
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, preferences })
    .select();
  return { data, error };
}

export async function updateUserProfile(userId: string, profile: { nickname?: string, avatar_url?: string }) {
  const { data, error } = await supabase
    .from('users')
    .update(profile)
    .eq('textid', userId)
    .select();
  return { data, error };
}

/**
 * 사용자의 닉네임을 업데이트합니다.
 * 익명 사용자와 회원 모두 사용할 수 있습니다.
 */
export async function updateUserNickname(userId: string, nickname: string) {
  try {
    // 사용자 프로필 업데이트
    const { error } = await supabase
      .from('users')
      .update({ nickname: nickname })
      .eq('textid', userId);
    
    if (error) throw error;
    
    // 사용자가 참여 중인 모든 방의 멤버 정보 업데이트
    const { data: roomMembers, error: membersError } = await supabase
      .from('room_members')
      .select('textid, room_id')
      .eq('user_id', userId);
    
    if (membersError) throw membersError;
    
    if (roomMembers && roomMembers.length > 0) {
      // 각 방 멤버의 닉네임 업데이트
      for (const member of roomMembers) {
        await supabase
          .from('room_members')
          .update({ nickname })
          .eq('textid', member.textid);
      }
    }
    
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: { message: error.message || '닉네임 업데이트 중 오류가 발생했습니다.' } 
    };
  }
}

// 방 관련 함수들
export async function createRoom(ownerId: string, roomData: { 
  title: string, 
  purpose_category: string, 
  expected_members: number, 
  budget_min?: number, 
  budget_max?: number, 
  start_time?: string, 
  end_time?: string,
  district: string 
}) {
  // 초대 코드 생성 (6자리 영문+숫자)
  const inviteCode = generateInviteCode();
  
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      owner_id: ownerId,
      title: roomData.title,
      purpose_category: roomData.purpose_category,
      expected_members: roomData.expected_members,
      budget_min: roomData.budget_min,
      budget_max: roomData.budget_max,
      start_time: roomData.start_time,
      end_time: roomData.end_time,
      district: roomData.district,
      code: inviteCode,
      status: 'active'
    })
    .select();
  
  if (data && data.length > 0) {
    // 방 생성 후 자동으로 방장을 멤버로 추가
    await addRoomMember(data[0].textid, ownerId);
  }
  
  return { data, error };
}

/**
 * 초대 코드로 방 정보 조회
 * @param code 초대 코드
 * @returns 방 정보
 */
export async function getRoomByInviteCode(code: string) {
  try {
    // 코드 정규화 (대문자로 변환, 공백 및 하이픈 제거)
    const normalizedCode = code.toUpperCase().replace(/[\s-]/g, '');
    
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', normalizedCode)
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('초대 코드로 방 조회 오류:', error);
    return { data: null, error };
  }
}

export async function getRoomById(roomId: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('textid', roomId)
    .single();
  
  return { data, error };
}

export async function getUserRooms(userId: string) {
  const { data, error } = await supabase
    .from('room_members')
    .select(`
      room_id,
      rooms:room_id (*)
    `)
    .eq('user_id', userId);
  
  return { data, error };
}

export async function addRoomMember(roomId: string, userId: string, relationship?: string) {
  const { data, error } = await supabase
    .from('room_members')
    .insert({
      room_id: roomId,
      user_id: userId,
      relationship: relationship
    })
    .select();
  
  return { data, error };
}

// export async function updateRoomMemberPreferences(roomId: string, userId: string, preferences: any) {
//   const { data, error } = await supabase
//     .from('room_members')
//     .update({
//       preferences: preferences,
//       is_ready: true
//     })
//     .eq('room_id', roomId)
//     .eq('user_id', userId)
//     .select();
  
//   return { data, error };
// }

export async function getRoomMembers(roomId: string) {
  const { data, error } = await supabase
    .from('room_members')
    .select(`
      *,
      user:user_id (textid, email, nickname, avatar_url)
    `)
    .eq('room_id', roomId);
  
  return { data, error };
}

// 경로 관련 함수들
export async function getRoutesByRoomId(roomId: string) {
  try {
    // 경로 정보 가져오기
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('room_id', roomId);
    
    if (error) throw error;
    
    // 결과가 없으면 빈 배열 반환
    if (!data || data.length === 0) {
      return { data: [], error: null };
    }
    
    // 기본 투표 정보 설정
    const routesWithVotes = data.map(route => {
      return {
        ...route,
        votes: {},
        is_selected: !!route.is_selected
      };
    });
    
    return { data: routesWithVotes, error: null };
  } catch (error: any) {
    console.error('경로 정보 가져오기 오류:', error);
    return { data: null, error };
  }
}

export async function generateRoutes(roomId: string) {
  try {
    // 테스트용 지연 함수
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // 방 정보 가져오기 (지역 정보 사용 목적)
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('textid', roomId)
      .single();
    
    if (roomError) throw roomError;
    
    // 선택된 지역(구) 정보
    const primaryDistrict = roomData.district;
    
    // 추가 지역 정보 가져오기
    const { data: additionalDistricts, error: districtError } = await supabase
      .from('additional_districts')
      .select('district_name')
      .eq('room_id', roomId);
    
    // 목적 카테고리 가져오기
    const purposeCategory = roomData.purpose_category;
    
    // 꼭 방문할 장소 가져오기
    const { data: mustVisitPlaces, error: placesError } = await supabase
      .from('must_visit_places')
      .select('*')
      .eq('room_id', roomId);
    
    // 테스트용 지연
    await delay(2000);
    
    // 서울 지역의 더미 장소 데이터 - 구별로 분류
    const placesByDistrict: Record<string, Array<{
      name: string;
      category: string;
      address: string;
      description: string;
      location: { lat: number; lng: number };
    }>> = {
      '강남구': [
        {
          name: '코엑스',
          category: '문화시설',
          address: '서울 강남구 봉은사로 524',
          description: '대형 컨벤션 센터로 쇼핑몰, 아쿠아리움, 영화관 등 다양한 시설이 있습니다.',
          location: { lat: 37.5115, lng: 127.0595 }
        },
        {
          name: '봉은사',
          category: '종교',
          address: '서울 강남구 봉은사로 531',
          description: '서울의 대표적인 사찰 중 하나로, 아름다운 정원과 불교 미술품이 있습니다.',
          location: { lat: 37.5147, lng: 127.0577 }
        },
        {
          name: '가로수길',
          category: '상권',
          address: '서울 강남구 압구정로 지역',
          description: '트렌디한 패션 숍과 카페, 레스토랑이 있는 세련된 거리입니다.',
          location: { lat: 37.5203, lng: 127.0226 }
        }
      ],
      '홍대/마포': [
        {
          name: '홍대 거리',
          category: '상권',
          address: '서울 마포구 홍대입구역 주변',
          description: '젊은이들의 문화와 예술이 살아숨쉬는 거리입니다.',
          location: { lat: 37.5558, lng: 126.9236 }
        },
        {
          name: '연트럴파크',
          category: '자연',
          address: '서울 마포구 연남동',
          description: '옛 철길을 공원으로 재탄생시킨 도심 속 녹지공간입니다.',
          location: { lat: 37.5604, lng: 126.9311 }
        },
        {
          name: '망원한강공원',
          category: '자연',
          address: '서울 마포구 망원동',
          description: '한강을 따라 산책하고 피크닉을 즐길 수 있는 공원입니다.',
          location: { lat: 37.5546, lng: 126.9009 }
        }
      ],
      '종로구': [
        {
          name: '경복궁',
          category: '역사',
          address: '서울 종로구 사직로 161',
          description: '조선의 정궁으로, 웅장한 규모와 아름다운 건축물이 인상적입니다.',
          location: { lat: 37.5796, lng: 126.9770 }
        },
        {
          name: '북촌한옥마을',
          category: '역사',
          address: '서울 종로구 계동길',
          description: '전통 한옥을 볼 수 있는 역사적인 마을로, 다양한 공방과 갤러리가 있습니다.',
          location: { lat: 37.5813, lng: 126.9848 }
        },
        {
          name: '인사동',
          category: '쇼핑',
          address: '서울 종로구 인사동길',
          description: '전통 공예품과 골동품 상점, 갤러리, 찻집이 많은 문화 거리입니다.',
          location: { lat: 37.5744, lng: 126.9856 }
        }
      ],
      '중구': [
        {
          name: '명동성당',
          category: '종교',
          address: '서울 중구 명동길 74',
          description: '서울의 대표적인 성당으로, 고딕 양식의 아름다운 건축물입니다.',
          location: { lat: 37.5633, lng: 126.9873 }
        },
        {
          name: '동대문디자인플라자',
          category: '문화시설',
          address: '서울 중구 을지로 281',
          description: '미래지향적 디자인의 복합 문화 공간으로, 각종 전시와 이벤트가 열립니다.',
          location: { lat: 37.5669, lng: 127.0095 }
        },
        {
          name: '청계천',
          category: '자연',
          address: '서울 중구 청계천로',
          description: '서울 도심을 가로지르는 하천으로, 산책하기 좋은 도심 속 휴식 공간입니다.',
          location: { lat: 37.5696, lng: 126.9784 }
        }
      ],
      '용산구': [
        {
          name: '남산타워',
          category: '관광지',
          address: '서울 용산구 남산공원길 105',
          description: '서울의 랜드마크로, 서울 시내를 한눈에 볼 수 있는 전망대가 있습니다.',
          location: { lat: 37.5511, lng: 126.9882 }
        },
        {
          name: '이태원 거리',
          category: '상권',
          address: '서울 용산구 이태원로',
          description: '다양한 문화가 공존하는 거리로, 세계 각국의 음식과 상점이 있습니다.',
          location: { lat: 37.5344, lng: 126.9947 }
        },
        {
          name: '용산가족공원',
          category: '자연',
          address: '서울 용산구 용산동6가',
          description: '넓은 잔디밭과 산책로가 있는 도심 속 공원입니다.',
          location: { lat: 37.5298, lng: 126.9684 }
        }
      ]
    };
    
    // 기본 장소 데이터
    const defaultPlaces = [
      {
        name: '광장시장',
        category: '관광지',
        address: '서울 중구 종로 88',
        description: '서울의 대표적인 전통시장으로, 다양한 먹거리와 살거리가 가득합니다.',
        location: { lat: 37.5701, lng: 126.9986 }
      },
      {
        name: '광화문광장',
        category: '관광지',
        address: '서울 종로구 세종로 172',
        description: '서울 중심부의 상징적인 광장으로, 역사적 의미가 있는 공간입니다.',
        location: { lat: 37.5759, lng: 126.9769 }
      },
      {
        name: '덕수궁',
        category: '역사',
        address: '서울 중구 세종대로 99',
        description: '조선시대의 궁궐로, 아름다운 건물과 공원이 있습니다.',
        location: { lat: 37.5655, lng: 126.9751 }
      }
    ];
    
    // 구 별로 추천 장소 선택
    let relevantPlaces: Array<{
      name: string;
      category: string;
      address: string;
      description: string;
      location: { lat: number; lng: number };
    }> = [];
    
    // 필수 방문 장소 먼저 추가
    if (mustVisitPlaces && mustVisitPlaces.length > 0) {
      // 여기서는 위치 정보가 없으므로 임의로 설정하거나 위치 서비스 API로 변환 필요
      // 지금은 더미 데이터로 위치값 설정
      const mustVisitWithLocation = mustVisitPlaces.map((place, index) => ({
        name: place.name,
        category: '필수방문',
        address: place.address,
        description: '사용자가 직접 추가한 필수 방문 장소입니다.',
        location: { lat: 37.5665 + (index * 0.002), lng: 126.9780 + (index * 0.002) }
      }));
      
      relevantPlaces = [...mustVisitWithLocation];
    }
    
    // 선택된 구에 맞는 장소 추가
    if (primaryDistrict && placesByDistrict[primaryDistrict]) {
      relevantPlaces = [...relevantPlaces, ...placesByDistrict[primaryDistrict]];
    } else {
      // 기본 장소들 추가
      relevantPlaces = [...relevantPlaces, ...defaultPlaces];
    }
    
    // 추가 지역에 대한 장소도 포함
    if (additionalDistricts && additionalDistricts.length > 0) {
      for (const district of additionalDistricts) {
        if (placesByDistrict[district.district_name]) {
          relevantPlaces = [...relevantPlaces, ...placesByDistrict[district.district_name]];
        }
      }
    }
    
    // 충분한 장소가 없으면 다른 구역의 장소도 추가
    if (relevantPlaces.length < 6) {
      // 다른 구역의 추천 장소 2개씩 랜덤하게 추가
      for (const district in placesByDistrict) {
        if (district !== primaryDistrict && relevantPlaces.length < 10) {
          const placesToAdd = placesByDistrict[district].slice(0, 2);
          relevantPlaces = [...relevantPlaces, ...placesToAdd];
        }
      }
    }
    
    // 테스트용 더미 데이터 생성 - 3개의 추천 경로
    const dummyRoutes = generateDummyRoutes(roomId, relevantPlaces);
    
    // 추천 경로 정보를 DB에 저장
    for (const route of dummyRoutes) {
      // 1. routes 테이블에 저장
      const { data: routeData, error: routeError } = await supabase
        .from('routes')
        .upsert({
          textid: route.textid,
          room_id: route.room_id,
          route_data: route.route_data,
          created_at: new Date().toISOString()
        })
        .select();
      
      if (routeError) throw routeError;
      
      // 2. places 테이블에 경로의 각 장소 저장
      for (const place of route.route_data.places) {
        await supabase
          .from('places')
          .upsert({
            textid: place.textid,
            room_id: roomId,
            name: place.name,
            address: place.address,
            category: place.category,
            lat: place.location.lat,
            lng: place.location.lng,
            description: place.description,
            is_recommended: true,
            order_index: route.route_data.places.indexOf(place),
            created_at: new Date().toISOString(),
            created_by: roomData.owner_id
          });
      }
    }
    
    return { data: dummyRoutes, error: null };
  } catch (error: any) {
    console.error('경로 생성 오류:', error);
    return { data: null, error };
  }
}

// 더미 경로 생성 함수 (테스트용)
function generateDummyRoutes(roomId: string, allPlaces: any[]) {
  // UUID 생성 함수
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  
  // 무작위로 장소 선택 (중복 없이)
  const getRandomPlaces = (count: number) => {
    const shuffled = [...allPlaces].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };
  
  // 3개의 추천 경로 생성
  const routes = [];
  
  // 첫 번째 경로 - 역사/문화 중심
  const culturalPlaces = getRandomPlaces(3).map((place, index) => ({
    textid: generateUUID(),
    name: place.name,
    description: place.description,
    category: place.category,
    location: place.location,
    address: place.address,
    image_url: undefined
  }));
  
  routes.push({
    textid: generateUUID(),
    room_id: roomId,
    route_data: {
      places: culturalPlaces,
      travel_time: Math.floor(Math.random() * 100) + 120,
      total_cost: Math.floor(Math.random() * 20000) + 20000
    },
    votes: {},
    is_selected: false
  });
  
  // 두 번째 경로 - 쇼핑/엔터테인먼트 중심
  const entertainmentPlaces = getRandomPlaces(3).map((place, index) => ({
    textid: generateUUID(),
    name: place.name,
    description: place.description,
    category: place.category,
    location: place.location,
    address: place.address,
    image_url: undefined
  }));
  
  routes.push({
    textid: generateUUID(),
    room_id: roomId,
    route_data: {
      places: entertainmentPlaces,
      travel_time: Math.floor(Math.random() * 100) + 120,
      total_cost: Math.floor(Math.random() * 20000) + 20000
    },
    votes: {},
    is_selected: false
  });
  
  // 세 번째 경로 - 자연/휴식 중심
  const relaxPlaces = getRandomPlaces(3).map((place, index) => ({
    textid: generateUUID(),
    name: place.name,
    description: place.description,
    category: place.category,
    location: place.location,
    address: place.address,
    image_url: undefined
  }));
  
  routes.push({
    textid: generateUUID(),
    room_id: roomId,
    route_data: {
      places: relaxPlaces,
      travel_time: Math.floor(Math.random() * 100) + 120,
      total_cost: Math.floor(Math.random() * 20000) + 20000
    },
    votes: {},
    is_selected: false
  });
  
  return routes;
}

export async function voteForRoute(routeId: string, userId: string, voteType: 'like' | 'dislike') {
  try {
    const { data, error } = await supabase
      .from('route_votes')
      .upsert({
        route_id: routeId,
        user_id: userId,
        vote_type: voteType,
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('경로 투표 오류:', error);
    return { data: null, error };
  }
}

export async function getRouteVotes(routeId: string) {
  const { data, error } = await supabase
    .from('route_votes')
    .select('*')
    .eq('route_id', routeId);
  
  return { data, error };
}

export async function selectFinalRoute(roomId: string, routeId: string, selectedBy: string) {
  const { data, error } = await supabase
    .from('selected_routes')
    .upsert({
      room_id: roomId,
      route_id: routeId,
      selected_by: selectedBy
    })
    .select();
  
  return { data, error };
}

export async function getFinalRoute(roomId: string) {
  const { data, error } = await supabase
    .from('selected_routes')
    .select(`
      *,
      route:route_id (*)
    `)
    .eq('room_id', roomId)
    .single();
  
  return { data, error };
}

// 채팅 관련 함수들
/**
 * 채팅 메시지를 저장합니다.
 */
export async function saveChatMessage(roomId: string, userId: string | null, content: string, isAi: boolean, isAiChat: boolean = false) {
  try {
    // 테이블 선택: AI 채팅인 경우 ai_chat_messages, 아닌 경우 team_chat_messages
    const tableName = isAiChat ? 'ai_chat_messages' : 'team_chat_messages';
    
    const { data, error } = await supabase
      .from(tableName)
      .insert({
        room_id: roomId,
        user_id: userId,
        content,
        is_ai: isAi
      })
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('메시지 저장 오류:', error);
    return { data: null, error };
  }
}

/**
 * 채팅 메시지 목록을 가져옵니다.
 * @param roomId 방 ID
 * @param isAIChat AI 채팅 여부
 * @param limit 가져올 메시지 수
 * @param userId 특정 사용자의 메시지만 가져올 경우 사용자 ID
 */
export async function getChatMessages(roomId: string, isAIChat: boolean = false, limit: number = 50, userId: string | null = null) {
  try {
    // chat_messages 테이블 사용 (단일 테이블)
    let query = supabase
      .from('chat_messages')
      .select(`
        textid,
        content,
        is_ai,
        created_at,
        user_id,
        is_ai_chat
      `)
      .eq('room_id', roomId)
      .eq('is_ai_chat', isAIChat)
      .order('created_at', { ascending: true });
    
    // AI 채팅 메시지의 경우 사용자별 필터링 (개인 채팅)
    if (isAIChat && userId) {
      // 사용자가 보낸 메시지 또는 사용자에게 응답한 AI 메시지만 조회
      query = query.or(`user_id.eq.${userId},is_ai.eq.true`);
    }
    
    // 조회 실행 및 결과 제한
    const { data, error } = await query.limit(limit);
    
    if (error) throw error;
    
    // 메시지가 없는 경우 빈 배열 반환
    if (!data || data.length === 0) {
      return { data: [], error: null };
    }
    
    // 메시지에 관련된 사용자 ID 수집
    const userIds = data
      .filter(message => message.user_id)
      .map(message => message.user_id);
    
    // 중복 제거
    const uniqueUserIds = [...new Set(userIds)];
    
    // 관련 사용자 정보 가져오기 (있는 경우만)
    let userMap: Record<string, any> = {};
    
    if (uniqueUserIds.length > 0) {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, nickname, avatar_url, email')
        .in('id', uniqueUserIds);
      
      if (usersError) {
        console.error('사용자 정보 조회 오류:', usersError);
      } else if (usersData) {
        // 사용자 ID를 키로 하는 맵 생성
        userMap = usersData.reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {} as Record<string, any>);
      }
    }
    
    // 메시지에 사용자 정보 추가하여 반환
    const formattedMessages = data.map(message => {
      // 사용자 정보 추가
      const user = message.user_id ? userMap[message.user_id] || null : null;
      
      // AI 답변인 경우
      if (message.is_ai) {
        return {
          id: message.textid,
          content: message.content,
          isAI: true,
          isAIChat: message.is_ai_chat,
          sender: {
            id: 'ai',
            name: 'AI 어시스턴트',
          },
          timestamp: new Date(message.created_at)
        };
      }
      
      // 일반 사용자 메시지인 경우
      return {
        id: message.textid,
        content: message.content,
        isAI: false,
        isAIChat: message.is_ai_chat,
        sender: {
          id: message.user_id,
          name: user?.nickname || '사용자',
          avatar: user?.avatar_url
        },
        timestamp: new Date(message.created_at)
      };
    });
    
    // isAIChat이 true이고 userId가 제공된 경우, 대화 구조를 확인하여 적절한 메시지만 반환
    // 클라이언트 측에서 추가 필터링 (RLS와 별개로 보장)
    if (isAIChat && userId) {
      // 사용자 메시지와 그에 대한 응답만 유지
      const filteredMessages = formattedMessages.filter((message, index, arr) => {
        // 사용자 메시지인 경우 항상 포함
        if (message.sender.id === userId) return true;
        
        // AI 메시지인 경우, 직전 메시지가 현재 사용자의 메시지인지 확인
        if (message.isAI && index > 0) {
          const prevMessage = arr[index - 1];
          return prevMessage && prevMessage.sender.id === userId;
        }
        
        return false;
      });
      
      return { data: filteredMessages, error: null };
    }
    
    return { data: formattedMessages, error: null };
  } catch (error: any) {
    console.error('채팅 메시지 가져오기 오류:', error);
    return { data: null, error };
  }
}

export async function sendChatMessage(roomId: string, userId: string, content: string, isAIChat: boolean = false) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomId,
        user_id: userId,
        content,
        is_ai: false,
        is_ai_chat: isAIChat
      })
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('채팅 메시지 전송 오류:', error);
    return { data: null, error };
  }
}

export async function sendAIMessage(roomId: string, content: string, isAIChat: boolean = true) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomId,
        content,
        is_ai: true,
        is_ai_chat: isAIChat
      })
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('AI 메시지 전송 오류:', error);
    return { data: null, error };
  }
}

/**
 * AI 응답 생성 함수
 * @param roomId 방 ID
 * @param message 사용자 메시지
 * @returns AI 응답
 */
export const generateAIResponse = async (roomId: string, message: string) => {
  try {
    // 실제 AI 응답 생성이 아닌 간단한 지연 함수 (시뮬레이션)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(1000); // 1초 지연

    // 기본 응답
    let response = "안녕하세요! 서울 여행 계획을 도와드릴게요. 어디로 여행을 계획 중이신가요?";
    let coordinates: {lat: number; lng: number}[] = [];

    // 메시지에 특정 키워드가 포함되어 있는지 확인
    const lowerMsg = message.toLowerCase();
    
    // 인사말 응답
    if (lowerMsg.includes('안녕') || lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
      response = "안녕하세요! 여행 계획을 도와드릴게요. 어디로 여행을 계획 중이신가요?";
    }
    
    // 서울 추천 장소
    else if ((lowerMsg.includes('서울') || lowerMsg.includes('seoul')) && 
            (lowerMsg.includes('추천') || lowerMsg.includes('어디') || lowerMsg.includes('볼만한') || lowerMsg.includes('관광'))) {
      response = "서울에서 꼭 방문해야 할 관광 명소를 추천해 드릴게요!\n\n" +
                "1. 경복궁 - 조선시대 대표적인 궁궐로 아름다운 전통 건축물을 감상할 수 있습니다\n" +
                "2. 남산서울타워 - 서울의 전경을 한눈에 볼 수 있는 탁 트인 전망대\n" +
                "3. 명동 - 쇼핑과 맛집의 중심지로 다양한 브랜드 샵과 먹거리가 있습니다\n" +
                "4. 북촌한옥마을 - 전통 한옥을 구경하며 한국의 전통문화를 체험할 수 있는 곳\n" +
                "5. 광화문광장 - 서울의 중심부에 위치한 역사적인 광장\n\n" +
                "지도에 표시했으니 참고하세요! 더 자세한 정보가 필요하시면 말씀해주세요.";
      
      // 추천 장소 좌표 추가
      coordinates = [
        {lat: 37.579617, lng: 126.977041}, // 경복궁
        {lat: 37.551168, lng: 126.988227}, // 남산서울타워
        {lat: 37.563826, lng: 126.981521}, // 명동
        {lat: 37.582683, lng: 126.983575}, // 북촌한옥마을
        {lat: 37.572031, lng: 126.976594}  // 광화문광장
      ];
    }
    
    // 부산 추천 장소
    else if ((lowerMsg.includes('부산') || lowerMsg.includes('busan')) && 
            (lowerMsg.includes('추천') || lowerMsg.includes('어디') || lowerMsg.includes('볼만한') || lowerMsg.includes('관광'))) {
      response = "부산에서 꼭 방문해야 할 관광 명소를 추천해 드릴게요!\n\n" +
                "1. 해운대 해수욕장 - 부산의 대표 해변으로 아름다운 경치를 즐길 수 있습니다\n" +
                "2. 감천문화마을 - 알록달록한 집들이 모여있는 예술적인 마을\n" +
                "3. 광안리 해수욕장 - 광안대교의 야경이 아름다운 해변\n" +
                "4. 자갈치시장 - 신선한 해산물을 맛볼 수 있는 부산의 대표 시장\n" +
                "5. 태종대 - 부산 끝자락에 위치한 아름다운 절벽과 바다 경치\n\n" +
                "지도에 표시했으니 참고하세요! 더 자세한 정보가 필요하시면 말씀해주세요.";
      
      // 추천 장소 좌표 추가
      coordinates = [
        {lat: 35.158795, lng: 129.160151}, // 해운대 해수욕장
        {lat: 35.134147, lng: 129.066284}, // 감천문화마을
        {lat: 35.153296, lng: 129.118762}, // 광안리 해수욕장
        {lat: 35.097132, lng: 129.030774}, // 자갈치시장
        {lat: 35.051784, lng: 129.084370}  // 태종대
      ];
    }
    
    // 제주 추천 장소
    else if ((lowerMsg.includes('제주') || lowerMsg.includes('jeju')) && 
            (lowerMsg.includes('추천') || lowerMsg.includes('어디') || lowerMsg.includes('볼만한') || lowerMsg.includes('관광'))) {
      response = "제주도에서 꼭 방문해야 할 관광 명소를 추천해 드릴게요!\n\n" +
                "1. 성산일출봉 - 유네스코 세계자연유산으로 지정된 아름다운 화산체\n" +
                "2. 우도 - 소가 누워있는 모양을 닮은 작은 섬으로 자전거 여행하기 좋은 곳\n" +
                "3. 만장굴 - 세계적으로 유명한 용암동굴\n" +
                "4. 한라산 - 제주의 중심에 위치한 아름다운 산으로 등산코스가 잘 갖춰져 있습니다\n" +
                "5. 협재해변 - 에메랄드빛 바다와 하얀 모래사장이 아름다운 해변\n\n" +
                "지도에 표시했으니 참고하세요! 더 자세한 정보가 필요하시면 말씀해주세요.";
      
      // 추천 장소 좌표 추가
      coordinates = [
        {lat: 33.458031, lng: 126.942465}, // 성산일출봉
        {lat: 33.501682, lng: 126.951506}, // 우도
        {lat: 33.528704, lng: 126.771377}, // 만장굴
        {lat: 33.362500, lng: 126.533694}, // 한라산
        {lat: 33.394287, lng: 126.239077}  // 협재해변
      ];
    }
    
    // 맛집 추천
    else if (lowerMsg.includes('맛집') || lowerMsg.includes('먹거리') || lowerMsg.includes('음식')) {
      if (lowerMsg.includes('서울')) {
        response = "서울의 인기 맛집을 알려드릴게요!\n\n" +
                  "1. 광장시장 - 다양한 한국 전통 음식을 맛볼 수 있는 전통시장\n" +
                  "2. 이태원 경리단길 - 다양한 세계 음식점이 모여있는 거리\n" +
                  "3. 통인시장 - 도시락 카페가 유명한 전통시장\n" +
                  "4. 을지로 - 레트로 감성의 맛집들이 많은 지역\n" +
                  "5. 홍대 - 트렌디한 카페와 레스토랑이 많은 젊음의 거리\n\n" +
                  "지도에 표시했으니 참고하세요! 더 자세한 정보가 필요하시면 말씀해주세요.";
        
        // 추천 맛집 좌표 추가
        coordinates = [
          {lat: 37.570362, lng: 126.999729}, // 광장시장
          {lat: 37.538621, lng: 126.988205}, // 이태원 경리단길
          {lat: 37.579409, lng: 126.968462}, // 통인시장
          {lat: 37.566350, lng: 126.993063}, // 을지로
          {lat: 37.556838, lng: 126.923774}  // 홍대
        ];
      } else {
        response = "어느 지역의 맛집을 알고 싶으신가요? 서울, 부산, 제주 등 지역을 말씀해주시면 추천해 드릴게요!";
      }
    }
    
    // 교통 정보
    else if (lowerMsg.includes('교통') || lowerMsg.includes('지하철') || lowerMsg.includes('버스')) {
      response = "한국의 대중교통은 매우 발달되어 있어요. 지하철과 버스를 이용하면 대부분의 관광지에 쉽게 갈 수 있습니다.\n\n" +
                "1. T-money 카드 구입: 편의점에서 구입 가능하며, 지하철과 버스 모두 사용할 수 있어요.\n" +
                "2. 지하철: 서울, 부산 등 대도시는 지하철망이 잘 발달되어 있습니다.\n" +
                "3. 버스: 시내버스, 광역버스, 마을버스 등 다양한 종류가 있어요.\n" +
                "4. 택시: 일반택시와 모범택시가 있으며, 카카오택시 앱을 통해 쉽게 호출할 수 있습니다.\n\n" +
                "더 자세한 정보가 필요하시면 말씀해주세요!";
    }
    
    // 기본 응답
    else {
      response = "안녕하세요! 여행 계획을 도와드릴게요. 서울, 부산, 제주 등 특정 지역의 관광지나 맛집, 교통 정보 등이 필요하시면 말씀해주세요!";
    }

    // 구조화된 응답 반환
    return { data: { content: response, coordinates: coordinates }, error: null };
  } catch (error) {
    console.error("AI 응답 생성 오류:", error);
    return { data: null, error: error };
  }
};

// 유틸리티 함수
function generateInviteCode() {
  // 더 안전하고 읽기 쉬운 초대 코드 생성
  // 숫자 0, 알파벳 O, 숫자 1, 알파벳 I, 알파벳 L 등 혼동되기 쉬운 문자 제외
  const characters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  
  // 6자리 코드 생성
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
}

/**
 * 초대 코드를 정규화합니다. 대문자로 변환하고 하이픈과 공백을 제거합니다.
 * @param code 정규화할 초대 코드
 * @returns 정규화된 코드
 */
function normalizeInviteCode(code: string): string {
  if (!code) return '';
  // 알파벳과 숫자 외 모든 문자 제거하고 대문자로 변환
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * 초대 코드를 표시 형식으로 변환합니다 (예: ABC123 -> ABC-123)
 * @param code 초대 코드
 * @returns 표시용 형식의 코드
 */
export function formatInviteCode(code: string): string {
  if (!code) return '';
  code = code.toUpperCase().replace(/\s/g, '');
  if (code.length !== 6) return code;
  return `${code.slice(0, 3)}-${code.slice(3, 6)}`;
}

/**
 * 방 초대 코드 유효성 검사
 * @param code 초대 코드
 * @returns 유효성 여부 및 방 정보
 */
export async function validateInviteCode(code: string) {
  try {
    // 코드 정규화 (대문자로 변환, 공백 및 하이픈 제거)
    const normalizedCode = normalizeInviteCode(code);
    
    if (normalizedCode.length < 6) {
      return {
        isValid: false,
        error: '유효하지 않은 초대 코드 형식입니다'
      };
    }
    
    // 초대 코드로 방 조회
    const { data, error } = await supabase
      .from('rooms')
      .select('textid, title, owner_id, purpose_category, expected_members, district, status, code')
      .eq('code', normalizedCode)
      .single();
    
    if (error || !data) {
      console.error('초대 코드 검증 오류:', error);
      return {
        isValid: false,
        error: '존재하지 않는 초대 코드입니다'
      };
    }
    
    if (data.status === 'closed') {
      return {
        isValid: false,
        error: '이미 종료된 여행입니다'
      };
    }
    
    return {
      isValid: true,
      roomInfo: data
    };
  } catch (error: any) {
    console.error('초대 코드 검증 오류:', error);
    return {
      isValid: false,
      error: error.message || '초대 코드 검증 중 오류가 발생했습니다'
    };
  }
}

/**
 * 방 초대 코드 재생성
 */
export async function regenerateInviteCode(roomId: string, ownerId: string) {
  try {
    // 방 소유자 확인
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('owner_id')
      .eq('textid', roomId)
      .single();
    
    if (roomError) throw roomError;
    
    if (room.owner_id !== ownerId) {
      return {
        success: false,
        error: '방장만 초대 코드를 재생성할 수 있습니다'
      };
    }
    
    // 새로운 초대 코드 생성
    const inviteCode = generateInviteCode();
    
    // 초대 코드 업데이트
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ code: inviteCode })
      .eq('textid', roomId);
    
    if (updateError) throw updateError;
    
    return {
      success: true,
      inviteCode
    };
  } catch (error: any) {
    console.error('초대 코드 재생성 오류:', error);
    return {
      success: false,
      error: error.message || '초대 코드 재생성 중 오류가 발생했습니다'
    };
  }
}

/**
 * 방 참여 함수
 * @param options 방 참여 옵션 (방 ID, 사용자 ID, 닉네임, 역할)
 * @returns 성공 여부
 */
export async function joinRoom(options: {
  roomId: string;
  userId: string | null;
  nickname?: string;
  role?: 'member' | 'owner'; // role은 더 이상 사용하지 않음
}) {
  try {
    const { roomId, userId, nickname } = options;
    
    // 익명 사용자는 닉네임이 필요
    if (!userId && !nickname) {
      throw new Error('익명 사용자는 닉네임이 필요합니다');
    }

    // 로그인된 사용자인 경우
    if (userId) {
      // 이미 참여 중인지 확인
      const { data: existingMember, error: checkError } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (checkError) throw checkError;
      
      // 이미 참여 중이면 성공 반환
      if (existingMember) {
        return { success: true, roomId };
      }
      
      // 사용자 존재 확인
      const { data: userExists, error: userError } = await supabase
        .from('users')
        .select('textid')
        .eq('textid', userId)
        .maybeSingle();
        
      if (userError) throw userError;
      
      if (!userExists) {
        throw new Error('사용자 정보가 존재하지 않습니다. 다시 로그인해주세요.');
      }
      
      // 방 멤버로 추가 (로그인 사용자)
      const { error: joinError } = await supabase
        .from('room_members')
        .insert({
          room_id: roomId,
          user_id: userId,
          joined_at: new Date().toISOString(),
          is_anonymous: false
        });
      
      if (joinError) throw joinError;
    } 
    // 익명 사용자인 경우
    else {
      // 방 멤버로 추가 (익명 사용자)
      const { data: memberData, error: joinError } = await supabase
        .from('room_members')
        .insert({
          room_id: roomId,
          nickname: nickname,
          joined_at: new Date().toISOString(),
          is_anonymous: true
        })
        .select()
        .single();
      
      if (joinError) throw joinError;
      
      // 익명 사용자 세션 정보를 로컬 스토리지에 저장
      if (memberData) {
        try {
          localStorage.setItem(`anonymous_member_${roomId}`, JSON.stringify({
            member_id: memberData.textid,
            nickname: nickname,
            joined_at: memberData.joined_at
          }));
        } catch (e) {
          console.warn('로컬 스토리지에 익명 세션 저장 실패', e);
        }
      }
    }
    
    return { success: true, roomId };
  } catch (error: any) {
    console.error('방 참여 오류:', error);
    return {
      success: false,
      error: error.message || '방 참여 중 오류가 발생했습니다'
    };
  }
}

/**
 * 방을 삭제합니다. 방장만 삭제할 수 있습니다.
 * 관련된 모든 데이터(멤버, 경로, 투표 등)도 함께 삭제됩니다.
 */
export async function deleteRoom(roomId: string, userId: string) {
  try {
    // 방 소유자 확인
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('owner_id')
      .eq('textid', roomId)
      .single();
    
    if (roomError) throw roomError;
    
    if (!room) {
      return { 
        success: false, 
        error: { message: '방을 찾을 수 없습니다.' } 
      };
    }
    
    if (room.owner_id !== userId) {
      return { 
        success: false, 
        error: { message: '방장만 방을 삭제할 수 있습니다.' } 
      };
    }
    
    // 방 삭제 (CASCADE 설정으로 관련 데이터도 모두 삭제됨)
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('textid', roomId);
    
    if (error) throw error;
    
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: { message: error.message || '방 삭제 중 오류가 발생했습니다.' } 
    };
  }
}

/**
 * 익명 사용자 세션을 확인합니다.
 * 이전에 방에 참여한 익명 사용자인지 확인하고 정보를 반환합니다.
 */
export function getAnonymousSession(roomId: string) {
  try {
    const sessionStr = localStorage.getItem(`anonymous_member_${roomId}`);
    if (!sessionStr) return null;
    
    return JSON.parse(sessionStr);
  } catch (e) {
    console.warn('익명 세션 정보 가져오기 실패', e);
    return null;
  }
}

/**
 * 익명 사용자 세션 여부를 확인하고 정보를 가져옵니다.
 * @param roomId 방 ID
 * @returns 익명 사용자 여부 및 정보
 */
export async function checkAnonymousParticipation(roomId: string) {
  try {
    // 로그인된 사용자인지 확인
    const { user } = await getCurrentUser();
    
    if (user) {
      // 로그인된 사용자면 익명 참여자가 아님
      return { isAnonymous: false, user };
    }
    
    // 로그인된 사용자가 아닌 경우, 로컬 스토리지에 저장된 익명 세션이 있는지 확인
    const anonymousSession = getAnonymousSession(roomId);
    
    if (!anonymousSession) {
      return { isAnonymous: false, user: null };
    }
    
    // 익명 세션이 있으면 해당 멤버 정보 가져오기
    const { data: memberData, error } = await supabase
      .from('room_members')
      .select('*')
      .eq('textid', anonymousSession.member_id)
      .eq('room_id', roomId)
      .maybeSingle();
      
    if (error || !memberData) {
      // 세션 정보가 유효하지 않으면 로컬 스토리지 정보 삭제
      localStorage.removeItem(`anonymous_member_${roomId}`);
      return { isAnonymous: false, user: null };
    }
    
    // 유효한 익명 참여자 정보 반환
    return { 
      isAnonymous: true, 
      user: null, 
      anonymousInfo: {
        ...anonymousSession,
        memberId: memberData.textid
      }
    };
  } catch (e) {
    console.error('익명 참여 확인 오류:', e);
    return { isAnonymous: false, user: null };
  }
}

/**
 * 특정 사용자와 관련된 AI 메시지를 가져옵니다.
 */
export async function getAIMessagesForUser(roomId: string, userId: string, limit: number = 100) {
  try {
    // AI 채팅 메시지 테이블에서 직접 쿼리
    const { data: messagesData, error: messagesError } = await supabase
      .from('ai_chat_messages')
      .select(`
        textid,
        content,
        is_ai,
        created_at,
        user_id
      `)
      .eq('room_id', roomId)
      .or(`user_id.eq.${userId},is_ai.eq.true`)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (messagesError) throw messagesError;
    
    if (!messagesData || messagesData.length === 0) {
      return { data: [], error: null };
    }
    
    // 관련 사용자 정보 가져오기
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('textid, nickname, avatar_url, email')
      .eq('textid', userId)
      .single();
    
    if (userError && userError.code !== 'PGRST116') {
      console.error('사용자 정보 조회 오류:', userError);
    }
    
    // 메시지 형식화 - AI 메시지와 사용자 메시지 구분
    const formattedMessages = messagesData.map(msg => {
      // AI 메시지인 경우
      if (msg.is_ai) {
        return {
          textid: msg.textid,
          content: msg.content,
          is_ai: true,
          is_ai_chat: true,
          created_at: msg.created_at,
          user: {
            textid: 'ai',
            nickname: 'AI 비서'
          }
        };
      }
      
      // 사용자 메시지인 경우
      return {
        textid: msg.textid,
        content: msg.content,
        is_ai: false,
        is_ai_chat: true,
        user_id: msg.user_id,
        created_at: msg.created_at,
        user: userData ? {
          textid: userData.textid,
          nickname: userData.nickname || '사용자',
          avatar_url: userData.avatar_url,
          email: userData.email
        } : {
          textid: msg.user_id,
          nickname: '사용자'
        }
      };
    });
    
    // 대화 구조에 맞게 필터링
    const filteredMessages = formattedMessages.filter((msg, index, arr) => {
      // 사용자 메시지는 항상 포함
      if (!msg.is_ai) return true;
      
      // AI 메시지는 직전 메시지가 사용자 메시지인 경우만 포함
      if (msg.is_ai && index > 0) {
        const prevMessage = arr[index - 1];
        return prevMessage && prevMessage.user_id === msg.user_id;
      }
      
      return false;
    });
    
    return { data: filteredMessages, error: null };
  } catch (error: any) {
    console.error('AI 메시지 가져오기 오류:', error);
    return { data: null, error };
  }
}

/**
 * AI 메시지 메타데이터를 저장합니다.
 * 특정 사용자에게 보내진 AI 응답을 추적하는 데 사용됩니다.
 */
export async function saveMessageMetadata(messageId: string, userId: string, metadata: any = {}) {
  try {
    const { data, error } = await supabase
      .from('chat_message_metadata')
      .insert({
        message_id: messageId,
        user_id: userId,
        metadata
      })
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('메시지 메타데이터 저장 오류:', error);
    return { data: null, error };
  }
}

// UUID 형식인지 확인하는 유틸리티 함수
function isUUID(str: string): boolean {
  // 완전한 UUID 형식인지 확인
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * 유효하지 않은 형식의 UUID를 수정하는 함수
 */
function reformatUUID(str: string): string {
  // 숫자만 있거나 짧은 문자열인 경우 패딩 추가
  if (/^\d+$/.test(str) || str.length < 36) {
    return `00000000-0000-0000-0000-${str.padStart(12, '0')}`;
  }
  
  // 이미 생성된 형식이 있지만 일부만 맞는 경우 (하이픈이 있는 경우)
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 5) {
      const [p1, p2, p3, p4, p5] = parts;
      return `${p1.padStart(8, '0')}-${p2.padStart(4, '0')}-${p3.padStart(4, '0')}-${p4.padStart(4, '0')}-${p5.padStart(12, '0')}`;
    }
  }
  
  // 기본적으로 형식에 맞지 않으면 완전히 새로운 UUID 형식으로 변환
  return `00000000-0000-0000-0000-${str.replace(/[^a-f0-9]/gi, '').substring(0, 12).padStart(12, '0')}`;
}

/**
 * 특정 방의 장소에 대한 투표를 추가하거나 수정합니다.
 * @param roomId 방 ID
 * @param placeId 장소 ID
 * @param userId 사용자 ID
 * @param voteType 투표 타입 ('like' 또는 'dislike')
 */
export async function voteForPlace(roomId: string, placeId: string, userId: string, voteType: 'like' | 'dislike' | null) {
  try {
    // AI 추천 장소 ID 패턴 처리 (place-rec-{timestamp}-{index})
    if (placeId.startsWith('place-rec-')) {
      console.log(`AI 추천 장소 ID 감지: ${placeId}`);
      
      // 해당 장소 이름 및 정보 가져오기 또는 로컬 상태에서 가져오기
      const placeIdParts = placeId.split('-');
      
      // 시간 값과 인덱스 추출
      if (placeIdParts.length >= 4) {
        const timestamp = placeIdParts[2];
        const index = placeIdParts[3];
        
        // UUID v4 형식으로 변환 (실제로는 의사 UUID)
        placeId = generateDeterministicUUID(roomId, `${timestamp}-${index}`);
        console.log(`변환된 UUID: ${placeId}`);
      }
    }
    // UUID 형식인지 확인하고, 아니면 자동 변환
    else if (!isUUID(placeId)) {
      // 자동으로 UUID 형식 변환 시도
      const reformattedUUID = reformatUUID(placeId);
      
      // 로깅은 유지하되 에러로 처리하지 않고 자동 변환된 UUID 사용
      console.warn(`장소 ID '${placeId}'가 유효한 UUID 형식이 아닙니다. '${reformattedUUID}'로 자동 변환합니다.`);
      placeId = reformattedUUID;
    }
    
    // 투표 삭제 (null일 경우)
    if (voteType === null) {
      const { error: deleteError } = await supabase
        .from('place_votes')
        .delete()
        .eq('room_id', roomId)
        .eq('place_id', placeId)
        .eq('user_id', userId);
      
      if (deleteError) throw deleteError;
      return { success: true, data: null, error: null };
    }
    
    // 먼저 places 테이블에 해당 place_id가 존재하는지 확인
    const { data: placeExists, error: placeCheckError } = await supabase
      .from('places')
      .select('textid')
      .eq('textid', placeId)
      .maybeSingle();
    
    if (placeCheckError) {
      console.warn('장소 확인 중 오류:', placeCheckError);
    }
    
    // 장소가, places 테이블에 존재하지 않으면 임시 장소 레코드 생성
    if (!placeExists) {
      console.warn(`장소 ID '${placeId}'가 places 테이블에 존재하지 않습니다. 임시 레코드를 생성합니다.`);
      
      const { error: insertError } = await supabase
        .from('places')
        .insert({
          textid: placeId,
          room_id: roomId,
          name: '임시 장소',
          created_at: new Date().toISOString()
        });
        
      if (insertError) {
        console.error('임시 장소 생성 오류:', insertError);
        throw new Error(`외래 키 제약 조건 위반: places 테이블에 ${placeId}가 존재하지 않습니다.`);
      }
    }
    
    // 'like'를 'up'으로, 'dislike'를 'down'으로 변환 (데이터베이스 제약 조건 충족)
    const dbVoteType = voteType === 'like' ? 'up' : 'down';
    
    // 투표 추가 또는 수정
    const { data, error } = await supabase
      .from('place_votes')
      .upsert({
        room_id: roomId,
        place_id: placeId,
        user_id: userId,
        vote_type: dbVoteType,
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    
    return { success: true, data, error: null };
  } catch (error: any) {
    console.error('장소 투표 오류:', error);
    return { success: false, data: null, error };
  }
}

/**
 * 방과 고유 문자열에서 결정론적 UUID를 생성하는 함수
 * AI 추천 장소 ID를 실제 UUID로 변환하는데 사용됨
 */
function generateDeterministicUUID(roomId: string, uniqueString: string): string {
  // 간단한 해시 함수 (문자열을 숫자 배열로 변환)
  const hashString = (str: string): number[] => {
    const result = [];
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
      result.push(hash & 0xff);
    }
    
    return result;
  };
  
  // 룸 ID와 고유 문자열 결합
  const combined = `${roomId}-${uniqueString}`;
  const hash = hashString(combined);
  
  // UUID v4 형식으로 변환 (의사 랜덤)
  const pattern = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  let uuid = '';
  let hashIndex = 0;
  
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === 'x') {
      // 해시값의 하위 4비트 사용
      uuid += (hash[hashIndex % hash.length] & 0xf).toString(16);
      hashIndex++;
    } else if (pattern[i] === 'y') {
      // UUID v4 형식에 맞게 8, 9, a, b 중 하나 선택
      const y = (hash[hashIndex % hash.length] & 0x3) + 8; // 8-11 범위의 값
      uuid += y.toString(16);
      hashIndex++;
    } else {
      uuid += pattern[i];
    }
  }
  
  return uuid;
}

/**
 * 특정 방의 모든 장소에 대한 투표 정보를 가져옵니다.
 * @param roomId 방 ID
 */
export async function getPlaceVotes(roomId: string) {
  try {
    const { data, error } = await supabase
      .from('place_votes')
      .select('*')
      .eq('room_id', roomId);
    
    if (error) throw error;
    
    // 장소별로 투표 정보 그룹화
    const votesByPlace: Record<string, { likes: number, dislikes: number, userVotes: Record<string, 'like' | 'dislike'> }> = {};
    
    data.forEach(vote => {
      if (!votesByPlace[vote.place_id]) {
        votesByPlace[vote.place_id] = {
          likes: 0,
          dislikes: 0,
          userVotes: {}
        };
      }
      
      // 'up'을 'like'로, 'down'을 'dislike'로 변환
      const normalizedVoteType = vote.vote_type === 'up' ? 'like' : 'dislike';
      
      if (normalizedVoteType === 'like') {
        votesByPlace[vote.place_id].likes += 1;
      } else if (normalizedVoteType === 'dislike') {
        votesByPlace[vote.place_id].dislikes += 1;
      }
      
      votesByPlace[vote.place_id].userVotes[vote.user_id] = normalizedVoteType;
    });
    
    return { data: votesByPlace, error: null };
  } catch (error: any) {
    console.error('장소 투표 조회 오류:', error);
    return { data: null, error };
  }
}

/**
 * 사용자의 KEEP 목록을 가져옵니다.
 * @param userId 사용자 ID
 * @param roomId 선택적 방 ID (특정 방의 KEEP 목록만 가져올 경우)
 * @returns KEEP 목록
 */
export async function getKeptPlaces(roomId: string) {
  try {
    // 쿼리 빌드 - 방 ID로만 필터링하고 사용자 ID는 제외
    const query = supabase
      .from('place_favorites')
      .select(`
        textid,
        room_id,
        place_id,
        created_at,
        places:place_id(textid, name, description, category, address, lat, lng)
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    
    // 쿼리 실행
    const result = await query;
    const { data, error } = result;
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return { data: [], error: null };
    }
    
    // 중복 제거 (같은 장소가 여러 사용자에 의해 저장된 경우)
    const uniquePlaces = new Map();
    
    data.forEach(item => {
      const placeInfo = item.places as any;
      if (!uniquePlaces.has(placeInfo.textid)) {
        uniquePlaces.set(placeInfo.textid, {
          textid: placeInfo.textid,
          name: placeInfo.name,
          description: placeInfo.description || '',
          category: placeInfo.category || '기타',
          address: placeInfo.address || '',
          location: {
            lat: placeInfo.lat || 0,
            lng: placeInfo.lng || 0
          }
        });
      }
    });
    
    const formattedData = Array.from(uniquePlaces.values());
    
    return { data: formattedData, error: null };
  } catch (error: any) {
    console.error('KEEP 목록 가져오기 오류:', error);
    return { data: null, error };
  }
}

/**
 * 장소를 KEEP 목록에 추가합니다.
 * @param userId 사용자 ID
 * @param roomId 방 ID
 * @param placeData 장소 데이터
 * @returns 추가된 장소 정보
 */
export async function addPlaceToKeep(userId: string, roomId: string, placeData: {
  textid: string,
  name: string,
  description: string,
  category: string,
  address: string,
  location: { lat: number, lng: number }
}) {
  try {
    // UUID 형식이 아닌 ID 처리
    let placeId = placeData.textid;
    
    // 기존 ID가 UUID 형식이 아닌 경우 UUID 생성
    if (!isUUID(placeId)) {
      // 결정론적 UUID 생성 (같은 장소에 대해 항상 같은 UUID 반환)
      placeId = generateDeterministicUUID(roomId, `${placeData.name}-${placeData.address}`);
    }
    
    // 1. 먼저 places 테이블에 장소 정보 저장/업데이트
    const { data: placeResult, error: placeError } = await supabase
      .from('places')
      .upsert({
        textid: placeId, // 변경된 ID 사용
        room_id: roomId,
        name: placeData.name,
        description: placeData.description,
        category: placeData.category,
        address: placeData.address,
        lat: placeData.location.lat,
        lng: placeData.location.lng,
        created_by: userId
      })
      .select();
    
    if (placeError) throw placeError;
    
    // 2. place_favorites 테이블에 즐겨찾기 정보 저장
    // 이미 존재하는지 확인 (user_id 조건 제거)
    const { data: existingFavorite, error: checkError } = await supabase
      .from('place_favorites')
      .select('textid')
      .eq('place_id', placeId) // 변경된 ID 사용
      .eq('room_id', roomId)
      .maybeSingle();
    
    if (checkError) throw checkError;
    
    // 이미 즐겨찾기에 있으면 추가하지 않고 성공 반환
    if (existingFavorite) {
      return { success: true, data: { ...placeData, textid: placeId }, error: null };
    }
    
    // 즐겨찾기에 추가
    const { data: favoriteResult, error: favoriteError } = await supabase
      .from('place_favorites')
      .insert({
        user_id: userId,
        room_id: roomId,
        place_id: placeId // 변경된 ID 사용
      })
      .select();
    
    if (favoriteError) throw favoriteError;
    
    return { success: true, data: { ...placeData, textid: placeId }, error: null };
  } catch (error: any) {
    console.error('KEEP 장소 추가 오류:', error);
    return { success: false, data: null, error };
  }
}

/**
 * 장소를 공용 KEEP 목록에서 제거합니다.
 * @param userId 사용자 ID (로그 기록용)
 * @param roomId 방 ID
 * @param placeId 장소 ID
 * @returns 제거 성공 여부
 */
export async function removePlaceFromKeep(userId: string, roomId: string, placeId: string) {
  try {
    // UUID 형식이 아닌 ID 처리
    let formattedPlaceId = placeId;
    
    // ID가 UUID 형식이 아닌 경우 UUID 생성
    if (!isUUID(placeId)) {
      // places 테이블에서 이름으로 장소 찾기 시도
      const { data: placeData } = await supabase
        .from('places')
        .select('textid')
        .eq('room_id', roomId)
        .ilike('name', `%${placeId}%`)
        .maybeSingle();
      
      if (placeData?.textid) {
        formattedPlaceId = placeData.textid;
      } else {
        // 결정론적 방식으로 UUID 생성 시도 (가능하다면)
        try {
          formattedPlaceId = generateDeterministicUUID(roomId, placeId);
        } catch (e) {
          console.warn('장소 ID 변환 실패:', e);
          // 그대로 사용 - 오류가 발생할 수 있으나 시도는 함
        }
      }
    }
    
    // 방 ID와 장소 ID로만 삭제 (user_id 조건 제거)
    const { error } = await supabase
      .from('place_favorites')
      .delete()
      .eq('room_id', roomId)
      .eq('place_id', formattedPlaceId);
    
    if (error) throw error;
    
    return { success: true, error: null };
  } catch (error: any) {
    console.error('KEEP 장소 제거 오류:', error);
    return { success: false, error };
  }
}