'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, saveChatMessage, getChatMessages, getAIMessagesForUser, saveMessageMetadata } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import KakaoMap from '@/components/KakaoMap'
import { ArrowLeft, Send, MapPin, Search, Loader2 } from 'lucide-react'
import { joinRoomRealtime, leaveRoomRealtime, subscribeToChatMessages, subscribeToChatBroadcast, broadcastChatMessage } from '@/lib/supabase/realtime'

// 채팅 메시지 타입 정의
type ChatMessage = {
  textid: string;
  content: string;
  room_id?: string;
  user_id?: string;
  is_ai: boolean;
  is_ai_chat: boolean;
  created_at: string;
  user?: {
    textid?: string;
    nickname?: string;
    avatar_url?: string;
    email?: string;
  };
}

// 장소 타입 정의
type Place = {
  textid: string;
  name: string;
  category: string;
  address: string;
  description: string;
  location: {
    lat: number;
    lng: number;
  };
}

type User = {
  textid: string;
  email: string;
  nickname?: string;
  avatar_url?: string;
}

export default function AssistantPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [user, setUser] = useState<any>(null)
  const [roomTitle, setRoomTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [mapCenter, setMapCenter] = useState({ lat: 37.5665, lng: 126.9780 })
  const [district, setDistrict] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { roomId } = params
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function init() {
      try {
        setLoading(true)
        
        // 현재 사용자 확인
        const { user: currentUser, error: userError } = await getCurrentUser()
        
        if (userError || !currentUser) {
          router.push('/')
          return
        }
        
        setUser(currentUser)
        
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
        
        setRoomTitle(roomData.title)
        setDistrict(roomData.district || '서울')
        
        // 메시지 가져오기
        await fetchMessages()
        
        // Supabase Realtime 연결 - 한 번만 초기화
        const channel = joinRoomRealtime(roomId)
        console.log('Realtime 채널 초기화 완료:', roomId)
        
        // 중복 구독 방지를 위한 플래그
        let chatMessagesRegistered = false
        let chatBroadcastRegistered = false
        
        // 채팅 메시지 구독
        if (!chatMessagesRegistered) {
          subscribeToChatMessages(roomId, (message) => {
            // 메시지 유효성 검사
            if (!message || !message.content || !message.sender) {
              console.error('유효하지 않은 메시지 객체:', message);
              return;
            }
            
            // 이 사용자의 AI 채팅 메시지만 처리
            if (message.isAIChat) {
              // 현재 사용자의 메시지이거나 현재 사용자에게 보낸 AI 응답인 경우만 표시
              if (message.sender.id === currentUser.id || 
                 (message.isAI && message.sender.id === 'ai')) {
                console.log('AI 채팅 메시지 수신:', message.id);
                
                setMessages(prev => {
                  // 이미 동일한 ID의 메시지가 있는지 확인
                  const messageExists = prev.some(m => m.textid === message.id);
                  if (messageExists) return prev;
                  
                  // 새 메시지 추가
                  const newMessage: ChatMessage = {
                    textid: message.id,
                    content: message.content,
                    user_id: message.sender.id,
                    is_ai: message.isAI,
                    is_ai_chat: true,
                    created_at: new Date(message.timestamp).toISOString(),
                    user: {
                      textid: message.sender.id,
                      nickname: message.sender.name,
                      avatar_url: message.sender.avatar
                    }
                  };
                  
                  return [...prev, newMessage];
                });
              }
            }
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
            
            // 자신이 보낸 메시지는 무시 (이미 UI에 표시됨)
            if (message.sender.id === currentUser.id) {
              console.log('자신이 보낸 메시지 무시:', message.id);
              return;
            }
            
            // AI 채팅 메시지가 아닌 경우 무시 (팀 채팅은 별도 페이지에서 처리)
            if (!message.isAI || !message.isAIChat) {
              console.log('AI 채팅이 아닌 메시지 무시');
              return;
            }
            
            // 다른 사용자의 AI 채팅은 무시 (개인 채팅은 본인만 볼 수 있음)
            // AI 메시지가 현재 사용자의 이전 질문에 대한 응답인지 확인하는 로직이 필요
            console.log('다른 사용자 메시지 무시');
            return;
          })
          chatBroadcastRegistered = true
          console.log('채팅 브로드캐스트 리스너 등록 완료')
        }
        
        setLoading(false)
      } catch (err: any) {
        console.error('AI 채팅 페이지 초기화 오류:', err)
        setError(err.message || 'AI 채팅을 불러오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
    
    return () => {
      // 정리 함수 - 방에서 퇴장할 때 모든 리소스 정리
      console.log(`방 ${roomId}에서 퇴장 - 모든 리소스 정리`)
      leaveRoomRealtime(roomId)
      
      // 타이핑 타임아웃 정리
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [roomId, router])

  // 메시지가 추가될 때 스크롤 아래로 이동
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchMessages = async () => {
    try {
      if (!user?.id) return;
      
      // 새로운 방식: getAIMessagesForUser 함수 사용
      const { data, error } = await getAIMessagesForUser(roomId, user.id);
      
      if (error) throw error;
      
      if (data) {
        // 메시지 형식화
        const processedMessages = data.map((msg: any) => {
          return {
            textid: msg.textid,
            content: msg.content,
            is_ai: msg.is_ai,
            is_ai_chat: msg.is_ai_chat,
            user_id: msg.user_id,
            created_at: msg.created_at,
            user: msg.user_id ? {
              textid: msg.user_id,
              nickname: user?.user_metadata?.nickname || '사용자',
              avatar_url: user?.user_metadata?.avatar_url,
              email: user?.email
            } : {
              textid: 'ai',
              nickname: 'AI 비서',
            }
          };
        });
        
        setMessages(processedMessages);
      }
    } catch (err: any) {
      console.error('메시지 가져오기 오류:', err);
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || submitting) return
    
    setSubmitting(true)
    
    try {
      // 사용자 메시지 저장
      const { data: msgData } = await saveChatMessage(roomId, user?.id, input, false, true) // is_ai_chat을 true로 설정
      
      const messageId = msgData && msgData[0]?.textid ? msgData[0].textid : `temp-${Date.now()}`;
      
      // UI 업데이트
      setMessages(prev => [...prev, {
        textid: messageId,
        content: input,
        is_ai: false,
        is_ai_chat: true,
        user_id: user?.id,
        created_at: new Date().toISOString(),
        user: {
          nickname: user?.user_metadata?.nickname || '익명',
          email: user?.email
        }
      }])
      
      // 입력 초기화
      setInput('')
      
      // AI 응답을 위한 요청 (실제 환경에서는 AI API 호출)
      // 여기서는 더미 데이터 사용
      const userQuery = input.toLowerCase()
      
      // AI가 응답 중 표시
      setMessages(prev => [...prev, {
        textid: 'typing',
        content: '...',
        is_ai: true,
        is_ai_chat: true,
        created_at: new Date().toISOString()
      }])
      
      try {
        // 실시간 브로드캐스트를 사용하여 즉각적인 메시지 전송
        // isAIChat을 true로 설정하여 AI 채팅임을 명시
        broadcastChatMessage(roomId, {
          id: messageId,
          content: input,
          sender: {
            id: user?.id || 'anonymous',
            name: user?.user_metadata?.nickname || '사용자',
            avatar: user?.user_metadata?.avatar_url
          },
          timestamp: new Date(),
          isAI: false,
          isAIChat: true // <-- 이 부분이 중요: AI 채팅으로 명시
        });
        
        console.log('AI 채팅 메시지 브로드캐스트 완료')
      } catch (broadcastError) {
        console.error('메시지 브로드캐스트 오류:', broadcastError)
      }
      
      // 음식점 검색 쿼리인 경우
      if (userQuery.includes('맛집') || userQuery.includes('음식점') || userQuery.includes('식당')) {
        // 맛집 더미 데이터
        const restaurantPlaces: Place[] = [
          {
            textid: '1',
            name: '강남 맛집',
            category: 'restaurant',
            address: '서울 강남구 강남대로 123',
            description: '유명한 불고기 전문점입니다',
            location: { lat: 37.5021, lng: 127.0243 }
          },
          {
            textid: '2',
            name: '역삼 식당',
            category: 'restaurant',
            address: '서울 강남구 역삼로 45',
            description: '신선한 해산물 요리를 제공합니다',
            location: { lat: 37.5014, lng: 127.0373 }
          }
        ]
        
        handleRecommendedPlaces(restaurantPlaces)
        
        // AI 응답 메시지
        setTimeout(async () => {
          // 타이핑 메시지 제거
          setMessages(prev => prev.filter(msg => msg.textid !== 'typing'))
          
          const aiResponse = `${district}에서 추천 맛집을 찾아봤어요! '강남 맛집'과 '역삼 식당'은 현지인들도 자주 찾는 곳입니다. 지도에서 확인하실 수 있어요.`;
          
          // AI 메시지 저장 - 개인 채팅용으로 표시
          const { data: aiMsgData } = await saveChatMessage(roomId, null, aiResponse, true, true)
          
          // 새로운 방식: 메타데이터 저장으로 사용자와 AI 메시지 연결
          if (aiMsgData && aiMsgData[0]?.textid && user?.id) {
            await saveMessageMetadata(aiMsgData[0].textid, user.id, { conversation_id: messageId });
          }
        }, 1500)
      }
      // 카페 검색 쿼리인 경우
      else if (userQuery.includes('카페') || userQuery.includes('커피')) {
        // 카페 더미 데이터
        const cafePlaces: Place[] = [
          {
            textid: '3',
            name: '블루보틀 강남',
            category: 'cafe',
            address: '서울 강남구 테헤란로 129',
            description: '뉴욕에서 온 스페셜티 커피',
            location: { lat: 37.5042, lng: 127.0251 }
          },
          {
            textid: '4',
            name: '별다방 역삼점',
            category: 'cafe',
            address: '서울 강남구 역삼로 152',
            description: '편안한 분위기에서 휴식을 즐길 수 있는 카페',
            location: { lat: 37.5005, lng: 127.0368 }
          }
        ]
        
        handleRecommendedPlaces(cafePlaces)
        
        // AI 응답 메시지
        setTimeout(async () => {
          // 타이핑 메시지 제거
          setMessages(prev => prev.filter(msg => msg.textid !== 'typing'))
          
          const aiResponse = `${district}에 있는 카페를 찾아봤어요! '블루보틀 강남'과 '별다방 역삼점'이 인기 있습니다. 지도에서 위치를 확인하세요.`;
          
          // AI 메시지 저장 - 개인 채팅용으로 표시
          const { data: aiMsgData } = await saveChatMessage(roomId, null, aiResponse, true, true)
          
          // 새로운 방식: 메타데이터 저장으로 사용자와 AI 메시지 연결
          if (aiMsgData && aiMsgData[0]?.textid && user?.id) {
            await saveMessageMetadata(aiMsgData[0].textid, user.id, { conversation_id: messageId });
          }
        }, 1500)
      }
      // 관광지 검색 쿼리인 경우
      else if (userQuery.includes('관광') || userQuery.includes('명소') || userQuery.includes('볼거리')) {
        // 관광지 더미 데이터
        const attractionPlaces: Place[] = [
          {
            textid: '5',
            name: '코엑스 아쿠아리움',
            category: 'attraction',
            address: '서울 강남구 영동대로 513',
            description: '650여 종의 해양생물을 만날 수 있는 실내 아쿠아리움',
            location: { lat: 37.5128, lng: 127.0590 }
          },
          {
            textid: '6',
            name: '봉은사',
            category: 'attraction',
            address: '서울 강남구 봉은사로 531',
            description: '도심 속 고즈넉한 사찰',
            location: { lat: 37.5148, lng: 127.0610 }
          }
        ]
        
        handleRecommendedPlaces(attractionPlaces)
        
        // AI 응답 메시지
        setTimeout(async () => {
          // 타이핑 메시지 제거
          setMessages(prev => prev.filter(msg => msg.textid !== 'typing'))
          
          const aiResponse = `${district}의 명소를 알려드릴게요! '코엑스 아쿠아리움'과 '봉은사'는 인기 있는 관광지입니다. 지도에서 위치를 확인하세요.`;
          
          // AI 메시지 저장 - 개인 채팅용으로 표시
          const { data: aiMsgData } = await saveChatMessage(roomId, null, aiResponse, true, true)
          
          // 새로운 방식: 메타데이터 저장으로 사용자와 AI 메시지 연결
          if (aiMsgData && aiMsgData[0]?.textid && user?.id) {
            await saveMessageMetadata(aiMsgData[0].textid, user.id, { conversation_id: messageId });
          }
        }, 1500)
      }
      // 기타 질문인 경우
      else {
        setTimeout(async () => {
          // 타이핑 메시지 제거
          setMessages(prev => prev.filter(msg => msg.textid !== 'typing'))
          
          const aiResponse = `${input}에 대해 더 자세히 알려주시겠어요? 특정 장소나 음식점, 카페, 관광지 등을 찾고 계신다면 좀 더 구체적으로 말씀해주세요.`;
          
          // AI 메시지 저장 - 개인 채팅용으로 표시
          const { data: aiMsgData } = await saveChatMessage(roomId, null, aiResponse, true, true)
          
          // 새로운 방식: 메타데이터 저장으로 사용자와 AI 메시지 연결
          if (aiMsgData && aiMsgData[0]?.textid && user?.id) {
            await saveMessageMetadata(aiMsgData[0].textid, user.id, { conversation_id: messageId });
          }
        }, 1500)
      }
    } catch (err: any) {
      console.error('메시지 전송 오류:', err)
      setError(err.message || '메시지 전송 중 오류가 발생했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePlaceClick = (place: Place) => {
    // 선택한 장소로 지도 중심 이동
    setMapCenter(place.location)
  }

  // AI 추천 장소 상태 변경 함수
  const handleRecommendedPlaces = (recommendedPlaces: any[]) => {
    // 새로운 추천 요청시 이전 목록을 대체
    setPlaces(recommendedPlaces.map(place => ({
      textid: place.textid || `place-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: place.name,
      description: place.description || '',
      category: place.category || '관광지',
      address: place.address || '주소 정보 없음',
      location: place.location || place.coordinates || { lat: 37.5665, lng: 126.9780 }
    })));
  };

  // 현재 사용자 정보 설정 (AI 응답 수신자)
  const currentUser = user?.id ? {
    id: user.id,
    email: user.email || '',
    nickname: user?.user_metadata?.nickname || '익명'
  } : undefined;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      {/* 상단 헤더 */}
      <div className="border-b border-gray-200">
        <div className="flex items-center p-4">
          <Link href={`/rooms/${roomId}/routes`} className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">AI 어시스턴트</h1>
        </div>
      </div>
      
      {/* 메인 컨텐츠 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 h-[calc(100vh-64px)]">
        {/* 채팅 영역 */}
        <div className="lg:col-span-1 flex flex-col border-r border-gray-200">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, index) => (
              <div
                key={msg.textid === 'typing' ? `typing-${index}` : msg.textid}
                className={`flex ${msg.is_ai ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.is_ai
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {msg.textid === 'typing' ? (
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                    </div>
                  ) : (
                    <div className="text-sm">{msg.content}</div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          {/* 입력 영역 */}
          <div className="p-4 border-t border-gray-200">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <Input
                placeholder="장소나 음식점을 물어보세요"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={submitting}
              />
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
        
        {/* 지도 영역 */}
        <div className="lg:col-span-2 relative">
          <KakaoMap
            height="100%"
            center={mapCenter}
            markers={places.map(place => ({
              lat: place.location.lat,
              lng: place.location.lng,
              title: place.name,
              content: `<div style="padding:5px;font-size:12px;width:180px;">
                <strong>${place.name}</strong>
                <p style="margin:4px 0 0;font-size:11px;color:#666;">${place.address}</p>
                <p style="margin:4px 0;font-size:11px;">${place.description}</p>
              </div>`,
              category: place.category as any
            }))}
            useStaticMap={false}
            level={6}
            mapTypeId="ROADMAP"
          />
        </div>
      </div>
      
      {/* 장소 목록 (모바일에서 스와이프 업으로 표시) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-lg shadow-lg p-4 max-h-[40vh] overflow-y-auto">
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>
        <h3 className="font-bold mb-2">추천 장소</h3>
        
        {places.length === 0 ? (
          <p className="text-gray-500 text-sm">AI에게 장소를 물어보세요</p>
        ) : (
          <div className="space-y-3">
            {places.map(place => (
              <Card key={place.textid} className="p-3" onClick={() => handlePlaceClick(place)}>
                <div className="flex items-start">
                  <MapPin className="h-5 w-5 text-blue-500 mt-1 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium">{place.name}</h4>
                    <p className="text-xs text-gray-500">{place.address}</p>
                    <p className="text-xs text-gray-700 mt-1">{place.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {error && (
        <div className="fixed bottom-20 left-0 right-0 mx-auto w-max bg-red-50 text-red-500 text-sm px-4 py-2 rounded-md">
          {error}
        </div>
      )}
    </main>
  )
} 