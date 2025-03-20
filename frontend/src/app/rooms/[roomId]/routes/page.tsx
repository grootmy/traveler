'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, getChatMessages, sendChatMessage, generateAIResponse, getRoutesByRoomId, generateRoutes } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { joinRoomRealtime, leaveRoomRealtime, subscribeToVoteUpdates, updateVoteRealtime, subscribeToRouteSelection, selectRouteRealtime, subscribeToChatMessages, subscribeToChatBroadcast, broadcastChatMessage } from '@/lib/supabase/realtime'
import KakaoMap from '@/components/KakaoMap'
import RouteVisualization from '@/components/RouteVisualization'
import { ArrowLeft, ThumbsUp, ThumbsDown, Loader2, UserPlus, Check, Users, MapPin, MessageSquare, Bot, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import ChatContainer from '@/components/ChatContainer'
import PlaceCard from '@/components/PlaceCard'
import KakaoScriptLoader from '@/components/KakaoScriptLoader'

type Member = {
  textid: string;
  user_id: string;
  nickname?: string;
  status: 'pending' | 'ready';
  email?: string;
  is_friend?: boolean;
}

type Route = {
  textid: string;
  route_data: {
    places: Array<{
      textid: string;
      name: string;
      description: string;
      category: string;
      location: {
        lat: number;
        lng: number;
      };
      address: string;
      image_url?: string;
    }>;
    travel_time: number;
    total_cost: number;
  };
  votes: Record<string, 'like' | 'dislike'>;
  is_selected: boolean;
}

type Room = {
  textid: string;
  title: string;
  owner_id: string;
}

type Message = {
  id: string
  content: string
  sender: {
    id: string
    name: string
    avatar?: string
  }
  timestamp: Date
  isAI?: boolean
}

export default function RoutesPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [processingSelection, setProcessingSelection] = useState(false)
  const [activeTab, setActiveTab] = useState("members")
  const [allMembersReady, setAllMembersReady] = useState(false)
  const [generatingRoutes, setGeneratingRoutes] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [teamMessages, setTeamMessages] = useState<Message[]>([])
  const [aiMessages, setAiMessages] = useState<Message[]>([])
  const [sendingTeamMessage, setSendingTeamMessage] = useState(false)
  const [sendingAIMessage, setSendingAIMessage] = useState(false)
  const [chatTab, setChatTab] = useState("team")
  const [showAIChat, setShowAIChat] = useState(false)
  const router = useRouter()
  const { roomId } = params

  // 더미 데이터 - 실제로는 API에서 가져와야 함
  const dummyRoutes = [
    {
      textid: '1',
      route_data: {
        places: [
          { textid: '1', name: '광장시장', category: '관광지', address: '서울 중구 종로 88', description: '서울의 대표적인 전통시장', location: { lat: 37.5701, lng: 126.9986 } },
          { textid: '2', name: '광화문광장', category: '관광지', address: '서울 종로구 세종로 172', description: '서울의 중심 광장', location: { lat: 37.5759, lng: 126.9769 } },
          { textid: '3', name: '국립극장', category: '문화시설', address: '서울 중구 장충단로 59', description: '한국의 대표적인 공연장', location: { lat: 37.5525, lng: 127.0073 } },
        ],
        travel_time: 180,
        total_cost: 30000
      },
      votes: {},
      is_selected: false
    },
    {
      textid: '2',
      route_data: {
        places: [
          { textid: '4', name: '청계천', category: '자연', address: '서울 종로구 청계천로', description: '서울 도심을 가로지르는 하천', location: { lat: 37.5696, lng: 126.9784 } },
          { textid: '5', name: '덕수궁', category: '역사', address: '서울 중구 세종대로 99', description: '조선시대의 궁궐', location: { lat: 37.5655, lng: 126.9751 } },
          { textid: '6', name: '명동성당', category: '종교', address: '서울 중구 명동길 74', description: '서울의 대표적인 성당', location: { lat: 37.5633, lng: 126.9873 } },
        ],
        travel_time: 150,
        total_cost: 25000
      },
      votes: {},
      is_selected: false
    },
    {
      textid: '3',
      route_data: {
        places: [
          { textid: '7', name: '남산타워', category: '관광지', address: '서울 용산구 남산공원길 105', description: '서울의 랜드마크', location: { lat: 37.5511, lng: 126.9882 } },
          { textid: '8', name: '이태원', category: '상권', address: '서울 용산구 이태원로', description: '다양한 문화가 공존하는 거리', location: { lat: 37.5344, lng: 126.9947 } },
          { textid: '9', name: '경복궁', category: '역사', address: '서울 종로구 사직로 161', description: '조선의 정궁', location: { lat: 37.5796, lng: 126.9770 } },
        ],
        travel_time: 200,
        total_cost: 35000
      },
      votes: {},
      is_selected: false
    }
  ];

  // 더미 멤버 데이터
  const dummyMembers = [
    { textid: '1', user_id: '1', nickname: '요요', status: 'ready' as const, email: 'yoyo@example.com', is_friend: true },
    { textid: '2', user_id: '2', nickname: '오늘도 즐거움', status: 'ready' as const, email: 'happy@example.com', is_friend: false },
    { textid: '3', user_id: '3', nickname: '다다', status: 'pending' as const, email: 'dada@example.com', is_friend: false },
    { textid: '4', user_id: '4', nickname: 'KKKKKdfsfsfsf', status: 'ready' as const, email: 'kkk@example.com', is_friend: true },
  ];

  // 더미 메시지 데이터
  const dummyTeamMessages = [
    {
      id: '1',
      content: '여러분 어디로 여행가고 싶으신가요?',
      sender: {
        id: '1',
        name: '요요',
      },
      timestamp: new Date(Date.now() - 3600000 * 5),
    },
    {
      id: '2',
      content: '저는 서울 시내 관광지가 좋을 것 같아요!',
      sender: {
        id: '2',
        name: '오늘도 즐거움',
      },
      timestamp: new Date(Date.now() - 3600000 * 4),
    },
    {
      id: '3',
      content: '맛집 투어도 좋을 것 같습니다~',
      sender: {
        id: '3',
        name: '다다',
      },
      timestamp: new Date(Date.now() - 3600000 * 3),
    },
    {
      id: '4',
      content: '좋은 의견들이네요! 모두 포함된 코스로 계획해봐요',
      sender: {
        id: '1',
        name: '요요',
      },
      timestamp: new Date(Date.now() - 3600000 * 2),
    },
  ];

  const dummyAIMessages = [
    {
      id: '1',
      content: '안녕하세요! 여행 계획을 도와드릴 AI 비서입니다. 어떤 도움이 필요하신가요?',
      sender: {
        id: 'ai',
        name: 'AI 비서',
      },
      timestamp: new Date(Date.now() - 3600000 * 5),
      isAI: true,
    },
    {
      id: '2',
      content: '서울 시내에서 가볼만한 곳을 추천해주세요.',
      sender: {
        id: '1',
        name: '요요',
      },
      timestamp: new Date(Date.now() - 3600000 * 4),
    },
    {
      id: '3',
      content: '서울에는 경복궁, 북촌한옥마을, 명동, 남산타워, 홍대, 이태원 등 다양한 명소가 있습니다. 역사적인 장소를 선호하시나요, 아니면 쇼핑이나 현대적인 문화를 경험하고 싶으신가요?',
      sender: {
        id: 'ai',
        name: 'AI 비서',
      },
      timestamp: new Date(Date.now() - 3600000 * 3),
      isAI: true,
    },
  ];

  useEffect(() => {
    const init = async () => {
      try {
        // 현재 사용자 확인
        const { user, error: authError } = await getCurrentUser()
        
        if (authError || !user) {
          router.push('/')
          return
        }
        
        setCurrentUser(user)
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('textid', roomId)
          .single()
        
        if (roomError) throw roomError
        
        setRoom(roomData)
        setIsOwner(roomData.owner_id === user.id)
        
        // 멤버 정보 가져오기
        await fetchMembers()
        
        // 경로 정보 가져오기 (항상 호출)
        await fetchRoutes()
        
        // 초기 탭을 members로 설정하여 바로 참여자 목록 표시
        setActiveTab("members")
        
        // Supabase Realtime 연결
        joinRoomRealtime(roomId)
        
        // 투표 업데이트 이벤트 리스너
        subscribeToVoteUpdates(roomId, ({ routeId, userId, voteType }) => {
          setRoutes(prev => prev.map(route => {
            if (route.textid === routeId) {
              const newVotes = { ...route.votes, [userId]: voteType }
              return { ...route, votes: newVotes }
            }
            return route
          }))
        })
        
        // 경로 선택 이벤트 리스너
        subscribeToRouteSelection(roomId, ({ routeId }) => {
          setSelectedRouteId(routeId)
          
          // 선택된 경로가 있으면 결과 페이지로 이동
          if (routeId) {
            router.push(`/rooms/${roomId}/result`)
          }
        })
        
        // 초기 메시지 로드
        await fetchMessages();
        
        // 채팅 메시지 구독
        subscribeToChatMessages(roomId, (message) => {
          if (message.isAIChat) {
            setAiMessages(prev => {
              // 이미 동일한 ID의 메시지가 있는지 확인
              const messageExists = prev.some(m => m.id === message.id);
              if (messageExists) return prev;
              
              // 새 메시지 추가
              return [...prev, {
                id: message.id,
                content: message.content,
                sender: message.sender,
                timestamp: message.timestamp,
                isAI: message.isAI
              }];
            });
          } else {
            setTeamMessages(prev => {
              // 이미 동일한 ID의 메시지가 있는지 확인
              const messageExists = prev.some(m => m.id === message.id);
              if (messageExists) return prev;
              
              // 새 메시지 추가
              return [...prev, {
                id: message.id,
                content: message.content,
                sender: message.sender,
                timestamp: message.timestamp,
                isAI: message.isAI
              }];
            });
          }
          
          console.log('새 메시지 수신:', message);
        });
        
        // 채팅 메시지 브로드캐스트 구독
        subscribeToChatBroadcast(roomId, (message) => {
          // message.sender가 undefined일 수 있으므로 안전하게 체크
          // AI 채팅인지 여부 확인 (메시지 송신자가 AI인지 확인)
          const isAIChat = message.isAI || (message.sender?.id === 'ai');
          
          if (isAIChat) {
            setAiMessages(prev => {
              // 이미 동일한 ID의 메시지가 있는지 확인
              const messageExists = prev.some(m => m.id === message.id);
              if (messageExists) return prev;
              
              // 새 메시지 추가
              return [...prev, message];
            });
          } else {
            setTeamMessages(prev => {
              // 이미 동일한 ID의 메시지가 있는지 확인
              const messageExists = prev.some(m => m.id === message.id);
              if (messageExists) return prev;
              
              // 새 메시지 추가
              return [...prev, message];
            });
          }
          
          console.log('브로드캐스트 메시지 수신:', message);
        });
        
        // 방 멤버 변경 실시간 구독
        const memberChannel = supabase
          .channel(`room-members:${roomId}`)
          .on('postgres_changes', 
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'room_members',
              filter: `room_id=eq.${roomId}`
            }, 
            (payload) => {
              console.log('새 멤버가 참여했습니다:', payload);
              // 새 멤버가 추가되면 멤버 목록 새로고침
              fetchMembers();
            }
          )
          .on('postgres_changes', 
            { 
              event: 'UPDATE', 
              schema: 'public', 
              table: 'room_members',
              filter: `room_id=eq.${roomId}`
            }, 
            (payload) => {
              console.log('멤버 정보가 업데이트되었습니다:', payload);
              // 멤버 정보가 변경되면 멤버 목록 새로고침
              fetchMembers();
            }
          )
          .subscribe();
        
        setLoading(false)
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다')
        setLoading(false)
        
        // 오류 발생 시에도 더미 데이터 사용
        setTeamMessages(dummyTeamMessages);
        setAiMessages(dummyAIMessages);
      }
    }
    
    init()
    
    return () => {
      // 정리 함수
      leaveRoomRealtime(roomId)
      
      // 멤버 구독 해제
      supabase.channel(`room-members:${roomId}`).unsubscribe()
    }
  }, [roomId, router])

  const fetchRoutes = async () => {
    try {
      // 경로 정보 가져오기
      const { data: routesData, error: routesError } = await getRoutesByRoomId(roomId);
      
      if (routesError) throw routesError;
      
      if (!routesData || routesData.length === 0) {
        console.log('추천 경로가 없습니다. 새로운 경로를 생성합니다.');
        
        setGeneratingRoutes(true);
        
        // 사용자 선호도 정보 수집 (실제 환경에서는 사용자 데이터 기반으로 설정)
        const preferenceData = {
          categories: ['관광지', '문화시설', '역사'],
          max_travel_time: 240,
          max_budget: 50000,
          start_location: { lat: 37.5665, lng: 126.9780 } // 서울 시청 좌표
        };
        
        // 경로 생성 API 호출
        const { data: generatedRoutes, error: generationError } = await generateRoutes(roomId, preferenceData);
        
        if (generationError) throw generationError;
        
        if (generatedRoutes && generatedRoutes.length > 0) {
          setRoutes(generatedRoutes);
        } else {
          // 생성 실패 시 더미 데이터 사용
          setRoutes(dummyRoutes);
        }
        
        setGeneratingRoutes(false);
      } else {
        // 경로가 이미 있는 경우
        setRoutes(routesData);
      }
      
      // 선택된 경로가 있는지 확인
      const selectedRoute = routesData?.find(route => route.is_selected);
      if (selectedRoute) {
        setSelectedRouteId(selectedRoute.textid);
        
        // 선택된 경로가 있으면 결과 페이지로 이동
        router.push(`/rooms/${roomId}/result`);
      }
    } catch (err: any) {
      console.error('경로 정보 가져오기 오류:', err);
      // 오류 발생 시 더미 데이터 사용
      setRoutes(dummyRoutes);
      setGeneratingRoutes(false);
    }
  };

  const fetchMembers = async () => {
    try {
      // 멤버 정보 가져오기
      const { data: membersData, error: membersError } = await supabase
        .from('room_members')
        .select(`
          textid, 
          user_id, 
          nickname, 
          status,
          is_anonymous,
          user:user_id (id, email, display_name, avatar_url)
        `)
        .eq('room_id', roomId)
      
      if (membersError) throw membersError
      
      if (!membersData || membersData.length === 0) {
        console.log('방 멤버가 없습니다. 개발 환경에서만 더미 데이터를 사용합니다.');
        // 개발 환경에서만 더미 데이터 사용
        if (process.env.NODE_ENV === 'development') {
        setMembers(dummyMembers);
        } else {
          setMembers([]);
        }
        // 모든 멤버가 준비되었는지 확인
        setAllMembersReady(false);
        return;
      }
      
      console.log('방 멤버 데이터:', membersData);
      
      // 이메일 정보와 친구 정보를 함께 처리
      const processedMembers = membersData.map(member => {
        // user 객체가 단일 객체가 아닌 배열 타입으로 인식되는 문제 해결
        const userObj = member.user as any;
        
        // 익명 사용자 또는 로그인된 사용자의 닉네임 처리
        let memberNickname = '익명';
        if (member.is_anonymous && member.nickname) {
          memberNickname = member.nickname;
        } else if (userObj) {
          memberNickname = userObj.display_name || userObj.email?.split('@')[0] || '사용자';
        }
        
        return {
          textid: member.textid,
          user_id: member.user_id || `anonymous-${member.textid}`,
          nickname: memberNickname,
          status: member.status || 'pending',
          email: userObj?.email,
          is_friend: false // 기본값, 친구 기능 구현 시 업데이트
        }
      });
      
      setMembers(processedMembers);
      
      // 모든 멤버가 준비되었는지 확인
      const allReady = processedMembers.every(member => member.status === 'ready');
      setAllMembersReady(allReady);
      
    } catch (err: any) {
      console.error('멤버 정보 가져오기 오류:', err)
      // 오류 발생 시에도 UI가 깨지지 않도록 빈 배열 설정
      setMembers([]);
      setAllMembersReady(false);
    }
  }

  const handleVote = (routeId: string, voteType: 'like' | 'dislike') => {
    if (!currentUser) return
    
    // 현재 투표 상태 확인
    const route = routes.find(r => r.textid === routeId)
    if (!route) return
    
    const currentVote = route.votes[currentUser.id]
    
    // 같은 투표 타입이면 투표 취소
    const newVoteType = currentVote === voteType ? null : voteType
    
    // 로컬 상태 업데이트
    setRoutes(prev => prev.map(route => {
      if (route.textid === routeId) {
        const newVotes = { ...route.votes }
        
        if (newVoteType === null) {
          delete newVotes[currentUser.id]
        } else {
          newVotes[currentUser.id] = newVoteType
        }
        
        return { ...route, votes: newVotes }
      }
      return route
    }))
    
    // 서버에 투표 업데이트
    if (newVoteType) {
      updateVoteRealtime(roomId, routeId, currentUser.id, newVoteType)
    } else {
      // 투표 취소 처리
      updateVoteRealtime(roomId, routeId, currentUser.id, null as any)
    }
  }

  // 장소별 투표 처리 함수
  const handlePlaceVote = (placeId: string, voteType: 'up' | 'down') => {
    // 'up'을 'like'로, 'down'을 'dislike'로 변환
    const convertedVoteType = voteType === 'up' ? 'like' : 'dislike';
    
    // 기존 함수 호출
    handleVote(placeId, convertedVoteType);
  }

  const handleSelectRoute = async (routeId: string) => {
    if (!currentUser || !isOwner) return
    
    setProcessingSelection(true)
    
    try {
      // Supabase에 routes 테이블이 존재하지 않으므로 places 테이블 사용
      // 선택된 경로에 속한 장소 정보를 places 테이블에 저장하고 처리
      const selectedRoute = routes.find(r => r.textid === routeId);
      
      if (!selectedRoute) {
        throw new Error('선택한 경로를 찾을 수 없습니다.');
      }

      // places 테이블에 선택된 경로의 장소 정보를 저장
      for (const place of selectedRoute.route_data.places) {
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
            order_index: selectedRoute.route_data.places.indexOf(place),
            created_at: new Date().toISOString(),
            created_by: currentUser.id
          });
      }
      
      // 로컬 상태 업데이트
      setSelectedRouteId(routeId);
      
      // 결과 페이지로 이동
      router.push(`/rooms/${roomId}/result`);
    } catch (err: any) {
      console.error('경로 선택 오류:', err)
      setError(err.message || '경로 선택 중 오류가 발생했습니다')
    } finally {
      setProcessingSelection(false)
    }
  }

  // 친구 추가 함수
  const handleAddFriend = (userId: string) => {
    // 친구 추가 로직 구현
    console.log(`사용자 ${userId}를 친구로 추가`);
    
    // 실제 환경에서는 API 호출
    // 여기서는 UI 업데이트만 시뮬레이션
    setMembers(prev => prev.map(member => 
      member.user_id === userId 
        ? { ...member, is_friend: true } 
        : member
    ));
  }

  const getVoteCount = (route: Route, type: 'like' | 'dislike') => {
    return Object.values(route.votes).filter(vote => vote === type).length
  }

  const getUserVote = (route: Route) => {
    if (!currentUser) return null
    return route.votes[currentUser.id] || null
  }

  // 경로 생성 시작 함수
  const handleStartGeneration = async () => {
    // 모든 멤버가 준비되었는지 확인
    const allReady = members.every(member => member.status === 'ready');
    
    if (!allReady && !showConfirmModal) {
      setShowConfirmModal(true);
      return;
    }
    
    setGeneratingRoutes(true);
    setShowConfirmModal(false);
    
    try {
      // 사용자 선호도 정보 수집 (실제 환경에서는 사용자 데이터 기반으로 설정)
      const preferenceData = {
        categories: ['관광지', '문화시설', '역사'],
        max_travel_time: 240,
        max_budget: 50000,
        start_location: { lat: 37.5665, lng: 126.9780 } // 서울 시청 좌표
      };
      
      // 경로 생성 API 호출
      const { data: generatedRoutes, error: generationError } = await generateRoutes(roomId, preferenceData);
      
      if (generationError) throw generationError;
      
      if (generatedRoutes && generatedRoutes.length > 0) {
        setRoutes(generatedRoutes);
        setAllMembersReady(true);
      } else {
        throw new Error('경로 생성에 실패했습니다.');
      }
    } catch (err: any) {
      console.error('경로 생성 오류:', err);
      setError(err.message || '경로 생성 중 오류가 발생했습니다');
      // 오류 발생 시 더미 데이터 사용
      setRoutes(dummyRoutes);
    } finally {
      setGeneratingRoutes(false);
    }
  };

  const fetchMessages = async () => {
    try {
      // 팀 채팅 메시지 가져오기
      const { data: teamMessagesData, error: teamMessagesError } = await getChatMessages(roomId, false);
      
      if (teamMessagesError) throw teamMessagesError;
      
      if (teamMessagesData && teamMessagesData.length > 0) {
        setTeamMessages(teamMessagesData);
      } else {
        // 팀 채팅 메시지가 없으면 더미 데이터 사용
        setTeamMessages(dummyTeamMessages);
      }
      
      // AI 채팅 메시지 가져오기
      const { data: aiMessagesData, error: aiMessagesError } = await getChatMessages(roomId, true);
      
      if (aiMessagesError) throw aiMessagesError;
      
      if (aiMessagesData && aiMessagesData.length > 0) {
        setAiMessages(aiMessagesData);
      } else {
        // AI 채팅 메시지가 없으면 더미 데이터 사용
        setAiMessages(dummyAIMessages);
      }
    } catch (err: any) {
      console.error('메시지 가져오기 오류:', err);
    }
  };

  // 팀 채팅 메시지 전송 함수
  const handleSendTeamMessage = async (content: string) => {
    if (!currentUser) return;
    
    setSendingTeamMessage(true);
    
    try {
      // 현재 사용자의 닉네임 가져오기 (멤버 목록에서 찾기)
      const currentMember = members.find(member => member.user_id === currentUser.id);
      const nickname = currentMember?.nickname || 
                       currentUser.user_metadata?.display_name || 
                       currentUser.user_metadata?.nickname || 
                       currentUser.email?.split('@')[0] || 
                       '사용자';
      
      // 새 메시지 객체 생성
      const newMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        sender: {
          id: currentUser.id,
          name: nickname,
          avatar: currentUser.user_metadata?.avatar_url
        },
        timestamp: new Date()
      };
      
      // UI 즉시 업데이트를 위해 메시지 추가
      setTeamMessages(prev => [...prev, newMessage]);
      
      // 실제 메시지 저장
      const { data, error } = await sendChatMessage(roomId, currentUser.id, content);
      
      if (error) throw error;
      
      // 다른 사용자에게 메시지 브로드캐스트
      if (data) {
        // 실시간 브로드캐스트를 사용하여 즉각적인 메시지 전송
        const messageId = data[0]?.textid || newMessage.id;
        await broadcastChatMessage(roomId, {
          id: messageId,
          content: content,
          sender: {
            id: currentUser.id,
            name: nickname,
            avatar: currentUser.user_metadata?.avatar_url
          },
          timestamp: new Date(),
          isAI: false
        });
        console.log('메시지 브로드캐스트 완료:', messageId);
      }
    } catch (err: any) {
      console.error('팀 채팅 메시지 전송 오류:', err);
    } finally {
      setSendingTeamMessage(false);
    }
  };

  // AI 채팅 메시지 전송 함수
  const handleSendAIMessage = async (content: string) => {
    if (!currentUser) return;
    
    setSendingAIMessage(true);
    
    try {
      // 현재 사용자의 닉네임 가져오기 (멤버 목록에서 찾기)
      const currentMember = members.find(member => member.user_id === currentUser.id);
      const nickname = currentMember?.nickname || 
                       currentUser.user_metadata?.display_name || 
                       currentUser.user_metadata?.nickname || 
                       currentUser.email?.split('@')[0] || 
                       '사용자';
      
      // 사용자 메시지 객체 생성
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        sender: {
          id: currentUser.id,
          name: nickname,
          avatar: currentUser.user_metadata?.avatar_url
        },
        timestamp: new Date()
      };
      
      // UI 즉시 업데이트를 위해 사용자 메시지 추가
      setAiMessages(prev => [...prev, userMessage]);
      
      // 사용자 메시지 저장
      const { data, error } = await sendChatMessage(roomId, currentUser.id, content, true);
      
      if (error) throw error;
      
      // 다른 사용자에게 메시지 브로드캐스트
      if (data) {
        // 실시간 브로드캐스트를 사용하여 즉각적인 메시지 전송
        const messageId = data[0]?.textid || userMessage.id;
        await broadcastChatMessage(roomId, {
          id: messageId,
          content: content,
          sender: {
            id: currentUser.id,
            name: nickname,
            avatar: currentUser.user_metadata?.avatar_url
          },
          timestamp: new Date(),
          isAI: false
        });
        console.log('AI 채팅 메시지 브로드캐스트 완료:', messageId);
      }
      
      // AI 응답 생성
      const { data: aiResponse, error: aiError } = await generateAIResponse(roomId, content);
      
      if (aiError) throw aiError;
      
      // AI 응답이 이미 데이터베이스에 저장되어 있고, realtime 이벤트로 받을 것이므로
      // 여기서는 별도의 UI 업데이트 불필요
      
    } catch (err: any) {
      console.error('AI 채팅 메시지 전송 오류:', err);
      
      // 오류 발생 시 AI 오류 메시지 추가
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: '메시지 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
        sender: {
          id: 'ai',
          name: 'AI 비서'
        },
        timestamp: new Date(),
        isAI: true
      };
      
      setAiMessages(prev => [...prev, errorMessage]);
    } finally {
      setSendingAIMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      {/* 카카오맵 스크립트 로더 추가 */}
      <KakaoScriptLoader />
      
      {/* 상단 헤더 */}
      <div className="border-b border-gray-200">
        <div className="flex items-center p-4">
          <Link href="/mypage" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{room?.title || '방제목'}</h1>
        </div>
      </div>
      
      {/* 메인 컨텐츠 - 네이버 지도 스타일 인터페이스 */}
      <div className="flex flex-row h-[calc(100vh-64px)]">
        {/* 왼쪽 세로 탭 */}
        <div className="flex flex-row">
          {/* 탭 버튼 영역 */}
          <div className="w-20 bg-gray-100 flex flex-col items-center border-r border-gray-200">
            <Button 
              variant={activeTab === "members" ? "default" : "ghost"}
              size="icon" 
              className={`h-20 w-20 rounded-none ${activeTab === "members" ? "bg-blue-600" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              <Users className="h-10 w-10" />
            </Button>
            <Button 
              variant={activeTab === "routes" ? "default" : "ghost"}
              size="icon" 
              className={`h-20 w-20 rounded-none ${activeTab === "routes" ? "bg-blue-600" : ""}`}
              onClick={() => setActiveTab("routes")}
            >
              <MapPin className="h-10 w-10" />
            </Button>
            <Button 
              variant={activeTab === "recommendations" ? "default" : "ghost"}
              size="icon" 
              className={`h-20 w-20 rounded-none ${activeTab === "recommendations" ? "bg-blue-600" : ""}`}
              onClick={() => setActiveTab("recommendations")}
            >
              <Star className="h-10 w-10" />
            </Button>
          </div>
          
          {/* 탭 내용 영역 */}
          <div className="w-[500px] border-r border-gray-200 overflow-hidden">
            {/* 참여 인원 탭 */}
            {activeTab === "members" && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-bold text-lg">참여 인원</h2>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {members.map(member => (
                    <div key={member.textid} className="flex items-center justify-between py-3 px-4 border-b border-gray-100">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                          {(member.nickname || member.email || '익명')?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.nickname || member.email?.split('@')[0] || '익명 사용자'}
                            {member.user_id === currentUser?.id && ' (나)'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {member.user_id === room?.owner_id ? '방장' : '참여자'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        {member.status === 'ready' ? (
                          <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full mr-2">완료</span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-full mr-2">진행 중</span>
                        )}
                        {member.user_id !== currentUser?.id && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleAddFriend(member.user_id)}
                            className="h-8 w-8"
                            disabled={member.is_friend}
                          >
                            {member.is_friend ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <UserPlus className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 추천 동선 탭 */}
            {activeTab === "routes" && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-bold text-lg">추천 동선</h2>
                  
                  {/* 카테고리 필터 버튼 */}
                  <div className="flex mt-2 space-x-2 overflow-x-auto pb-2">
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      음식
                    </Button>
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      카페
                    </Button>
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      전시
                    </Button>
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      자연
                    </Button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  {routes.length > 0 ? (
                    <div>
                      {/* 첫 번째 추천 동선만 표시 */}
                      <div className="mb-4">
                        <div className="px-4 py-2 bg-gray-50 font-medium flex justify-between items-center">
                          <span>추천 동선</span>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant={getUserVote(routes[0]) === 'like' ? "default" : "outline"} 
                              size="sm" 
                              className="h-7 px-2 text-xs"
                              onClick={() => handleVote(routes[0].textid, 'like')}
                            >
                              <ThumbsUp className="h-3 w-3 mr-1" />
                              찬성 {getVoteCount(routes[0], 'like')}
                            </Button>
                            <Button 
                              variant={getUserVote(routes[0]) === 'dislike' ? "default" : "outline"} 
                              size="sm" 
                              className="h-7 px-2 text-xs"
                              onClick={() => handleVote(routes[0].textid, 'dislike')}
                            >
                              <ThumbsDown className="h-3 w-3 mr-1" />
                              반대 {getVoteCount(routes[0], 'dislike')}
                            </Button>
                          </div>
                        </div>
                        {routes[0].route_data.places.map((place, index) => (
                          <div key={place.textid} className="p-4 border-b border-gray-100 bg-white">
                            <div className="flex justify-between items-center mb-1">
                              <h3 className="font-medium">{index + 1}. {place.name}</h3>
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{place.category}</span>
                            </div>
                            <p className="text-sm text-gray-600 line-clamp-2">{place.description}</p>
                            <p className="text-xs text-gray-500 mt-1">{place.address}</p>
                            <div className="flex items-center mt-2 space-x-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 px-2 text-xs"
                                onClick={() => handlePlaceVote(place.textid, 'up')}
                              >
                                <ThumbsUp className="h-3 w-3 mr-1" />
                                찬성
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 px-2 text-xs"
                                onClick={() => handlePlaceVote(place.textid, 'down')}
                              >
                                <ThumbsDown className="h-3 w-3 mr-1" />
                                반대
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 장소 KEEP 섹션 */}
                      <div className="p-4 border-t border-gray-200">
                        <h3 className="font-medium text-sm text-gray-500 mb-2">장소 KEEP</h3>
                        <div className="space-y-3">
                          {routes[0]?.route_data.places.slice(0, 2).map((place) => (
                            <PlaceCard
                              key={place.textid}
                              place={{
                                textid: place.textid,
                                name: place.name,
                                category: place.category,
                                address: place.address,
                                description: place.description,
                              }}
                              showActions={false}
                            />
                          ))}
                          <p className="text-xs text-center text-gray-400 mt-2">
                            장소의 찬성 버튼을 누르면 KEEP됩니다
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center bg-white">
                      <p className="text-gray-500 mb-4">추천 경로를 불러오는 중입니다...</p>
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 연관 추천 탭 */}
            {activeTab === "recommendations" && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-bold text-lg">연관 추천</h2>
                </div>
                
               
                  <div className="border-t border-gray-200 p-4">
                    <h3 className="font-medium text-sm text-gray-500 mb-2">인기 장소</h3>
                    {routes.length > 0 ? (
                      <div className="space-y-3">
                        {routes[0]?.route_data.places.slice(0, 3).map((place) => (
                          <PlaceCard
                            key={place.textid}
                            place={{
                              textid: place.textid,
                              name: place.name,
                              category: place.category,
                              address: place.address,
                              description: place.description,
                            }}
                            showActions={false}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4 text-center bg-white">
                        <p className="text-gray-500">추천 장소를 불러오는 중...</p>
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mt-2" />
                      </div>
                    )}
                  </div>
                </div>
            )}
          </div>
        </div>
        
        {/* 중앙 - 지도 영역 */}
        <div className="flex-1 relative min-h-full">
          <div className="absolute inset-0">
            <KakaoMap
              width="100%"
              height="100%"
              markers={routes[0]?.route_data.places.map((place, index) => ({
                lat: place.location.lat,
                lng: place.location.lng,
                title: `${index + 1}. ${place.name}`,
                category: place.category.toLowerCase() as any,
                order: index
              })) || []}
              polyline={routes[0]?.route_data.places.map(place => ({
                lat: place.location.lat,
                lng: place.location.lng
              })) || []}
              polylineColor="#3B82F6"
              useStaticMap={false}
              level={7}
              mapTypeId="ROADMAP"
            />
          </div>
          
          {/* 팀 채팅 카드 */}
          <div className="absolute top-4 right-4 w-[350px] flex flex-col gap-4 z-[50]">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
              <div className="p-4 border-b border-gray-200 bg-white">
                <h2 className="font-bold text-lg flex items-center">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  팀 채팅
                </h2>
              </div>
              
              <div className="h-[500px]">
                <ChatContainer
                  messages={teamMessages}
                  currentUser={{
                    id: currentUser?.id || '',
                    name: currentUser?.user_metadata?.nickname || currentUser?.email || '사용자'
                  }}
                  onSendMessage={handleSendTeamMessage}
                  className="h-full"
                  loading={sendingTeamMessage}
                />
              </div>
            </div>
          </div>
          
          {/* 하단 버튼 영역 */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-white bg-opacity-90 border-t border-gray-200 flex justify-between z-[100] shadow-md">
            {/* AI 채팅 버튼 추가 */}
            <Button 
              variant="outline"
              size="lg" 
              className="rounded-full bg-white shadow-md px-6"
              onClick={() => setShowAIChat(!showAIChat)}
            >
              <Bot className="h-7 w-7 mr-2" />
            </Button>
            
            <Button
              onClick={() => {
                if (typeof window !== "undefined") {
                  const url = window.location.href;
                  navigator.clipboard.writeText(url)
                    .then(() => {
                      alert("방 링크가 클립보드에 복사되었습니다.");
                    })
                    .catch(err => {
                      console.error('URL 복사 실패:', err);
                      alert("링크 복사에 실패했습니다.");
                    });
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-6 text-lg"
              size="lg"
            >
              공유하기
            </Button>
          </div>
          
          {/* AI 채팅 오버레이 UI */}
          {showAIChat && (
            <div className="absolute bottom-20 left-4 w-[350px] h-[450px] bg-white shadow-lg rounded-lg overflow-hidden z-[101] border border-gray-200">
              <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center">
                  <Bot className="h-5 w-5 mr-2 text-blue-500" />
                  <h3 className="font-medium">AI 여행 어시스턴트</h3>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setShowAIChat(false)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </Button>
              </div>
              <div className="h-[calc(100%-60px)]">
                <ChatContainer
                  messages={aiMessages}
                  currentUser={{
                    id: currentUser?.id || '',
                    name: currentUser?.user_metadata?.nickname || currentUser?.email || '사용자'
                  }}
                  onSendMessage={handleSendAIMessage}
                  className="h-full"
                  isAIChat={true}
                  loading={sendingAIMessage}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-500 text-center">
          {error}
        </div>
      )}
    </main>
  )
} 