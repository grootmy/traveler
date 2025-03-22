'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, getChatMessages, sendChatMessage, generateAIResponse, getRoutesByRoomId, generateRoutes, checkAnonymousParticipation, getRoomMembers, selectFinalRoute, voteForPlace, getPlaceVotes } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  joinRoomRealtime, 
  leaveRoomRealtime, 
  subscribeToVoteUpdates, 
  broadcastVote, 
  subscribeToRouteSelection, 
  broadcastRouteSelection, 
  subscribeToChatMessages, 
  subscribeToChatBroadcast, 
  broadcastChatMessage 
} from '@/lib/supabase/realtime'
import KakaoMap from '@/components/KakaoMap'
import RouteVisualization from '@/components/RouteVisualization'
import { ArrowLeft, ThumbsUp, ThumbsDown, Loader2, UserPlus, Check, Users, MapPin, MessageSquare, Bot, Star, GripVertical, X, ArrowDownCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import ChatContainer from '@/components/ChatContainer'
import PlaceCard from '@/components/PlaceCard'
import KakaoScriptLoader from '@/components/KakaoScriptLoader'
import { Reorder } from "motion/react"
import { toast } from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { useMapStore } from '@/store/mapStore'

type Member = {
  textid: string;
  user_id: string;
  nickname?: string;
  // status: 'pending' | 'ready';
  email?: string;
  is_friend?: boolean;
}

type AnonymousInfo = {
  id: string;
  nickname: string;
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
  votes: Record<string, 'like' | 'dislike' | null>;
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
  coordinates?: Array<{lat: number, lng: number}>
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
  // const [allMembersReady, setAllMembersReady] = useState(false)
  const [generatingRoutes, setGeneratingRoutes] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [teamMessages, setTeamMessages] = useState<Message[]>([])
  const [aiMessages, setAiMessages] = useState<Message[]>([])
  const [sendingTeamMessage, setSendingTeamMessage] = useState(false)
  const [sendingAIMessage, setSendingAIMessage] = useState(false)
  const [chatTab, setChatTab] = useState("team")
  const [showAIChat, setShowAIChat] = useState(false)
  const [showTeamChat, setShowTeamChat] = useState(false)
  const [keepPlaces, setKeepPlaces] = useState<Array<any>>([])
  // 추가: 추천 장소 목록을 관리하기 위한 상태
  const [recommendedPlaces, setRecommendedPlaces] = useState<Array<any>>([])
  const [recommendedMarkers, setRecommendedMarkers] = useState<Array<any>>([])
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [anonymousInfo, setAnonymousInfo] = useState<any>(null)
  const router = useRouter()
  const { roomId } = params
  const [placeVotes, setPlaceVotes] = useState<Record<string, { likes: number, dislikes: number, userVotes: Record<string, 'like' | 'dislike'> }>>({})
  
  // 지도 상태 저장소
  const mapStore = useMapStore();

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
    async function init() {
      try {
        setLoading(true)
        
        // 익명 사용자 세션 확인
        const { isAnonymous, user, anonymousInfo } = await checkAnonymousParticipation(roomId)
        
        if (user) {
          setCurrentUser(user)
        } else if (isAnonymous && anonymousInfo) {
          setIsAnonymous(true)
          setAnonymousInfo(anonymousInfo)
        } else {
          // 로그인되지 않았고 익명 세션도 없으면 초대 페이지로 리디렉션
          router.push(`/invite?roomId=${roomId}`)
          return
        }
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('textid', roomId)
          .single()
        
        if (roomError || !roomData) {
          setError('방 정보를 찾을 수 없습니다')
          return
        }
        
        setRoom(roomData)
        setIsOwner(roomData.owner_id === (user?.id || null))
        
        // 멤버 정보 가져오기
        await fetchMembers()
        
        // 경로 정보 가져오기 (항상 호출)
        await fetchRoutes()
        
        // 장소 투표 정보 가져오기
        await fetchPlaceVotes()
        
        // 초기 탭을 members로 설정하여 바로 참여자 목록 표시
        setActiveTab("members")
        
        // Supabase Realtime 연결 - 한 번만 초기화
        const channel = joinRoomRealtime(roomId)
        console.log('Realtime 채널 초기화 완료:', roomId)
        
        // 초기 메시지 로드 
        await fetchMessages()
        
        // 채팅 메시지 구독 및 투표 이벤트 리스너 등록 - 중복 등록 방지
        let chatMessagesRegistered = false
        let chatBroadcastRegistered = false
        let voteUpdatesRegistered = false
        let routeSelectionRegistered = false
        
        // 투표 업데이트 이벤트 리스너
        if (!voteUpdatesRegistered) {
          subscribeToVoteUpdates(roomId, ({ routeId, userId, voteType }) => {
            // 장소 ID를 routeId로 사용
            const placeId = routeId;
            
            // 장소 투표 정보 업데이트
            setPlaceVotes(prev => {
              const newPlaceVotes = { ...prev };
              
              // 해당 장소에 대한 투표 정보가 없으면 초기화
              if (!newPlaceVotes[placeId]) {
                newPlaceVotes[placeId] = {
                  likes: 0,
                  dislikes: 0,
                  userVotes: {}
                };
              }
              
              // 이전 투표 정보 확인
              const prevVoteType = newPlaceVotes[placeId].userVotes[userId];
              
              // 이전 투표 카운트 조정
              if (prevVoteType === 'like') {
                newPlaceVotes[placeId].likes = Math.max(0, newPlaceVotes[placeId].likes - 1);
              } else if (prevVoteType === 'dislike') {
                newPlaceVotes[placeId].dislikes = Math.max(0, newPlaceVotes[placeId].dislikes - 1);
              }
              
              // 새 투표 적용
              if (voteType === 'like') {
                newPlaceVotes[placeId].likes += 1;
                newPlaceVotes[placeId].userVotes[userId] = 'like';
              } else if (voteType === 'dislike') {
                newPlaceVotes[placeId].dislikes += 1;
                newPlaceVotes[placeId].userVotes[userId] = 'dislike';
              } else if (voteType === null) {
                // 투표 취소
                delete newPlaceVotes[placeId].userVotes[userId];
              }
              
              return newPlaceVotes;
            });
          });
          voteUpdatesRegistered = true;
          console.log('투표 업데이트 리스너 등록 완료');
        }
        
        // 경로 선택 이벤트 리스너
        if (!routeSelectionRegistered) {
          subscribeToRouteSelection(roomId, ({ routeId }) => {
            setSelectedRouteId(routeId)
            
            // 선택된 경로가 있으면 결과 페이지로 이동
            if (routeId) {
              router.push(`/rooms/${roomId}/result`)
            }
          })
          routeSelectionRegistered = true
          console.log('경로 선택 리스너 등록 완료')
        }
        
        // 채팅 메시지 구독
        if (!chatMessagesRegistered) {
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
          })
          chatMessagesRegistered = true
          console.log('채팅 메시지 리스너 등록 완료')
        }
        
        // 채팅 메시지 브로드캐스트 구독
        if (!chatBroadcastRegistered) {
          subscribeToChatBroadcast(roomId, (message) => {
            // 메시지 객체 유효성 검사
            if (!message || typeof message !== 'object') {
              console.error('유효하지 않은 메시지 객체:', message);
              return;
            }
            
            // 필수 필드 확인
            if (!message.content || !message.sender || !message.sender.id) {
              console.error('메시지에 필수 필드가 없습니다:', message);
              return;
            }
            
            console.log('[브로드캐스트] 메시지 수신:', {
              id: message.id,
              content: message.content.substring(0, 15) + (message.content.length > 15 ? '...' : ''),
              sender: message.sender.id,
              isAI: message.isAI,
              isAIChat: message.isAIChat, // isAIChat 로깅 추가
              timestamp: new Date(message.timestamp).toISOString()
            });
            
            // 자신이 보낸 메시지는 무시 (이미 UI에 표시됨)
            const currentUserId = currentUser?.id || anonymousInfo?.id;
            if (message.sender.id === currentUserId) {
              console.log('자신이 보낸 메시지 무시:', message.id);
              return;
            }
            
            // AI 메시지인 경우 무시 (이 페이지는 팀 채팅만 표시)
            if (message.isAI) {
              console.log('AI 메시지 무시');
              return;
            }
            
            // AI 채팅 메시지인 경우 무시 (개인 AI 채팅은 해당 사용자만 볼 수 있음)
            if (message.isAIChat === true) {
              console.log('AI 채팅 메시지 무시 (isAIChat이 true)');
              return;
            }
            
            // message.isAI 또는 sender.id가 'ai'인 경우 AI 채팅으로 간주
            const isAIMessage = message.isAI || (message.sender?.id === 'ai');
            
            if (isAIMessage) {
              setAiMessages(prev => {
                // 메시지 ID로 중복 확인
                const duplicateByID = prev.some(m => m.id === message.id);
                
                // 내용과 발신자로 중복 확인 (타임스탬프 근접성 고려)
                const duplicateByContent = prev.some(m => 
                  m.content === message.content && 
                  m.sender.id === message.sender.id &&
                  Math.abs((new Date(m.timestamp).getTime() - new Date(message.timestamp).getTime())) < 3000
                );
                
                if (duplicateByID || duplicateByContent) {
                  console.log('[AI 채팅] 중복 메시지 무시:', message.id);
                  return prev;
                }
                
                console.log('[AI 채팅] 새 메시지 추가:', message.id);
                return [...prev, message];
              });
            } else {
              setTeamMessages(prev => {
                // 메시지 ID로 중복 확인
                const duplicateByID = prev.some(m => m.id === message.id);
                
                // 내용과 발신자로 중복 확인 (타임스탬프 근접성 고려)
                const duplicateByContent = prev.some(m => 
                  m.content === message.content && 
                  m.sender.id === message.sender.id &&
                  Math.abs((new Date(m.timestamp).getTime() - new Date(message.timestamp).getTime())) < 3000
                );
                
                if (duplicateByID || duplicateByContent) {
                  console.log('[팀 채팅] 중복 메시지 무시:', message.id);
                  return prev;
                }
                
                console.log('[팀 채팅] 새 메시지 추가:', message.id);
                return [...prev, message];
              });
            }
          })
          chatBroadcastRegistered = true
          console.log('채팅 브로드캐스트 리스너 등록 완료')
        }
        
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
        
        // 추가: fetchRoutes 실행 후에 빈 keepPlaces 배열 초기화
        setKeepPlaces([]);
        
        setLoading(false)
      } catch (err: any) {
        console.error('라우트 페이지 초기화 오류:', err)
        setError(err.message || '페이지를 불러오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
    
    return () => {
      // 정리 함수 - 방에서 퇴장할 때 모든 리소스 정리
      console.log(`방 ${roomId}에서 퇴장 - 모든 리소스 정리`)
      leaveRoomRealtime(roomId)
      
      // 멤버 구독 해제
      try {
        supabase.channel(`room-members:${roomId}`).unsubscribe()
      } catch (err) {
        console.error('멤버 채널 구독 해제 오류:', err)
      }
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
        const { data: generatedRoutes, error: generationError } = await generateRoutes(roomId);
        
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
          is_anonymous,
          joined_at,
          user:user_id (textid, email, nickname, avatar_url)
        `)
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true }) // 참여 시간순으로 정렬
      
      if (membersError) throw membersError
      
      if (!membersData || membersData.length === 0) {
        console.log('방 멤버가 없습니다.');
        // 빈 배열 설정 (더미 데이터 제거)
        setMembers([]);
        // setAllMembersReady(false);
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
          memberNickname = userObj.nickname || userObj.email?.split('@')[0] || '사용자';
        }
        
        return {
          textid: member.textid,
          user_id: member.user_id || `anonymous-${member.textid}`,
          nickname: memberNickname,
          email: userObj?.email,
          is_friend: false, // 기본값, 친구 기능 구현 시 업데이트
          joined_at: member.joined_at
        }
      });
      
      setMembers(processedMembers);
      
    } catch (err: any) {
      console.error('멤버 정보 가져오기 오류:', err)
      // 오류 발생 시에도 UI가 깨지지 않도록 빈 배열 설정
      setMembers([]);
      // setAllMembersReady(false);
    }
  }

  // 장소 투표 정보 가져오기
  const fetchPlaceVotes = async () => {
    try {
      const { data, error } = await getPlaceVotes(roomId);
      
      if (error) throw error;
      
      if (data) {
        setPlaceVotes(data);
      }
    } catch (err: any) {
      console.error('장소 투표 정보 가져오기 오류:', err);
    }
  };

  // 장소별 투표 처리 함수
  const handlePlaceVote = async (placeId: string, voteType: 'up' | 'down') => {
    if (!currentUser && !anonymousInfo) {
      setError('투표하려면 로그인이 필요합니다.');
      return;
    }
    
    const userId = currentUser?.id || anonymousInfo?.id;
    if (!userId) return;
    
    try {
      // 'up'을 'like'로, 'down'을 'dislike'로 변환
      const convertedVoteType = voteType === 'up' ? 'like' : 'dislike';
      
      // 이미 투표한 경우 확인
      const currentVote = placeVotes[placeId]?.userVotes?.[userId];
      let finalVoteType: 'like' | 'dislike' | null = convertedVoteType;
      
      // 같은 유형으로 다시 투표하면 투표 취소
      if (currentVote === convertedVoteType) {
        finalVoteType = null;
      }
      
      // 로컬 상태 업데이트
      setPlaceVotes(prev => {
        const newPlaceVotes = { ...prev };
        
        // 해당 장소에 대한 투표 정보가 없으면 초기화
        if (!newPlaceVotes[placeId]) {
          newPlaceVotes[placeId] = {
            likes: 0,
            dislikes: 0,
            userVotes: {}
          };
        }
        
        // 이전 투표 카운트 조정
        if (currentVote === 'like') {
          newPlaceVotes[placeId].likes = Math.max(0, newPlaceVotes[placeId].likes - 1);
        } else if (currentVote === 'dislike') {
          newPlaceVotes[placeId].dislikes = Math.max(0, newPlaceVotes[placeId].dislikes - 1);
        }
        
        // 새 투표 적용
        if (finalVoteType === 'like') {
          newPlaceVotes[placeId].likes += 1;
          newPlaceVotes[placeId].userVotes[userId] = 'like';
        } else if (finalVoteType === 'dislike') {
          newPlaceVotes[placeId].dislikes += 1;
          newPlaceVotes[placeId].userVotes[userId] = 'dislike';
        } else if (finalVoteType === null) {
          // 투표 취소
          delete newPlaceVotes[placeId].userVotes[userId];
        }
        
        return newPlaceVotes;
      });
      
      // 투표 정보 서버에 저장 (client.ts에서 자동으로 UUID 형식 처리)
      const { success, error } = await voteForPlace(roomId, placeId, userId, finalVoteType);
      
      if (!success || error) {
        throw error || new Error('투표 처리 중 오류가 발생했습니다.');
      }
      
      // Realtime으로 다른 사용자에게 투표 알림
      broadcastVote(roomId, placeId, userId, finalVoteType);
      
    } catch (err: any) {
      console.error('장소 투표 오류:', err);
      setError(err.message || '투표 처리 중 오류가 발생했습니다.');
    }
  };

  // 장소 순서 변경 처리 함수
  const handleReorderPlaces = (reorderedPlaces: any[]) => {
    if (!routes.length) return;
    
    // 순서가 변경된 장소 목록으로 routes를 업데이트
    setRoutes(prev => {
      const updatedRoutes = [...prev];
      updatedRoutes[0] = {
        ...updatedRoutes[0],
        route_data: {
          ...updatedRoutes[0].route_data,
          places: reorderedPlaces
        }
      };
      return updatedRoutes;
    });
  }

  // 장소를 선택된 동선에서 제거하고 KEEP 목록으로 이동
  const moveToKeep = (placeToMove: any) => {
    if (!routes.length) return;
    
    // 1. 선택된 동선에서 해당 장소 제거
    setRoutes(prev => {
      const updatedRoutes = [...prev];
      updatedRoutes[0] = {
        ...updatedRoutes[0],
        route_data: {
          ...updatedRoutes[0].route_data,
          places: updatedRoutes[0].route_data.places.filter(
            place => place.textid !== placeToMove.textid
          )
        }
      };
      return updatedRoutes;
    });
    
    // 2. 장소 KEEP 목록에 추가 (중복 방지 로직 포함)
    setKeepPlaces(prev => {
      // 이미 존재하는지 확인
      const exists = prev.some(place => place.textid === placeToMove.textid);
      if (exists) return prev;
      
      // 존재하지 않으면 추가
      return [...prev, placeToMove];
    });
  };

  // KEEP 목록에서 선택된 동선으로 장소 복원
  const moveToRoute = (placeToMove: any) => {
    if (!routes.length) return;
    
    // 1. KEEP 목록에서 제거
    setKeepPlaces(prev => 
      prev.filter(place => place.textid !== placeToMove.textid)
    );
    
    // 2. 선택된 동선에 추가 (중복 방지)
    setRoutes(prev => {
      const updatedRoutes = [...prev];
      
      // 이미 동선에 있는지 확인
      const exists = updatedRoutes[0].route_data.places.some(
        place => place.textid === placeToMove.textid
      );
      
      if (!exists) {
        updatedRoutes[0] = {
          ...updatedRoutes[0],
          route_data: {
            ...updatedRoutes[0].route_data,
            places: [...updatedRoutes[0].route_data.places, placeToMove]
          }
        };
      }
      
      return updatedRoutes;
    });
  };

  // 경로 선택 처리
  const handleSelectRoute = async (routeId: string) => {
    try {
      if (!isOwner) {
        setError('여행 경로는 방장만 선택할 수 있습니다')
        return
      }
      
      // 로컬 상태 업데이트
      setRoutes(prev => prev.map(route => ({
        ...route,
        is_selected: route.textid === routeId
      })))
      
      // 선택된 경로 ID 업데이트
      setSelectedRouteId(routeId)
      
      // 데이터베이스 업데이트
      const { error } = await supabase
        .from('routes')
        .update({ is_selected: true })
        .eq('textid', routeId)
      
      if (error) throw error
      
      // 다른 경로들은 선택 해제
      const { error: unselectError } = await supabase
        .from('routes')
        .update({ is_selected: false })
        .eq('room_id', roomId)
        .neq('textid', routeId)
      
      if (unselectError) throw unselectError
      
      // Realtime으로 다른 사용자에게 알림
      broadcastRouteSelection(roomId, routeId)
      
      // 선택 완료 메시지 표시
      toast.success('여행 경로가 선택되었습니다')
      
      // 경로 결과 페이지로 이동
      router.push(`/rooms/${roomId}/result`)
    } catch (err: any) {
      console.error('경로 선택 오류:', err)
      setError(err.message || '경로를 선택하는 중 오류가 발생했습니다')
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

  // 버튼에서 사용할 장소별 투표 상태 확인 함수
  const getPlaceVoteStatus = (placeId: string) => {
    const userId = currentUser?.id || anonymousInfo?.id;
    if (!userId || !placeVotes[placeId]) {
      return {
        likes: 0,
        dislikes: 0,
        userVote: null
      };
    }
    
    return {
      likes: placeVotes[placeId].likes || 0,
      dislikes: placeVotes[placeId].dislikes || 0,
      userVote: placeVotes[placeId].userVotes?.[userId] || null
    };
  };

  // 장소의 투표 수 가져오기 (기존 함수 대체)
  const getVoteCount = (place: any, type: 'like' | 'dislike') => {
    const placeId = place.textid;
    const voteStatus = getPlaceVoteStatus(placeId);
    return type === 'like' ? voteStatus.likes : voteStatus.dislikes;
  };

  // 사용자의 투표 상태 가져오기 (기존 함수 대체)
  const getUserVote = (place: any) => {
    const placeId = place.textid;
    const voteStatus = getPlaceVoteStatus(placeId);
    return voteStatus.userVote;
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
    if (!content.trim() || sendingTeamMessage) return;
    
    try {
      setSendingTeamMessage(true);

      let senderId: string;
      let senderName: string;
      
      if (isAnonymous && anonymousInfo) {
        // 익명 사용자인 경우
        senderId = `anonymous_${anonymousInfo.member_id}`;
        senderName = anonymousInfo.nickname;
      } else if (currentUser) {
        // 로그인된 사용자인 경우
        senderId = currentUser.id;
        senderName = currentUser.email?.split('@')[0] || '사용자';
      } else {
        throw new Error('메시지를 보낼 수 없습니다');
      }

      // 새 메시지 객체 생성 (임시 ID 사용)
      const tempId = `temp-${Date.now()}`;
      const newMessage: Message = {
        id: tempId,
        content,
        sender: {
          id: senderId,
          name: senderName,
          avatar: currentUser?.user_metadata?.avatar_url
        },
        timestamp: new Date()
      };
      
      // UI 즉시 업데이트를 위해 메시지 추가
      setTeamMessages(prev => [...prev, newMessage]);
      
      // 실제 메시지 저장
      const { data, error } = await sendChatMessage(roomId, senderId, content);
      
      if (error) throw error;
      
      // DB에 저장된 메시지 ID 가져오기
      const actualMessageId = data && data[0]?.textid ? data[0].textid : tempId;
      
      console.log('[브로드캐스트] 팀 채팅 메시지 전송 시작:', {
        actualMessageId,
        tempId,
        content: content.substring(0, 20) + (content.length > 20 ? '...' : '')
      });
      
      // 다른 사용자에게 메시지 브로드캐스트
      if (data) {
        // 실시간 브로드캐스트를 사용하여 즉각적인 메시지 전송
        await broadcastChatMessage(roomId, {
          id: actualMessageId,
          content: content,
          sender: {
            id: senderId,
            name: senderName,
            avatar: currentUser?.user_metadata?.avatar_url
          },
          timestamp: new Date(),
          isAI: false,
          isAIChat: true
        });
        console.log('[브로드캐스트] 팀 채팅 메시지 브로드캐스트 완료:', actualMessageId);
      }
    } catch (err: any) {
      console.error('메시지 전송 오류:', err);
    } finally {
      setSendingTeamMessage(false);
    }
  };

  // AI 채팅 메시지 전송 함수
  const handleSendAIMessage = async (content: string, customMessage?: Message) => {
    if (!currentUser && !isAnonymous) return;
    
    setSendingAIMessage(true);
    
    try {
      // 만약 커스텀 메시지가 제공되었다면 해당 메시지를 사용
      if (customMessage) {
        setAiMessages(prev => [...prev, customMessage]);
        // 실제 메시지 저장은 생략 (이미 API 응답에서 처리됨)
      } else {
        // 현재 사용자의 정보 가져오기
        let senderId: string;
        let senderName: string;
        
        if (isAnonymous && anonymousInfo) {
          // 익명 사용자인 경우
          senderId = `anonymous_${anonymousInfo.member_id}`;
          senderName = anonymousInfo.nickname;
        } else if (currentUser) {
          // 로그인된 사용자인 경우
          senderId = currentUser.id;
          
          // 닉네임 가져오기 (멤버 목록에서 찾기)
          const currentMember = members.find(member => member.user_id === currentUser.id);
          senderName = currentMember?.nickname || 
                       currentUser.user_metadata?.nickname || 
                       currentUser.email?.split('@')[0] || 
                       '사용자';
        } else {
          throw new Error('메시지를 보낼 수 없습니다');
        }
        
        // 사용자 메시지 객체 생성 (임시 ID 사용)
        const tempId = `temp-${Date.now()}`;
        const userMessage: Message = {
          id: tempId,
          content,
          sender: {
            id: senderId,
            name: senderName,
            avatar: currentUser?.user_metadata?.avatar_url
          },
          timestamp: new Date()
        };
        
        // UI 즉시 업데이트를 위해 사용자 메시지 추가
        setAiMessages(prev => [...prev, userMessage]);
        
        // 사용자 메시지 저장
        const { data, error } = await sendChatMessage(roomId, senderId, content, true);
        
        if (error) throw error;
        
        // DB에 저장된 메시지 ID 가져오기
        const actualMessageId = data && data[0]?.textid ? data[0].textid : tempId;
        
        console.log('[브로드캐스트] AI 채팅 메시지 전송 시작:', {
          actualMessageId,
          tempId,
          content: content.substring(0, 20) + (content.length > 20 ? '...' : '')
        });
        
        // 다른 사용자에게 메시지 브로드캐스트
        if (data) {
          // 실시간 브로드캐스트를 사용하여 즉각적인 메시지 전송
          await broadcastChatMessage(roomId, {
            id: actualMessageId,
            content: content,
            sender: {
              id: senderId,
              name: senderName,
              avatar: currentUser?.user_metadata?.avatar_url
            },
            timestamp: new Date(),
            isAI: false,
            isAIChat: true
          });
          console.log('[브로드캐스트] AI 채팅 메시지 브로드캐스트 완료:', actualMessageId);
        }
        
        // AI 응답 생성 (customMessage가 없을 때만)
        const { data: aiResponse, error: aiError } = await generateAIResponse(roomId, content);
        
        if (aiError) throw aiError;
      }
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

  // 중심 좌표 계산 함수
  const calculateCentroid = (coordinates: Array<{lat: number, lng: number}>) => {
    if (!coordinates || coordinates.length === 0) {
      // 기본값으로 서울시청 좌표 반환
      return { lat: 37.5665, lng: 126.9780 };
    }
    
    const validCoords = coordinates.filter(coord => 
      typeof coord.lat === 'number' && !isNaN(coord.lat) &&
      typeof coord.lng === 'number' && !isNaN(coord.lng)
    );
    
    if (validCoords.length === 0) {
      return { lat: 37.5665, lng: 126.9780 };
    }
    
    const sumLat = validCoords.reduce((sum, coord) => sum + coord.lat, 0);
    const sumLng = validCoords.reduce((sum, coord) => sum + coord.lng, 0);
    
    return { 
      lat: sumLat / validCoords.length, 
      lng: sumLng / validCoords.length 
    };
  };

  // 추천 장소 처리 함수 수정
  const handleRecommendedLocations = (locations: any[], center: {lat: number, lng: number} | null = null) => {
    console.log('handleRecommendedLocations 호출됨:', locations);
    
    // 추천 장소를 추천 탭에 표시하기 위해 상태 업데이트
    const formattedPlaces = locations.map((loc, index) => {
      // UUID 생성 (룸ID와 타임스탬프 기반의 결정론적 UUID)
      const now = Date.now();
      const uuidString = `${params.roomId}-rec-${now}-${index}`;
      
      // 해시 기반 간단한 UUID 생성 로직
      const generateSimpleUUID = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash |= 0; // 32비트 정수로 변환
        }
        
        // 기본 UUID 템플릿
        const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
        let uuid = '';
        
        // 결정론적 방식으로 UUID 생성
        for (let i = 0; i < template.length; i++) {
          if (template[i] === 'x') {
            // 해시의 다음 비트 4개 사용
            const r = (hash >> ((i % 8) * 4)) & 0xf;
            uuid += r.toString(16);
          } else if (template[i] === 'y') {
            // UUID v4 형식에 맞게 8-11 사이 값 사용 (8, 9, a, b)
            const r = 8 + (hash & 0x3);
            uuid += r.toString(16);
          } else {
            uuid += template[i];
          }
        }
        
        return uuid;
      };
      
      // 디버깅용 ID 토큰 (원래 place-rec-timestamp-index 방식)
      const debugId = `place-rec-${now}-${index}`;
      
      // 실제 UUID 생성
      const placeUUID = generateSimpleUUID(uuidString);
      
      return {
        textid: placeUUID, // UUID 형식 사용
        debug_id: debugId, // 디버깅용 ID (UI에 표시하지 않음)
        name: loc.name,
        description: loc.description || '',
        category: loc.category || '관광지',
        location: {
          lat: loc.coordinates.lat,
          lng: loc.coordinates.lng
        },
        address: loc.address || '주소 정보 없음',
        image_url: '',
        timestamp: now // 추천 요청 타임스탬프 추가
      };
    });
    
    // 새로운 추천 요청일 경우 이전 추천 목록을 대체하고, 새 목록만 표시
    // 기존 장소와 새 장소 병합 대신 새 장소만 설정
    setRecommendedPlaces(formattedPlaces);
    
    // 추천된 장소에 대한 마커 정보 생성 (다른 색상으로 표시)
    const markerData = formattedPlaces.map((place) => ({
      lat: place.location.lat,
      lng: place.location.lng,
      title: place.name,
      category: 'recommendation', // 다른 색상의 마커를 위한 특별 카테고리
      description: place.description
    }));
    
    setRecommendedMarkers(markerData);
    
    // 사용자에게 피드백 메시지 표시
    const feedbackMsg: Message = {
      id: `ai-feedback-${Date.now()}`,
      content: `${locations.length}개의 장소를 추천했습니다. "연관 추천" 탭에서 확인하고 원하는 장소를 동선에 추가하세요.`,
      sender: {
        id: 'ai',
        name: 'AI 비서'
      },
      timestamp: new Date(),
      isAI: true,
      coordinates: locations.map(loc => ({
        lat: loc.coordinates.lat,
        lng: loc.coordinates.lng
      }))
    };
    
    setAiMessages(prev => [...prev, feedbackMsg]);
    
    // 지도 위치 조정 - zustand 상태 저장소 사용
    const mapCenter = center || calculateCentroid(locations.map(loc => loc.coordinates));
    mapStore.setCenter(mapCenter);
    mapStore.setLevel(5); // 적절한 줌 레벨 설정
    
    // 추천 탭으로 자동 전환
    setActiveTab("recommendations");
  };

  // 추가: 추천 장소를 동선에 추가하는 함수
  const addRecommendedPlaceToRoute = (place: any) => {
    if (!routes.length) {
      // 경로가 없는 경우 새 경로 생성
      const newRoute: Route = {
        textid: `route-${Date.now()}`,
        route_data: {
          places: [place],
          travel_time: 180,
          total_cost: 30000
        },
        votes: {},
        is_selected: false
      };
      
      setRoutes([newRoute]);
    } else {
      // 기존 경로가 있는 경우, 장소 추가 (중복 방지)
      const existingPlaceNames = routes[0].route_data.places.map(p => p.name);
      
      if (!existingPlaceNames.includes(place.name)) {
        setRoutes(prev => {
          const updated = [...prev];
          updated[0] = {
            ...updated[0],
            route_data: {
              ...updated[0].route_data,
              places: [...updated[0].route_data.places, place]
            }
          };
          return updated;
        });
      }
    }
    
    // 성공 메시지
    const successMsg: Message = {
      id: `ai-success-${Date.now()}`,
      content: `"${place.name}"이(가) 동선에 추가되었습니다.`,
      sender: {
        id: 'ai',
        name: 'AI 비서'
      },
      timestamp: new Date(),
      isAI: true
    };
    
    setAiMessages(prev => [...prev, successMsg]);
  };

  // 추가: 추천 장소를 KEEP 목록에 추가하는 함수
  const addRecommendedPlaceToKeep = (place: any) => {
    // 이미 존재하는지 확인
    const exists = keepPlaces.some(p => p.name === place.name);
    
    if (!exists) {
      setKeepPlaces(prev => [...prev, place]);
      
      // 성공 메시지
      const successMsg: Message = {
        id: `ai-keep-${Date.now()}`,
        content: `"${place.name}"이(가) KEEP 목록에 추가되었습니다.`,
        sender: {
          id: 'ai',
          name: 'AI 비서'
        },
        timestamp: new Date(),
        isAI: true
      };
      
      setAiMessages(prev => [...prev, successMsg]);
    }
  };

  // 채팅 메시지로부터 온 위치 표시 처리
  const handleChatLocationMarkers = (locations: any[], center: {lat: number, lng: number} | null = null) => {
    // 채팅 메시지로부터 온 마커 데이터 생성
    const markerData = locations.map((loc, index) => ({
      lat: loc.coordinates.lat,
      lng: loc.coordinates.lng,
      title: loc.name || "채팅에서 표시된 위치",
      category: 'chat_location', // 채팅 메시지에서 온 위치를 구분하기 위한 특별 카테고리
      description: loc.description || ""
    }));
    
    // 임시 마커로 설정 (일정 시간 후 제거할 수도 있음)
    setRecommendedMarkers(markerData);
    
    // 지도 위치 조정
    if (window.kakao && window.kakao.maps) {
      // 중심점이 제공되면 해당 좌표로, 아니면 위치들의 중심점 계산
      const mapCenter = center || calculateCentroid(locations.map(loc => loc.coordinates));
      
      // 지도 객체가 전역으로 관리되고 있다면 중심점 이동
      const mapInstance = document.getElementById('map')?.getAttribute('data-map-instance');
      if (mapInstance) {
        const map = window[mapInstance as keyof typeof window];
        if (map && map.setCenter) {
          map.setCenter(new window.kakao.maps.LatLng(mapCenter.lat, mapCenter.lng));
          map.setLevel(5); // 적절한 줌 레벨 설정
        }
      }
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
          <div className="w-[400px] border-r border-gray-200 overflow-hidden">
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
                        {/* {member.status === 'ready' ? (
                          <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full mr-2">완료</span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-full mr-2">진행 중</span>
                        )} */}
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
            
            {/* 선택한 동선 탭 */}
            {activeTab === "routes" && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-bold text-lg">모두가 선택한 동선</h2>
                  
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
                      {/* 첫 번째 선택한 동선만 표시 */}
                      <div className="mb-4">
                        <div className="px-4 py-2 bg-gray-50 font-medium flex justify-between items-center">
                          <span>동선 (드래그하여 순서 변경)</span>
                          {/* 동선 전체 투표 버튼 제거 */}
                        </div>
                        
                        <Reorder.Group 
                          axis="y" 
                          values={routes[0]?.route_data.places || []} 
                          onReorder={handleReorderPlaces}
                        >
                          {routes[0].route_data.places.map((place, index) => (
                            <Reorder.Item 
                              key={place.textid} 
                              value={place} 
                              className="p-4 border-b border-gray-100 bg-white cursor-move"
                            >
                              <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center">
                                  <GripVertical className="h-4 w-4 mr-2 text-gray-400" />
                                  <h3 className="font-medium">{index + 1}. {place.name}</h3>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-xs bg-gray-100 px-2 py-1 rounded-full mr-2">{place.category}</span>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-gray-400 hover:text-red-500"
                                    onClick={(e) => {
                                      e.stopPropagation(); // 이벤트 전파 방지
                                      moveToKeep(place);
                                    }}
                                  >
                                    <ArrowDownCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2">{place.description}</p>
                              <p className="text-xs text-gray-500 mt-1">{place.address}</p>
                              <div className="flex items-center mt-2 space-x-2">
                                <Button 
                                  variant={getUserVote(place) === 'like' ? "default" : "outline"}
                                  size="sm" 
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handlePlaceVote(place.textid, 'up')}
                                >
                                  <ThumbsUp className="h-3 w-3 mr-1" />
                                  찬성 {getVoteCount(place, 'like')}
                                </Button>
                                <Button 
                                  variant={getUserVote(place) === 'dislike' ? "default" : "outline"}
                                  size="sm" 
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handlePlaceVote(place.textid, 'down')}
                                >
                                  <ThumbsDown className="h-3 w-3 mr-1" />
                                  반대 {getVoteCount(place, 'dislike')}
                                </Button>
                              </div>
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>
                      </div>

                      {/* 장소 KEEP 섹션 */}
                      <div className="p-4 border-t border-gray-200">
                        <h3 className="font-medium text-sm text-gray-500 mb-2">장소 KEEP</h3>
                        <div className="space-y-3">
                          {keepPlaces.length > 0 ? (
                            keepPlaces.map((place, index) => (
                              <div key={place.textid} className="p-3 border border-gray-100 rounded-md bg-white">
                                <div className="flex justify-between items-center mb-1">
                                  <h3 className="font-medium text-sm">{place.name}</h3>
                                  <div className="flex items-center">
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full mr-2">{place.category}</span>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-6 w-6 text-gray-400 hover:text-blue-500"
                                      onClick={() => moveToRoute(place)}
                                    >
                                      <ArrowLeft className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-500">{place.address}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-center text-gray-400">
                              동선에서 내려보낸 장소가 여기에 표시됩니다
                            </p>
                          )}
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
                
                {/* 변경: 추천 장소 목록 표시 */}
                <div className="flex-1 overflow-y-auto">
                  {recommendedPlaces.length > 0 ? (
                    <div className="p-4 space-y-4">
                      <h3 className="font-medium text-sm text-gray-500">추천 장소</h3>
                      {recommendedPlaces.map((place) => (
                        <div key={place.textid} className="p-4 border border-gray-200 rounded-md bg-white">
                          <div className="flex justify-between items-center mb-2">
                            <h3 className="font-medium">{place.name}</h3>
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{place.category}</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{place.description}</p>
                          <p className="text-xs text-gray-500 mb-3">{place.address}</p>
                          <div className="flex space-x-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => addRecommendedPlaceToKeep(place)}
                              className="text-xs"
                            >
                              장소 KEEP에 추가
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => addRecommendedPlaceToRoute(place)}
                              className="text-xs"
                            >
                              동선에 추가
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-t border-gray-200 p-4">
                      <h3 className="font-medium text-sm text-gray-500 mb-2">추천 장소</h3>
                      <div className="text-center py-8 text-gray-500">
                        <p>AI 어시스턴트에게 장소 추천을 요청해보세요.</p>
                        <p className="text-sm mt-2">예: "서울에서 가볼만한 곳 추천해줘"</p>
                      </div>
                    </div>
                  )}
                  
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
              </div>
            )}
          </div>
        </div>
        
        {/* 중앙 - 지도 영역 */}
        <div className="flex-1 relative min-h-full">
          <div className="absolute inset-0">
            <KakaoMap
              width="100%"
              height="calc(100vh - 182px)"
              markers={[
                ...(routes[0]?.route_data.places.map((place, index) => ({
                  lat: place.location.lat,
                  lng: place.location.lng,
                  title: place.name,
                  order: index
                })) || []),
                ...recommendedMarkers // 추천된 마커 추가
              ]}
              polyline={routes[0]?.route_data.places.map(place => ({
                lat: place.location.lat,
                lng: place.location.lng
              })) || []}
              polylineColor="#3B82F6"
              useStaticMap={false}
              mapTypeId="ROADMAP"
            />
          </div>
          
          {/* 팀 채팅 카드 - 조건부 렌더링으로 변경 */}
          {showTeamChat && (
            <div className="absolute top-4 right-4 w-[350px] flex flex-col gap-4 z-[50]">
              <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
                <div className="p-4 border-b border-gray-200 bg-white">
                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-lg flex items-center">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      팀 채팅
                    </h2>
                    <Button variant="ghost" size="icon" onClick={() => setShowTeamChat(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="h-[500px]">
                  <ChatContainer
                    messages={teamMessages}
                    currentUser={{
                      id: currentUser?.id || '',
                      name: currentUser?.user_metadata?.nickname || currentUser?.email || '사용자'
                    }}
                    onSendMessage={handleSendTeamMessage}
                    onRecommendLocations={handleChatLocationMarkers}
                    className="h-full"
                    loading={sendingTeamMessage}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* 하단 버튼 영역 */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-white bg-opacity-90 border-t border-gray-200 flex justify-between z-[50] shadow-md">
            <div className="flex gap-2">
              {/* AI 채팅 버튼 */}
              <Button 
                variant="outline"
                size="lg" 
                className="rounded-full bg-white shadow-md px-6"
                onClick={() => setShowAIChat(!showAIChat)}
              >
                <Bot className="h-7 w-7 mr-2" />
              </Button>
              
              {/* 팀 채팅 버튼 추가 */}
              <Button 
                variant="outline"
                size="lg" 
                className="rounded-full bg-white shadow-md px-6"
                onClick={() => setShowTeamChat(!showTeamChat)}
              >
                <MessageSquare className="h-7 w-7 mr-2" />
              </Button>
            </div>
            
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
              <div className="p-4 border-b border-gray-200 bg-white">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-lg flex items-center">
                    <Bot className="h-4 w-4 mr-2" />
                    AI 여행 어시스턴트
                  </h2>
                  <Button variant="ghost" size="icon" onClick={() => setShowAIChat(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="h-[calc(100%-60px)]">
                <ChatContainer
                  messages={aiMessages}
                  currentUser={{
                    id: currentUser?.id || '',
                    name: currentUser?.user_metadata?.nickname || currentUser?.email || '사용자'
                  }}
                  onSendMessage={handleSendAIMessage}
                  onRecommendLocations={handleRecommendedLocations}
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