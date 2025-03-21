'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import ChatMessage from './ChatMessage'
import { Send, Loader2 } from 'lucide-react'
import { cn } from "@/lib/utils"
import MessageInput from './MessageInput'
import { format } from 'date-fns'
import axios from 'axios'

// 타입 정의
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
  coordinates?: { lat: number; lng: number }[]
}

type ChatContainerProps = {
  messages: Message[]
  currentUser: {
    id: string
    name: string
    avatar?: string
  }
  onSendMessage: (content: string) => void
  onRecommendLocations?: (locations: any[], center?: {lat: number, lng: number} | null) => void
  className?: string
  isAIChat?: boolean
  loading?: boolean
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  currentUser,
  onSendMessage,
  onRecommendLocations,
  className,
  isAIChat = false,
  loading = false
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [recommending, setRecommending] = useState(false)
  
  // 스크롤을 맨 아래로 이동
  useEffect(() => {
    if (autoScroll && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);
  
  // 스크롤 이벤트 핸들러
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const atBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
    setAutoScroll(atBottom);
  };
  
  // 메시지 전송 처리
  const handleSendMessage = () => {
    if (newMessage.trim() === '') return;
    
    onSendMessage(newMessage);
    
    // AI 채팅에서 장소 추천 관련 키워드 감지 시 위치 추천 처리
    if (isAIChat && 
        (newMessage.includes('추천') || 
         newMessage.includes('어디로') || 
         newMessage.includes('장소') || 
         newMessage.includes('여행') ||
         newMessage.includes('가볼 만한'))) {
      handleRecommendLocations(newMessage);
    }
    
    setNewMessage('');
    setAutoScroll(true);
  };
  
  // 엔터 키 입력 처리
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // 장소 추천 처리 함수
  const handleRecommendLocations = async (query: string) => {
    // 이미 처리 중이면 중복 요청 방지
    if (recommending) return;
    
    setRecommending(true);
    
    try {
      // URL에서 roomId 추출
      const roomId = window.location.pathname.split('/')[2];
      
      console.log('장소 추천 API 호출:', roomId, query);
      
      // API 호출
      const response = await axios.post(`/api/rooms/${roomId}/recommand`, {
        query: query
      });
      
      console.log('장소 추천 API 응답:', response.data);
      
      // 응답 처리
      const { locations, center } = response.data;
      
      if (!locations || locations.length === 0) {
        console.warn('추천된 장소가 없습니다.');
        return;
      }
      
      // KakaoMap 업데이트를 위한 콜백 호출
      if (onRecommendLocations) {
        // 중심점 정보와 함께 전달
        onRecommendLocations(locations, center);
      }
      
    } catch (error) {
      console.error('장소 추천 오류:', error);
      
      // 오류 발생 시 사용자에게 알림 메시지
      if (onSendMessage) {
        onSendMessage("죄송합니다. 장소 추천 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setRecommending(false);
    }
  };
  
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* 새 메시지 알림 버튼 (자동 스크롤 비활성화 시 표시) */}
      {!autoScroll && messages.length > 0 && (
        <button
          className="absolute bottom-16 right-4 bg-blue-500 text-white rounded-full p-2 shadow-md z-10"
          onClick={() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      )}
      
      {/* 메시지 컨테이너 */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
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
            <div 
              key={message.id} 
              className={`flex ${message.sender.id === currentUser.id ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`
                  max-w-[80%] p-3 rounded-lg 
                  ${message.sender.id === currentUser.id 
                    ? 'bg-blue-500 text-white rounded-tr-none' 
                    : message.isAI 
                      ? 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200' 
                      : 'bg-gray-200 text-gray-800 rounded-tl-none'
                  }
                `}
              >
                <div className="flex items-center mb-1">
                  <span className="text-xs font-medium">
                    {message.sender.name}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                <div className="flex justify-end mt-1">
                  <span className="text-xs opacity-70">
                    {message.timestamp instanceof Date 
                      ? format(message.timestamp, 'HH:mm') 
                      : format(new Date(message.timestamp), 'HH:mm')}
                  </span>
                </div>
                
                {/* 좌표 정보가 있는 경우 지도 링크 표시 */}
                {message.coordinates && message.coordinates.length > 0 && (
                  <div className="mt-2 text-xs">
                    <a 
                      href="#" 
                      className="text-blue-600 underline"
                      onClick={(e) => {
                        e.preventDefault();
                        // 지도 위치 이동 처리
                        if (onRecommendLocations && message.coordinates) {
                          // 메시지에서는 중심점 정보 없이 좌표만 전달
                          onRecommendLocations(message.coordinates.map(coord => ({
                            name: "추천 위치",
                            description: "메시지에서 표시된 위치",
                            coordinates: coord
                          })), null);
                        }
                      }}
                    >
                      지도에서 위치 보기
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        {/* 로딩 중 표시 */}
        {(loading || recommending) && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-3 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}
        
        {/* 스크롤 위치 참조 */}
        <div ref={messagesEndRef} />
      </div>
      
      {/* 메시지 입력 */}
      <div className="p-3 border-t border-gray-200">
        <div className="flex space-x-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={isAIChat ? "AI에게 질문하기..." : "메시지 입력..."}
            className="flex-1"
          />
          <Button 
            onClick={handleSendMessage} 
            size="icon" 
            disabled={loading || recommending || newMessage.trim() === ''}
          >
            {loading || recommending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ChatContainer 