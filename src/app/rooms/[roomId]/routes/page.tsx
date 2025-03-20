'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, UserPlus, Check, Users, MessageSquare, Bot } from 'lucide-react'
import { ChatContainer } from '@/components/ChatContainer'
import KakaoMap from '@/components/KakaoMap'
import { PlaceCard } from '@/components/PlaceCard'

type Member = {
  textid: string;
  user_id: string;
  nickname?: string;
  status: 'pending' | 'ready';
  email?: string;
  is_friend?: boolean;
}

type Place = {
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
}

type Message = {
  id: string;
  content: string;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
  timestamp: Date;
  isAI?: boolean;
}

type Room = {
  textid: string;
  title: string;
  owner_id: string;
}

export default function RoutesPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [teamMessages, setTeamMessages] = useState<Message[]>([])
  const [aiMessages, setAiMessages] = useState<Message[]>([])
  const [recommendedPlaces, setRecommendedPlaces] = useState<Place[]>([])
  const router = useRouter()
  const { roomId } = params

  // 더미 장소 데이터
  const dummyPlaces = [
    { textid: '1', name: '광장시장', category: '관광지', address: '서울 중구 종로 88', description: '서울의 대표적인 전통시장', location: { lat: 37.5701, lng: 126.9986 }, image_url: '' },
    { textid: '2', name: '광화문광장', category: '관광지', address: '서울 종로구 세종로 172', description: '서울의 중심 광장', location: { lat: 37.5759, lng: 126.9769 }, image_url: '' },
    { textid: '3', name: '국립극장', category: '문화시설', address: '서울 중구 장충단로 59', description: '한국의 대표적인 공연장', location: { lat: 37.5525, lng: 127.0073 }, image_url: '' },
    { textid: '4', name: '청계천', category: '자연', address: '서울 종로구 청계천로', description: '서울 도심을 가로지르는 하천', location: { lat: 37.5696, lng: 126.9784 }, image_url: '' },
    { textid: '5', name: '덕수궁', category: '역사', address: '서울 중구 세종대로 99', description: '조선시대의 궁궐', location: { lat: 37.5655, lng: 126.9751 }, image_url: '' },
  ];

  // 더미 멤버 데이터
  const dummyMembers = [
    { textid: '1', user_id: '1', nickname: '요요', status: 'ready' as const, email: 'yoyo@example.com', is_friend: true },
    { textid: '2', user_id: '2', nickname: '오늘도 즐거움', status: 'ready' as const, email: 'happy@example.com', is_friend: false },
    { textid: '3', user_id: '3', nickname: '다다', status: 'pending' as const, email: 'dada@example.com', is_friend: false },
    { textid: '4', user_id: '4', nickname: 'KKKKKdfsfsfsf', status: 'ready' as const, email: 'kkk@example.com', is_friend: true },
  ];

  // 더미 채팅 메시지
  const dummyTeamMessages = [
    {
      id: '1',
      content: '안녕하세요 모두!',
      sender: {
        id: '1',
        name: '요요',
      },
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      isAI: false
    },
    {
      id: '2',
      content: '여행 계획 세우는 중이에요~',
      sender: {
        id: '2',
        name: '오늘도 즐거움',
      },
      timestamp: new Date(Date.now() - 1000 * 60 * 20),
      isAI: false
    }
  ];

  // 더미 AI 메시지
  const dummyAiMessages = [
    {
      id: '1',
      content: '안녕하세요! 여행 계획을 도와드릴게요.',
      sender: {
        id: 'ai',
        name: 'AI 어시스턴트',
      },
      timestamp: new Date(Date.now() - 1000 * 60 * 15),
      isAI: true
    },
    {
      id: '2',
      content: '어떤 스타일의 여행을 원하시나요?',
      sender: {
        id: 'ai',
        name: 'AI 어시스턴트',
      },
      timestamp: new Date(Date.now() - 1000 * 60 * 14),
      isAI: true
    }
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
        
        // 먼저 더미 데이터로 UI 표시 (로딩 상태 제거)
        setRecommendedPlaces(dummyPlaces);
        setMembers(dummyMembers);
        setTeamMessages(dummyTeamMessages);
        setAiMessages(dummyAiMessages);
        setLoading(false);
        
        // 백그라운드로 실제 데이터 로드
        fetchMembers();
        fetchMessages();
        fetchRecommendedPlaces();
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다')
        
        // 오류 발생해도 더미 데이터로 UI 표시
        setRecommendedPlaces(dummyPlaces);
        setMembers(dummyMembers);
        setTeamMessages(dummyTeamMessages);
        setAiMessages(dummyAiMessages);
        setLoading(false);
      }
    }
    
    init()
  }, [roomId, router])

  const fetchMembers = async () => {
    try {
      const { data: membersData, error: membersError } = await supabase
        .from('room_members')
        .select(`
          textid, 
          user_id, 
          nickname, 
          status,
          user:user_id (textid, email, nickname, avatar_url)
        `)
        .eq('room_id', roomId)
      
      if (membersError) throw membersError
      
      if (membersData && membersData.length > 0) {
        const processedMembers = membersData.map(member => {
          const userObj = member.user as any;
          return {
            textid: member.textid,
            user_id: member.user_id,
            nickname: member.nickname || (userObj && userObj.nickname) || '익명',
            status: member.status || 'pending',
            email: userObj && userObj.email,
            is_friend: false
          }
        });
        
        setMembers(processedMembers);
      }
    } catch (err: any) {
      console.error('멤버 정보 가져오기 오류:', err)
    }
  }

  const fetchMessages = async () => {
    try {
      const { data: messagesData, error: messagesError } = await supabase
        .from('room_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
      
      if (messagesError) throw messagesError
      
      if (messagesData && messagesData.length > 0) {
        const processedMessages = messagesData.map(msg => ({
          id: msg.textid,
          content: msg.content,
          sender: {
            id: msg.user_id,
            name: members.find(m => m.user_id === msg.user_id)?.nickname || '익명',
            avatar: undefined
          },
          timestamp: new Date(msg.created_at),
          isAI: msg.is_ai || false
        }));
        
        setTeamMessages(processedMessages.filter(msg => !msg.isAI));
        setAiMessages(processedMessages.filter(msg => msg.isAI));
      }
    } catch (err: any) {
      console.error('메시지 가져오기 오류:', err)
    }
  }

  const fetchRecommendedPlaces = async () => {
    try {
      const { data: placesData, error: placesError } = await supabase
        .from('recommended_places')
        .select('*')
        .eq('room_id', roomId)
      
      if (placesError) throw placesError
      
      if (placesData && placesData.length > 0) {
        setRecommendedPlaces(placesData);
      }
    } catch (err: any) {
      console.error('추천 장소 가져오기 오류:', err);
    }
  }

  const handleAddFriend = async (userId: string) => {
    try {
      // 친구 추가 API 호출
      await supabase
        .from('friendships')
        .insert([
          {
            user_id: currentUser.id,
            friend_id: userId
          }
        ])
      
      // UI 업데이트
      setMembers(prev => prev.map(member => 
        member.user_id === userId 
          ? { ...member, is_friend: true } 
          : member
      ))
    } catch (err: any) {
      console.error('친구 추가 오류:', err)
    }
  }

  const handleSendTeamMessage = async (content: string) => {
    try {
      // 메시지 바로 UI에 추가
      const tempId = Date.now().toString();
      const newMessage: Message = {
        id: tempId,
        content,
        sender: {
          id: currentUser.id,
          name: members.find(m => m.user_id === currentUser.id)?.nickname || '익명',
          avatar: undefined
        },
        timestamp: new Date(),
        isAI: false
      };
      
      setTeamMessages(prev => [...prev, newMessage]);
      
      // 서버에 메시지 저장
      const { data, error } = await supabase
        .from('room_messages')
        .insert([
          {
            room_id: roomId,
            user_id: currentUser.id,
            content,
            is_ai: false
          }
        ])
        .select()
        .single();
      
      if (error) throw error;
      
      // 임시 ID를 실제 ID로 업데이트
      if (data) {
        setTeamMessages(prev => prev.map(msg => 
          msg.id === tempId 
            ? { ...msg, id: data.textid } 
            : msg
        ));
      }
    } catch (err: any) {
      console.error('메시지 전송 오류:', err)
    }
  }

  const handleSendAiMessage = async (content: string) => {
    try {
      // 사용자 메시지 바로 UI에 추가
      const userMessage: Message = {
        id: Date.now().toString(),
        content,
        sender: {
          id: currentUser.id,
          name: members.find(m => m.user_id === currentUser.id)?.nickname || '익명',
          avatar: undefined
        },
        timestamp: new Date(),
        isAI: false
      };
      
      setAiMessages(prev => [...prev, userMessage]);
      
      // AI 응답을 위한 로딩 메시지
      const loadingMsgId = (Date.now() + 1).toString();
      const loadingMessage: Message = {
        id: loadingMsgId,
        content: '생각 중...',
        sender: {
          id: 'ai',
          name: 'AI 어시스턴트',
          avatar: undefined
        },
        timestamp: new Date(),
        isAI: true
      };
      
      setAiMessages(prev => [...prev, loadingMessage]);
      
      // AI 응답 요청
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId,
          message: content
        })
      }).catch(err => {
        // API 오류 시 더미 응답 사용
        return {
          ok: false,
          json: () => Promise.resolve({ response: '네트워크 오류가 발생했습니다. 다시 시도해 주세요.' })
        };
      });
      
      let data;
      if (response.ok) {
        data = await response.json();
      } else {
        // 오류 발생 시 더미 응답
        data = { response: '죄송합니다. 지금은 응답할 수 없습니다. 잠시 후 다시 시도해 주세요.' };
      }
      
      // 로딩 메시지를 AI 응답으로 교체
      const aiMessage: Message = {
        id: loadingMsgId,
        content: data.response,
        sender: {
          id: 'ai',
          name: 'AI 어시스턴트',
          avatar: undefined
        },
        timestamp: new Date(),
        isAI: true
      };
      
      setAiMessages(prev => prev.map(msg => 
        msg.id === loadingMsgId 
          ? aiMessage
          : msg
      ));
    } catch (err: any) {
      console.error('AI 메시지 전송 오류:', err);
      
      // 오류 발생 시 오류 메시지 표시
      const errorMessage = '죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      setAiMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.content === '생각 중...') {
          return prev.map((msg, idx) => 
            idx === prev.length - 1
              ? { ...msg, content: errorMessage }
              : msg
          );
        }
        return prev;
      });
    }
  }

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
          <Link href="/mypage" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{room?.title || '99999'}</h1>
        </div>
      </div>
      
      {/* 메인 컨텐츠 */}
      <div className="w-full flex h-[calc(100vh-64px)]">
        {/* 왼쪽 사이드패널 - 멤버 목록 및 팀 채팅 */}
        <div className="w-[300px] min-w-[300px] border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5" />
              <h2 className="font-bold">참여 멤버</h2>
            </div>
            <div className="space-y-2">
              {members.map(member => (
                <div key={member.textid} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      {(member.nickname || member.email || '익명')?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {member.nickname || member.email?.split('@')[0] || '익명 사용자'}
                        {member.user_id === currentUser?.id && ' (나)'}
                      </p>
                    </div>
                  </div>
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
              ))}
            </div>
          </div>
          
          {/* 팀 채팅 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                <h2 className="font-bold">팀 채팅</h2>
              </div>
            </div>
            <ChatContainer
              messages={teamMessages}
              currentUser={{
                id: currentUser?.id,
                name: members.find(m => m.user_id === currentUser?.id)?.nickname || '익명'
              }}
              onSendMessage={handleSendTeamMessage}
              className="flex-1"
            />
          </div>
        </div>
        
        {/* 가운데 - 지도 */}
        <div className="flex-1 relative">
          <KakaoMap
            height="100%"
            markers={recommendedPlaces.map((place, index) => ({
              lat: place.location.lat,
              lng: place.location.lng,
              title: `${index + 1}. ${place.name}`,
              category: place.category.toLowerCase() as any,
              order: index
            }))}
            polyline={recommendedPlaces.map(place => ({
              lat: place.location.lat,
              lng: place.location.lng
            }))}
            polylineColor="#3B82F6"
            useStaticMap={false}
            level={7}
            mapTypeId="ROADMAP"
          />
        </div>
        
        {/* 오른쪽 사이드패널 - AI 추천 및 채팅 */}
        <div className="w-[300px] min-w-[300px] border-l border-gray-200 flex flex-col overflow-hidden">
          {/* AI 추천 장소 */}
          <div className="p-4 border-b border-gray-200 overflow-y-auto h-[50%]">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="h-5 w-5" />
              <h2 className="font-bold">AI 추천 장소</h2>
            </div>
            <div className="space-y-4">
              {recommendedPlaces.map((place) => (
                <PlaceCard
                  key={place.textid}
                  place={place}
                  showActions={false}
                  className="border-gray-100"
                />
              ))}
            </div>
          </div>
          
          {/* AI 채팅 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                <h2 className="font-bold">AI 어시스턴트</h2>
              </div>
            </div>
            <ChatContainer
              messages={aiMessages}
              currentUser={{
                id: currentUser?.id,
                name: members.find(m => m.user_id === currentUser?.id)?.nickname || '익명'
              }}
              onSendMessage={handleSendAiMessage}
              className="flex-1"
              isAIChat
            />
          </div>
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