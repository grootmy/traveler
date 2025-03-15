import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { routeGeneratorService } from '../services/routeGenerator';
import { chatbotService, ChatbotRequest } from '../services/chatbotService';
// Supabase 함수 임포트
import { selectRoute, updateVote, notifyPreferencesCompleted } from '../supabase';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 경로 생성 API
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.body;
    
    if (!roomId) {
      return res.status(400).json({ error: '방 ID가 필요합니다' });
    }
    
    // 방 정보 및 참여자 성향 조회
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    
    if (roomError) {
      return res.status(404).json({ error: '방을 찾을 수 없습니다' });
    }
    
    const { data: members, error: membersError } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId);
    
    if (membersError) {
      return res.status(500).json({ error: '멤버 정보를 가져오는 중 오류가 발생했습니다' });
    }
    
    // 참여자 성향 정보 수집
    const preferences = members.map(member => ({
      relationship: member.relationship,
      preferences: member.preferences
    }));
    
    // 경로 생성 요청 데이터
    const requestData = {
      region: room.region,
      budget: room.budget,
      startTime: room.start_time,
      endTime: room.end_time,
      preferences: preferences
    };
    
    try {
      // LangGraph를 사용한 경로 생성
      const routes = await routeGeneratorService.generateRoutes(requestData);
      
      // 생성된 경로 저장
      for (const route of routes) {
        await supabase
          .from('routes')
          .insert({
            room_id: roomId,
            route_data: route,
            travel_time: route.travel_time,
            total_cost: route.total_cost
          });
      }
      
      res.json({ success: true, routes });
    } catch (error: any) {
      console.error('경로 생성 오류:', error);
      
      // 오류 발생 시 샘플 경로 사용
      const sampleRoutes = generateSampleRoutes(requestData);
      
      // 샘플 경로 저장
      for (const route of sampleRoutes) {
        await supabase
          .from('routes')
          .insert({
            room_id: roomId,
            route_data: route,
            travel_time: route.travel_time,
            total_cost: route.total_cost
          });
      }
      
      res.json({ 
        success: true, 
        routes: sampleRoutes,
        message: '경로 생성 중 오류가 발생하여 샘플 경로를 제공합니다.'
      });
    }
  } catch (error: any) {
    console.error('경로 생성 오류:', error);
    res.status(500).json({ error: '경로 생성 중 오류가 발생했습니다' });
  }
});

// 챗봇 API
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { roomId, userId, message } = req.body;
    
    if (!roomId || !message) {
      return res.status(400).json({ error: '방 ID와 메시지가 필요합니다' });
    }
    
    // 방 정보 조회
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    
    if (roomError) {
      return res.status(404).json({ error: '방을 찾을 수 없습니다' });
    }
    
    // 최종 선택된 경로 조회
    const { data: selectedRouteData, error: routeError } = await supabase
      .from('selected_routes')
      .select(`
        *,
        route:route_id (*)
      `)
      .eq('room_id', roomId)
      .single();
    
    // 이전 대화 내용 조회 (최근 10개)
    const { data: previousMessages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    // 이전 대화 내용 포맷팅
    const formattedMessages = previousMessages ? 
      previousMessages.reverse().map(msg => ({
        role: msg.is_ai ? 'assistant' as const : 'user' as const,
        content: msg.message
      })) : [];
    
    // 챗봇 요청 데이터
    const chatbotRequest: ChatbotRequest = {
      roomId,
      userId,
      message,
      selectedRoute: selectedRouteData?.route?.route_data,
      previousMessages: formattedMessages
    };
    
    // 챗봇 응답 생성
    const reply = await chatbotService.generateResponse(chatbotRequest);
    
    // 채팅 메시지 저장
    await supabase
      .from('chat_messages')
      .insert([
        {
          room_id: roomId,
          user_id: userId,
          message: message,
          is_ai: false
        },
        {
          room_id: roomId,
          message: reply,
          is_ai: true
        }
      ]);
    
    res.json({ reply });
  } catch (error: any) {
    console.error('챗봇 응답 오류:', error);
    res.status(500).json({ error: '챗봇 응답 생성 중 오류가 발생했습니다' });
  }
});

