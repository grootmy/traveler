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
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomId,
        user_id: userId,
        content,
        is_ai: isAi,
        is_ai_chat: isAiChat
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
 */
export async function getChatMessages(roomId: string, isAIChat: boolean = false, limit: number = 50) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(`
        textid,
        content,
        is_ai,
        is_ai_chat,
        created_at,
        user_id
      `)
      .eq('room_id', roomId)
      .eq('is_ai_chat', isAIChat)
      .order('created_at', { ascending: true })
      .limit(limit);
    
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
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('textid, email, nickname, avatar_url')
        .in('textid', uniqueUserIds);
      
      if (!userError && userData) {
        // 사용자 정보를 ID로 맵핑
        userMap = userData.reduce((acc, user) => {
          acc[user.textid] = user;
          return acc;
        }, {} as Record<string, any>);
      }
    }
    
    // 사용자 정보와 함께 메시지 데이터 포맷팅
    const formattedMessages = data.map(message => {
      // AI 메시지인 경우 기본 AI 정보 사용
      if (message.is_ai) {
        return {
          id: message.textid,
          content: message.content,
          sender: {
            id: 'ai',
            name: 'AI 비서'
          },
          timestamp: new Date(message.created_at),
          isAI: true
        };
      }
      
      // 사용자 메시지인 경우 사용자 정보 사용
      const userInfo = message.user_id ? userMap[message.user_id] : null;
      const userName = userInfo?.nickname || userInfo?.email?.split('@')[0] || '사용자';
      
      return {
        id: message.textid,
        content: message.content,
        sender: {
          id: message.user_id || 'anonymous',
          name: userName,
          avatar: userInfo?.avatar_url
        },
        timestamp: new Date(message.created_at),
        isAI: false
      };
    });
    
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

// AI 응답 생성 - 실제로는 OpenAI API와 연동
export async function generateAIResponse(roomId: string, userMessage: string) {
  try {
    // 테스트용 지연 함수
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // 실제 환경에서는 OpenAI API 호출
    // const response = await fetch('/api/ai/chat', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     roomId,
    //     message: userMessage
    //   })
    // });
    
    // 테스트용 응답
    await delay(1000);
    
    // 간단한 응답 패턴 (실제로는 AI 응답)
    let aiResponse = "죄송합니다. 아직 이해하지 못했습니다.";
    
    if (userMessage.includes('안녕') || userMessage.includes('반가워')) {
      aiResponse = "안녕하세요! 여행 계획을 도와드릴게요. 어떤 도움이 필요하신가요?";
    } else if (userMessage.includes('추천') || userMessage.includes('어디가') || userMessage.includes('장소')) {
      aiResponse = "서울에는 많은 관광명소가 있어요. 광화문, 경복궁, 남산타워, 명동 등이 유명합니다. 더 구체적인 취향이나 조건을 알려주시면 더 맞춤형 추천을 드릴 수 있어요!";
    } else if (userMessage.includes('맛집') || userMessage.includes('음식') || userMessage.includes('먹을')) {
      aiResponse = "서울의 맛집으로는 광장시장(전통시장 먹거리), 이태원(다양한 나라 음식), 홍대(트렌디한 카페와 식당) 등이 있습니다. 어떤 종류의 음식을 찾으시나요?";
    } else if (userMessage.includes('교통') || userMessage.includes('이동') || userMessage.includes('지하철')) {
      aiResponse = "서울은 대중교통이 매우 발달되어 있어요. 지하철이 가장 편리하고, T-money 카드를 이용하면 버스와 지하철을 모두 이용할 수 있습니다. 특정 목적지로 가는 방법이 필요하시면 알려주세요!";
    }
    
    // AI 응답 저장
    await sendAIMessage(roomId, aiResponse);
    
    return { data: aiResponse, error: null };
  } catch (error: any) {
    console.error('AI 응답 생성 오류:', error);
    return { data: null, error };
  }
}

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