'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import ChatMessage from './ChatMessage'
import { Send } from 'lucide-react'
import { cn } from "@/lib/utils"
import MessageInput from './MessageInput'

interface Message {
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

interface ChatContainerProps {
  messages: Message[]
  currentUser: {
    id: string
    name: string
    avatar?: string
  }
  onSendMessage: (content: string) => Promise<void>
  className?: string
  isAIChat?: boolean
  loading?: boolean
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  currentUser,
  onSendMessage,
  className,
  isAIChat = false,
  loading = false
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  
  // 즉시 스크롤 - 첫 로딩 시
  const scrollToBottomInstant = () => {
    if (messagesEndRef.current && autoScroll) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" })
    }
  }
  
  // 부드러운 스크롤 - 메시지 추가 시
  const scrollToBottomSmooth = () => {
    if (messagesEndRef.current && autoScroll) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }
  
  // 컴포넌트 마운트 시 최초 한번 스크롤 맨 아래로
  useEffect(() => {
    scrollToBottomInstant()
  }, [])
  
  // 메시지 업데이트 시 스크롤
  useEffect(() => {
    scrollToBottomSmooth()
  }, [messages])
  
  // 스크롤 이벤트 핸들러 - 사용자가 위로 스크롤하면 자동 스크롤 비활성화
  useEffect(() => {
    const handleScroll = () => {
      if (!messagesContainerRef.current) return
      
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
      
      // 스크롤이 거의 맨 아래에 있으면 자동 스크롤 활성화
      setAutoScroll(isAtBottom)
    }
    
    const container = messagesContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [])
  
  // 메시지 전송 핸들러
  const handleSendMessage = async (content: string) => {
    await onSendMessage(content)
    // 메시지 전송 후 300ms 대기 후 스크롤 (전송된 메시지가 UI에 반영될 시간 고려)
    setTimeout(scrollToBottomSmooth, 300)
    setAutoScroll(true)
  }
  
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* 새 메시지 알림 버튼 (자동 스크롤 비활성화 시 표시) */}
      {!autoScroll && messages.length > 0 && (
        <button
          className="absolute bottom-16 right-4 bg-blue-500 text-white rounded-full p-2 shadow-md z-10"
          onClick={scrollToBottomSmooth}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      )}
      
      {/* 메시지 컨테이너 */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            {isAIChat 
              ? '여행에 대해 궁금한 점을 물어보세요!' 
              : '팀원들과 채팅을 시작해보세요!'}
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isOwn={message.sender.id === currentUser.id}
            />
          ))
        )}
        
        {/* 로딩 중 표시 */}
        {loading && (
          <div className="flex items-center space-x-2 p-2 bg-gray-200 rounded-lg max-w-xs">
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
          </div>
        )}
        
        {/* 스크롤 위치 참조 */}
        <div ref={messagesEndRef} />
      </div>
      
      {/* 메시지 입력 */}
      <MessageInput 
        onSubmit={handleSendMessage} 
        placeholder={isAIChat ? "AI에게 질문하기..." : "메시지 입력..."}
        disabled={loading}
      />
    </div>
  )
}

export default ChatContainer 