// 투표 업데이트 API
router.post('/vote', async (req: Request, res: Response) => {
  try {
    const { roomId, routeId, userId, voteType } = req.body;
    
    if (!roomId || !routeId || !userId || !voteType) {
      return res.status(400).json({ error: '필수 정보가 누락되었습니다' });
    }
    
    // 투표 정보 저장
    const { error } = await supabase
      .from('route_votes')
      .upsert({
        route_id: routeId,
        user_id: userId,
        vote_value: voteType === 'like' ? 1 : -1
      });
    
    if (error) {
      return res.status(500).json({ error: '투표 저장 중 오류가 발생했습니다' });
    }
    
    // Supabase Realtime으로 투표 업데이트 알림
    await updateVote(roomId, routeId, userId, voteType);
    
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '투표 처리 중 오류가 발생했습니다' });
  }
});

// 경로 선택 API
router.post('/select', async (req: Request, res: Response) => {
  try {
    const { roomId, routeId, userId } = req.body;
    
    if (!roomId || !routeId || !userId) {
      return res.status(400).json({ error: '필수 정보가 누락되었습니다' });
    }
    
    // 선택된 경로 업데이트
    const { error } = await supabase
      .from('routes')
      .update({ is_selected: true })
      .eq('id', routeId);
    
    if (error) {
      return res.status(500).json({ error: '경로 선택 중 오류가 발생했습니다' });
    }
    
    // 방 상태 업데이트
    await supabase
      .from('rooms')
      .update({ status: 'completed' })
      .eq('id', roomId);
    
    // Supabase Realtime으로 경로 선택 알림
    await selectRoute(roomId, routeId);
    
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '경로 선택 중 오류가 발생했습니다' });
  }
});

// 성향 테스트 완료 API
router.post('/preferences-completed', async (req: Request, res: Response) => {
  try {
    const { roomId, userId, nickname } = req.body;
    
    if (!roomId || !userId) {
      return res.status(400).json({ error: '필수 정보가 누락되었습니다' });
    }
    
    // Supabase Realtime으로 성향 테스트 완료 알림
    await notifyPreferencesCompleted(roomId, userId, nickname || '익명 사용자');
    
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '알림 전송 중 오류가 발생했습니다' });
  }
});

