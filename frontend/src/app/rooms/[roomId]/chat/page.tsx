'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, getRoomMembers, getChatMessages, sendChatMessage as sendChatMessageToDb } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Send, Loader2, User } from 'lucide-react'
import { 
  joinRoomRealtime, 
  leaveRoomRealtime, 
  subscribeToChatMessages, 
  subscribeToChatBroadcast, 
  broadcastChatMessage 
} from '@/lib/supabase/realtime'

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

// 멤버 타입 정의
type Member = {
  id: string;
  user_id: string;
  nickname?: string;
  user?: {
    nickname?: string;
    avatar_url?: string;
    email?: string;
  };
}

// 실시간 메시지 타입
type RealtimeMessage = {
  id: string;
  content: string;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
  timestamp: Date;
  isAI: boolean;
}

export default function TeamChatPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [user, setUser] = useState<any>(null)
  const [roomTitle, setRoomTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { roomId } = params
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({})
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 초기화 및 메시지 불러오기
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
        
        // 멤버 정보 가져오기
        const { data: membersData, error: membersError } = await getRoomMembers(roomId)
        
        if (membersError) {
          console.error('멤버 정보 가져오기 오류:', membersError)
          setError('멤버 정보를 불러오는 중 오류가 발생했습니다')
          return
        }
        
        setMembers(Array.isArray(membersData) ? membersData as Member[] : [])
        
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
            if (!message.isAIChat) {
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
                  is_ai_chat: false,
                  created_at: new Date(message.timestamp).toISOString(),
                  user: {
                    textid: message.sender.id,
                    nickname: message.sender.name,
                    avatar_url: message.sender.avatar
                  }
                };
                
                return [...prev, newMessage];
              });
              
              console.log('새 팀 메시지 수신:', message);
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
            
            console.log('[브로드캐스트] 메시지 수신:', {
              id: message.id,
              content: message.content.substring(0, 15) + (message.content.length > 15 ? '...' : ''),
              sender: message.sender.id,
              isAI: message.isAI,
              isAIChat: message.isAIChat,
              timestamp: new Date(message.timestamp).toISOString()
            });
            
            // 자신이 보낸 메시지는 무시 (이미 UI에 표시됨)
            if (message.sender.id === currentUser.id) {
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
            
            setMessages(prev => {
              // 메시지 ID로 중복 확인
              const duplicateByID = prev.some(m => m.textid === message.id);
              
              // 내용과 발신자로 중복 확인 (타임스탬프 근접성 고려)
              const duplicateByContent = prev.some(m => 
                m.content === message.content && 
                m.user_id === message.sender.id &&
                Math.abs((new Date(m.created_at).getTime() - new Date(message.timestamp).getTime())) < 3000
              );
              
              if (duplicateByID || duplicateByContent) {
                console.log('중복 메시지 무시:', message.id);
                return prev;
              }
              
              // 새 메시지 추가
              const newMessage: ChatMessage = {
                textid: message.id,
                content: message.content,
                user_id: message.sender.id,
                is_ai: message.isAI,
                is_ai_chat: false,
                created_at: new Date(message.timestamp).toISOString(),
                user: {
                  textid: message.sender.id,
                  nickname: message.sender.name,
                  avatar_url: message.sender.avatar
                }
              };
              
              console.log('새 브로드캐스트 메시지 추가:', message.id);
              return [...prev, newMessage];
            });
          })
          chatBroadcastRegistered = true
          console.log('채팅 브로드캐스트 리스너 등록 완료')
        }
        
        setLoading(false)
      } catch (err: any) {
        console.error('채팅 페이지 초기화 오류:', err)
        setError(err.message || '채팅을 불러오는 중 오류가 발생했습니다')
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
      const { data, error } = await getChatMessages(roomId, false) // is_ai_chat이 false인 메시지만 가져옴
      
      if (error) throw error
      
      if (data) {
        // user 객체 처리 - 배열에서 객체로 변환
        const processedMessages = data.map((msg: any) => {
          const userObj = msg.user as any;
          return {
            ...msg,
            user: userObj ? {
              textid: userObj.textid,
              nickname: userObj.nickname,
              avatar_url: userObj.avatar_url,
              email: userObj.email
            } : undefined
          };
        });
        
        setMessages(processedMessages);
      }
    } catch (err: any) {
      console.error('메시지 가져오기 오류:', err)
    }
  }

  // 타이핑 상태 처리
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    
    // 타이핑 상태 업데이트
    if (!isTyping && value.trim() !== '') {
      setIsTyping(true);
      
      // TODO: 타이핑 상태 브로드캐스트 기능 구현 (필요시)
    }
    
    // 타이핑 타임아웃 설정
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      
      // TODO: 타이핑 종료 상태 브로드캐스트 기능 구현 (필요시)
    }, 2000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || submitting || !user) return
    
    setSubmitting(true)
    
    try {
      // 타이핑 상태 해제
      setIsTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // 임시 ID로 메시지 생성
      const tempId = `temp-${Date.now()}`;
      
      // 로컬 UI 업데이트 - 메시지 바로 표시
      const tempMessage: ChatMessage = {
        textid: tempId,
        content: input.trim(),
        user_id: user.id,
        is_ai: false,
        is_ai_chat: false,
        created_at: new Date().toISOString(),
        user: {
          textid: user.id,
          nickname: user.user_metadata?.nickname || user.email?.split('@')[0],
          avatar_url: user.user_metadata?.avatar_url,
          email: user.email
        }
      };
      
      setMessages(prev => [...prev, tempMessage]);
      
      // 입력 초기화
      setInput('');
      
      // 데이터베이스에 메시지 저장
      const { data, error } = await sendChatMessageToDb(roomId, user.id, tempMessage.content);
      
      if (error) throw error;
      
      // 실제 메시지 ID 가져오기
      const actualMessageId = data && data[0]?.textid ? data[0].textid : tempId;
      
      console.log('메시지 DB 저장 완료:', actualMessageId);
      
      // 브로드캐스트로 다른 사용자에게 실시간 전송
      await broadcastChatMessage(roomId, {
        id: actualMessageId,
        content: tempMessage.content,
        sender: {
          id: user.id,
          name: user.user_metadata?.nickname || user.email?.split('@')[0] || '사용자',
          avatar: user.user_metadata?.avatar_url
        },
        timestamp: new Date(),
        isAI: false
      });
      
      console.log('메시지 브로드캐스트 완료');
      
    } catch (err: any) {
      console.error('메시지 전송 오류:', err);
      setError(err.message || '메시지 전송 중 오류가 발생했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  // 메시지 발신자 찾기
  const getSender = (userId?: string) => {
    if (!userId) return { name: 'AI', isCurrentUser: false }
    
    const isCurrentUser = userId === user?.id
    const member = members.find(m => m.user_id === userId)
    
    const name = 
      member?.nickname ||
      member?.user?.nickname ||
      member?.user?.email?.split('@')[0] ||
      '익명';
    
    return { name, isCurrentUser }
  }

  // 타이핑 중인 사용자 표시
  const renderTypingIndicator = () => {
    const typingUserIds = Object.entries(typingUsers)
      .filter(([id, isTyping]) => isTyping && id !== user?.id)
      .map(([id]) => id);
    
    if (typingUserIds.length === 0) return null;
    
    const typingMemberNames = typingUserIds
      .map(id => {
        const member = members.find(m => m.user_id === id);
        return member?.nickname || member?.user?.nickname || '익명 사용자';
      })
      .join(', ');
    
    return (
      <div className="text-xs text-gray-500 italic p-2">
        {typingMemberNames} 입력 중...
      </div>
    );
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
      {/* 상단 헤더 */}
      <div className="border-b border-gray-200">
        <div className="flex items-center p-4">
          <Link href={`/rooms/${roomId}/routes`} className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">팀 채팅</h1>
        </div>
      </div>
      
      {/* 메인 컨텐츠 */}
      <div className="grid grid-cols-1 h-[calc(100vh-64px)]">
        {/* 채팅 영역 */}
        <div className="flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <p className="text-gray-500">아직 대화가 없습니다. 첫 메시지를 보내보세요!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const { name, isCurrentUser } = getSender(msg.user_id)
                
                return (
                  <div
                    key={msg.textid}
                    className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isCurrentUser && (
                      <div className="flex-shrink-0 mr-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                          {msg.user?.avatar_url ? (
                            <img
                              src={msg.user.avatar_url}
                              alt={name}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <User className="h-4 w-4 text-gray-500" />
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className={`max-w-[70%] rounded-lg p-3 ${
                      isCurrentUser
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {!isCurrentUser && (
                        <div className="text-xs font-medium mb-1">{name}</div>
                      )}
                      <div className="text-sm">{msg.content}</div>
                      <div className="text-xs mt-1 opacity-70 text-right">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* 입력 영역 */}
          <div className="p-4 border-t border-gray-200">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <Input
                placeholder="메시지를 입력하세요"
                value={input}
                onChange={handleInputChange}
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
      </div>
      
      {renderTypingIndicator()}
      
      {error && (
        <div className="fixed bottom-20 left-0 right-0 mx-auto w-max bg-red-50 text-red-500 text-sm px-4 py-2 rounded-md">
          {error}
        </div>
      )}
    </main>
  )
} 