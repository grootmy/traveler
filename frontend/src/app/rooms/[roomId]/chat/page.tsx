'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, getRoomMembers, getChatMessages } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Send, Loader2, User } from 'lucide-react'

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
    display_name?: string;
  };
}

// 멤버 타입 정의
type Member = {
  id: string;
  user_id: string;
  nickname?: string;
  user?: {
    display_name?: string;
    avatar_url?: string;
    email?: string;
  };
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

  useEffect(() => {
    const init = async () => {
      try {
        // 사용자 정보 가져오기
        const { user, error: authError } = await getCurrentUser()
        
        if (authError) throw authError
        
        setUser(user)
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('title')
          .eq('textid', roomId)
          .single()
        
        if (roomError) throw roomError
        
        setRoomTitle(roomData.title)
        
        // 채팅 메시지 가져오기
        await fetchMessages()
        
        // 멤버 정보 가져오기
        await fetchMembers()
        
        setLoading(false)
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다.')
        setLoading(false)
      }
    }
    
    init()
    
    // 실시간 채팅 리스너 설정
    const chatChannel = supabase
      .channel(`room-chat-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId} AND is_ai_chat=eq.false`
      }, (payload) => {
        // 새 메시지가 추가되면 상태 업데이트
        const newMessage = payload.new as ChatMessage
        setMessages(prev => [...prev, newMessage])
      })
      .subscribe()
    
    return () => {
      // 리스너 정리
      supabase.removeChannel(chatChannel)
    }
  }, [roomId])

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
              display_name: userObj.nickname || '익명'
            } : undefined
          };
        });
        
        setMessages(processedMessages);
      }
    } catch (err: any) {
      console.error('메시지 가져오기 오류:', err)
    }
  }

  const fetchMembers = async () => {
    try {
      const { data: membersData, error } = await getRoomMembers(roomId)
      
      if (error) throw error
      
      setMembers(membersData || [])
    } catch (err: any) {
      console.error('멤버 정보 가져오기 오류:', err)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || submitting) return
    
    setSubmitting(true)
    
    try {
      // 사용자 메시지 저장
      const { data: userMsgData, error: userMsgError } = await supabase
        .from('chat_messages')
        .insert({
          room_id: roomId,
          user_id: user?.id,
          content: input,
          is_ai: false,
          is_ai_chat: false
        })
        .select()
      
      if (userMsgError) throw userMsgError
      
      // 입력 초기화
      setInput('')
    } catch (err: any) {
      console.error('메시지 전송 오류:', err)
      setError(err.message || '메시지 전송 중 오류가 발생했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  // 메시지 발신자 찾기
  const getSender = (userId?: string) => {
    if (!userId) return { name: 'AI', isCurrentUser: false }
    
    const isCurrentUser = userId === user?.id
    const member = members.find(m => m.user_id === userId)
    
    const name = 
      member?.nickname ||
      member?.user?.display_name ||
      member?.user?.email?.split('@')[0] ||
      '익명';
    
    return { name, isCurrentUser }
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
      </div>
      
      {error && (
        <div className="fixed bottom-20 left-0 right-0 mx-auto w-max bg-red-50 text-red-500 text-sm px-4 py-2 rounded-md">
          {error}
        </div>
      )}
    </main>
  )
} 