// 샘플 경로 생성 함수 (LangGraph 오류 시 대체용)
function generateSampleRoutes(requestData: any) {
  const { region } = requestData;
  
  // 서울 지역 샘플 경로
  if (region === '서울') {
    return [
      {
        places: [
          {
            id: '1',
            name: '경복궁',
            description: '조선시대 대표적인 궁궐로, 아름다운 전통 건축물을 감상할 수 있습니다.',
            category: '문화/역사',
            location: { lat: 37.5796, lng: 126.9770 },
            address: '서울특별시 종로구 사직로 161'
          },
          {
            id: '2',
            name: '인사동',
            description: '전통 공예품과 예술품을 구경하고 쇼핑할 수 있는 거리입니다.',
            category: '쇼핑',
            location: { lat: 37.5744, lng: 126.9856 },
            address: '서울특별시 종로구 인사동길'
          },
          {
            id: '3',
            name: '북촌 한옥마을',
            description: '전통 한옥을 구경하고 다양한 체험을 할 수 있는 마을입니다.',
            category: '문화/역사',
            location: { lat: 37.5826, lng: 126.9860 },
            address: '서울특별시 종로구 계동길 37'
          },
          {
            id: '4',
            name: '삼청동 카페거리',
            description: '아기자기한 카페와 맛집이 모여있는 거리입니다.',
            category: '맛집/카페',
            location: { lat: 37.5826, lng: 126.9816 },
            address: '서울특별시 종로구 삼청로'
          }
        ],
        travel_time: 240, // 분 단위
        total_cost: 50000
      },
      {
        places: [
          {
            id: '5',
            name: '남산서울타워',
            description: '서울의 전경을 한눈에 볼 수 있는 랜드마크입니다.',
            category: '자연/풍경',
            location: { lat: 37.5511, lng: 126.9882 },
            address: '서울특별시 용산구 남산공원길 105'
          },
          {
            id: '6',
            name: '명동',
            description: '쇼핑과 맛집이 가득한 서울의 대표적인 관광지입니다.',
            category: '쇼핑',
            location: { lat: 37.5636, lng: 126.9810 },
            address: '서울특별시 중구 명동길'
          },
          {
            id: '7',
            name: '동대문디자인플라자',
            description: '독특한 건축물과 다양한 전시를 볼 수 있는 복합문화공간입니다.',
            category: '문화/역사',
            location: { lat: 37.5670, lng: 127.0095 },
            address: '서울특별시 중구 을지로 281'
          },
          {
            id: '8',
            name: '청계천',
            description: '도심 속 휴식처로, 산책하기 좋은 하천입니다.',
            category: '자연/풍경',
            location: { lat: 37.5696, lng: 126.9784 },
            address: '서울특별시 종로구 청계천로'
          }
        ],
        travel_time: 300, // 분 단위
        total_cost: 70000
      },
      {
        places: [
          {
            id: '9',
            name: '홍대 거리',
            description: '젊은이들의 문화와 예술이 살아숨쉬는 거리입니다.',
            category: '쇼핑',
            location: { lat: 37.5558, lng: 126.9236 },
            address: '서울특별시 마포구 홍대입구역'
          },
          {
            id: '10',
            name: '연트럴파크',
            description: '옛 철길을 공원으로 재탄생시킨 도심 속 녹지공간입니다.',
            category: '자연/풍경',
            location: { lat: 37.5604, lng: 126.9311 },
            address: '서울특별시 마포구 연남동'
          },
          {
            id: '11',
            name: '망원한강공원',
            description: '한강을 따라 산책하고 피크닉을 즐길 수 있는 공원입니다.',
            category: '자연/풍경',
            location: { lat: 37.5546, lng: 126.9009 },
            address: '서울특별시 마포구 망원동'
          },
          {
            id: '12',
            name: '망리단길',
            description: '망원동과 합정동 사이에 위치한 맛집과 카페가 많은 거리입니다.',
            category: '맛집/카페',
            location: { lat: 37.5548, lng: 126.9105 },
            address: '서울특별시 마포구 망원동'
          }
        ],
        travel_time: 270, // 분 단위
        total_cost: 60000
      }
    ];
  }
  
  // 부산 지역 샘플 경로
  if (region === '부산') {
    return [
      {
        places: [
          {
            id: '13',
            name: '해운대 해수욕장',
            description: '부산의 대표적인 해변으로, 아름다운 바다 경관을 감상할 수 있습니다.',
            category: '자연/풍경',
            location: { lat: 35.1586, lng: 129.1603 },
            address: '부산광역시 해운대구 해운대해변로 264'
          },
          {
            id: '14',
            name: '광안리 해수욕장',
            description: '광안대교의 야경이 아름다운 해변입니다.',
            category: '자연/풍경',
            location: { lat: 35.1531, lng: 129.1182 },
            address: '부산광역시 수영구 광안해변로 219'
          },
          {
            id: '15',
            name: '부산 시립 미술관',
            description: '다양한 현대 미술 작품을 감상할 수 있는 미술관입니다.',
            category: '문화/역사',
            location: { lat: 35.1546, lng: 129.1288 },
            address: '부산광역시 해운대구 APEC로 58'
          },
          {
            id: '16',
            name: '센텀시티',
            description: '쇼핑과 엔터테인먼트를 즐길 수 있는 복합 상업 지구입니다.',
            category: '쇼핑',
            location: { lat: 35.1691, lng: 129.1312 },
            address: '부산광역시 해운대구 센텀남대로 35'
          }
        ],
        travel_time: 240, // 분 단위
        total_cost: 50000
      }
    ];
  }
  
  // 기본 샘플 경로
  return [
    {
      places: [
        {
          id: '17',
          name: '샘플 장소 1',
          description: '샘플 장소 설명입니다.',
          category: '자연/풍경',
          location: { lat: 37.5665, lng: 126.9780 },
          address: '샘플 주소 1'
        },
        {
          id: '18',
          name: '샘플 장소 2',
          description: '샘플 장소 설명입니다.',
          category: '맛집/카페',
          location: { lat: 37.5700, lng: 126.9800 },
          address: '샘플 주소 2'
        },
        {
          id: '19',
          name: '샘플 장소 3',
          description: '샘플 장소 설명입니다.',
          category: '문화/역사',
          location: { lat: 37.5750, lng: 126.9850 },
          address: '샘플 주소 3'
        },
        {
          id: '20',
          name: '샘플 장소 4',
          description: '샘플 장소 설명입니다.',
          category: '쇼핑',
          location: { lat: 37.5800, lng: 126.9900 },
          address: '샘플 주소 4'
        }
      ],
      travel_time: 240, // 분 단위
      total_cost: 50000
    }
  ];
}

export default router; 