'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import ChatMessage from './ChatMessage'
import { Send, Loader2, MapPin } from 'lucide-react'
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
  onSendMessage: (content: string, customMessage?: Message) => void
  onRecommendLocations?: (locations: any[], center?: {lat: number, lng: number} | null) => void
  className?: string
  isAIChat?: boolean
  loading?: boolean
  input?: string
  onChangeInput?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  currentUser,
  onSendMessage,
  onRecommendLocations,
  className,
  isAIChat = false,
  loading = false,
  input,
  onChangeInput
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [recommending, setRecommending] = useState(false)
  
  // input prop이 제공된 경우 사용
  const inputValue = input !== undefined ? input : newMessage;
  const handleInputChange = onChangeInput || ((e: React.ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value));
  
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
    if (inputValue.trim() === '') return;
    
    onSendMessage(inputValue);
    
    // AI 채팅에서 장소 추천 관련 키워드 감지 시 위치 추천 처리
    if (isAIChat && 
        (inputValue.includes('추천') || 
         inputValue.includes('어디로') || 
         inputValue.includes('장소') || 
         inputValue.includes('여행') ||
         inputValue.includes('가볼 만한'))) {
      handleRecommendLocations(inputValue);
    }
    
    // input prop이 제공되지 않은 경우에만 로컬 상태 업데이트
    if (input === undefined) {
      setNewMessage('');
    }
    
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
        console.warn('추천된 장소.');
        return;
      }
      
      // isAIChat 모드에서는 별도의 메시지를 추가하지 않음 (이미 AI 응답이 처리되기 때문)
      if (!isAIChat) {
        // AI 응답을 먼저 표시하기 위한 메시지 생성
        const aiResponseMessage: Message = {
          id: `ai-response-${Date.now()}`,
          content: `다음 ${locations.length}개의 장소를 추천합니다:\n\n${locations.map((loc: any, index: number) => 
            `${index + 1}. ${loc.name} - ${loc.description || '추천 장소'}`
          ).join('\n')}`,
          sender: {
            id: 'ai',
            name: 'AI 비서'
          },
          timestamp: new Date(),
          isAI: true,
          coordinates: locations.map((loc: any) => {
            // 좌표 형식 변환
            if (loc.coordinates && typeof loc.coordinates.lat === 'number') {
              return {
                lat: loc.coordinates.lat,
                lng: loc.coordinates.lng
              };
            } else if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
              return {
                lat: loc.latitude,
                lng: loc.longitude
              };
            } else {
              return {
                lat: loc.lat || 37.5665,
                lng: loc.lng || 126.9780
              };
            }
          })
        };
        
        // AI 응답 메시지 추가
        if (onSendMessage) {
          // 직접 메시지 배열에 추가하지 않고, 메시지 전송 함수를 통해 추가
          // onSendMessage 함수가 애플리케이션 상태를 업데이트하도록 함
          onSendMessage(aiResponseMessage.content, aiResponseMessage);
        }
      }
      
      // KakaoMap 업데이트를 위한 콜백 호출
      if (onRecommendLocations) {
        // 응답 데이터가 올바른 형식인지 확인하고 필요한 변환 수행
        const formattedLocations = locations.map((loc: any) => {
          // 이미 올바른 형식이라면 그대로 사용
          if (loc.coordinates && typeof loc.coordinates.lat === 'number') {
            return loc;
          }
          
          // 필드명이 latitude/longitude 형식이라면 변환
          if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
            return {
              name: loc.name,
              description: loc.description || '',
              category: loc.category || '관광지',
              address: loc.address || '주소 정보 없음',
              coordinates: {
                lat: loc.latitude,
                lng: loc.longitude
              }
            };
          }
          
          // 기본 포맷으로 변환 (예상치 못한 응답 형식인 경우)
          return {
            name: loc.name || '장소 정보',
            description: loc.description || '',
            category: loc.category || '관광지',
            address: loc.address || '주소 정보 없음',
            coordinates: {
              lat: loc.lat || loc.latitude || 37.5665,
              lng: loc.lng || loc.longitude || 126.9780
            }
          };
        });
        
        console.log('변환된 위치 데이터:', formattedLocations);
        
        // 중심점 정보 확인 및 변환
        let centerPoint = center;
        if (center && (typeof center.latitude === 'number' || typeof center.lat === 'number')) {
          centerPoint = {
            lat: center.lat || center.latitude,
            lng: center.lng || center.longitude
          };
        }
        
        // 추천 함수 호출 - 반드시 페이지의 handleRecommendedLocations 함수를 호출하도록 함
        onRecommendLocations(formattedLocations, centerPoint);
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
  
  // AI 메시지를 파싱하여 장소 추천이 있는지 확인하는 함수
  useEffect(() => {
    // 가장 최근 AI 메시지 가져오기
    const lastMessage = messages[messages.length - 1];
    
    // 최근 메시지가 AI 메시지인지 확인
    if (lastMessage && lastMessage.isAI && lastMessage.content) {
      // 장소 추천 패턴 감지 (예: "다음 장소를 추천합니다", "추천 장소는 다음과 같습니다" 등)
      const recommendationPattern = /추천.*장소|장소.*추천|방문.*장소|장소.*방문|여행지.*추천|추천.*여행지|관광.*장소|장소.*관광/;
      
      if (recommendationPattern.test(lastMessage.content) && lastMessage.coordinates && lastMessage.coordinates.length > 0) {
        console.log('AI 메시지에서 장소 추천 감지:', lastMessage.coordinates);
        
        // 좌표 정보가 있으면 KakaoMap 및 연관 추천 업데이트
        if (onRecommendLocations && lastMessage.coordinates) {
          const formattedLocations = lastMessage.coordinates.map((coord, index) => {
            // 메시지 내용에서 장소 이름과 설명 추출 시도
            const lines = lastMessage.content.split('\n');
            let name = `추천 장소 ${index + 1}`;
            let description = '';
            
            // 각 줄을 검사하여 숫자로 시작하는 항목 찾기 (예: "1. 경복궁 - 조선시대 대표적인 궁궐")
            for (const line of lines) {
              const match = line.match(/^\s*(\d+)\.\s+(.+?)(?:\s+-\s+(.+))?$/);
              if (match && parseInt(match[1]) === index + 1) {
                name = match[2].trim();
                description = match[3] ? match[3].trim() : '';
                break;
              }
            }
            
            return {
              name: name,
              description: description,
              category: '추천 장소',
              address: '주소 정보 없음',
              coordinates: coord,
              textid: `rec-${Date.now()}-${index}`
            };
          });
          
          console.log('AI 응답에서 변환된 위치 데이터:', formattedLocations);
          
          // 중심점 계산
          const centerPoint = formattedLocations.length > 0 ? formattedLocations[0].coordinates : null;
          
          // 추천 함수 호출
          onRecommendLocations(formattedLocations, centerPoint);
        }
      }
    }
  }, [messages, onRecommendLocations]);
  
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
            <ChatMessage
              key={message.id}
              message={{
                id: message.id,
                content: message.content,
                sender: message.sender,
                timestamp: message.timestamp instanceof Date 
                  ? message.timestamp 
                  : new Date(message.timestamp),
                isAI: message.isAI,
                coordinates: message.coordinates
              }}
              isOwn={message.sender.id === currentUser.id}
              className=""
              onRecommendLocations={onRecommendLocations}
            />
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
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder={isAIChat ? "AI에게 질문하기..." : "메시지 입력..."}
            className="flex-1"
          />
          <Button 
            onClick={handleSendMessage} 
            size="icon" 
            disabled={loading || recommending || inputValue.trim() === ''}
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