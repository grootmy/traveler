'use client'
// chatmessage의 CSS나 UI를 수정해야 할 경우 여기서 수정

import React, { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from "@/lib/utils"
import { MapPin } from 'lucide-react'
import { format } from 'date-fns'

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
  coordinates?: { lat: number; lng: number }[]
}

interface Location {
  name: string
  description: string
  category: string
  coordinates: {
    lat: number
    lng: number
  }
}

interface LocationsData {
  locations: Location[]
  center: {
    lat: number
    lng: number
  }
}

interface ChatMessageProps {
  message: Message
  isOwn: boolean
  className?: string
  onRecommendLocations?: (locations: any[], center?: {lat: number, lng: number} | null) => void
}

// JSON 문자열 판별 및 정제
const parseLocationData = (content: string): LocationsData | null => {
  console.log("파싱 시작:", content);
  
  // 전체 문자열이 JSON인지 확인
  if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(content.trim());
      if (parsed && parsed.locations && Array.isArray(parsed.locations)) {
        console.log("전체 내용이 JSON 형식이며 위치 데이터 포함:", parsed);
        return parsed as LocationsData;
      }
    } catch (e) {
      console.log("전체 JSON 파싱 실패, 부분 파싱 시도");
    }
  }
  
  // 보다 정확한 JSON 패턴 매칭
  try {
    // 위치 데이터 패턴을 찾기 - locations 배열을 포함하는 JSON 객체
    const locationsJsonPattern = /\{"locations":\s*\[\s*\{[\s\S]*?\}\s*\]\s*,\s*"center":\s*\{[\s\S]*?\}\s*\}/g;
    const matches = content.match(locationsJsonPattern);
    
    if (matches && matches.length > 0) {
      for (const match of matches) {
        try {
          const parsed = JSON.parse(match);
          if (parsed && parsed.locations && Array.isArray(parsed.locations)) {
            console.log("위치 데이터 패턴 찾음:", parsed);
            return parsed as LocationsData;
          }
        } catch (e) {
          console.log("위치 패턴 매칭된 텍스트 파싱 실패:", e);
        }
      }
    }
    
    // 일반적인 중괄호 블록 매칭
    const jsonPattern = /(\{[\s\S]*?\})/g;
    const jsonMatches = content.match(jsonPattern);
    
    if (jsonMatches) {
      // 가장 긴 매치부터 시도 (완전한 JSON 객체일 가능성이 높음)
      const sortedMatches = [...jsonMatches].sort((a, b) => b.length - a.length);
      
      for (const match of sortedMatches) {
        if (match.length < 10) continue; // 너무 짧은 매치는 건너뜀
        
        try {
          const parsed = JSON.parse(match);
          if (parsed && parsed.locations && Array.isArray(parsed.locations)) {
            console.log("일반 패턴에서 위치 데이터 찾음:", parsed);
            return parsed as LocationsData;
          }
        } catch (e) {
          // 파싱 실패, 다음 매치 시도
        }
      }
    }
  } catch (e) {
    console.log("패턴 매칭 과정 오류:", e);
  }
  
  return null;
};

const LocationCard: React.FC<{location: Location}> = ({ location }) => {
  return (
    <div className="border rounded-lg p-3 mb-2 hover:bg-gray-50">
      <div className="font-bold text-sm">{location.name}</div>
      <div className="text-xs text-gray-600 mb-1">{location.category}</div>
      <div className="text-xs text-gray-600">{location.description}</div>
    </div>
  );
};

const LocationsView: React.FC<{
  locationsData: LocationsData, 
  onRecommendLocations?: (locations: any[], center?: {lat: number, lng: number} | null) => void
}> = ({ locationsData, onRecommendLocations }) => {
  if (!locationsData || !locationsData.locations || !Array.isArray(locationsData.locations)) {
    return <div>위치 정보가 없습니다.</div>;
  }
  
  return (
    <div className="w-full">
      <div className="text-sm font-medium mb-2">추천 장소 ({locationsData.locations.length}곳)</div>
      <div className="max-h-60 overflow-y-auto">
        {locationsData.locations.map((location, index) => (
          <LocationCard key={index} location={location} />
        ))}
      </div>
      
      {/* 지도에서 보기 버튼 */}
      {onRecommendLocations && (
        <div className="mt-2">
          <button 
            onClick={() => {
              onRecommendLocations(
                locationsData.locations.map(location => ({
                  name: location.name,
                  description: location.description,
                  category: location.category,
                  coordinates: location.coordinates,
                  marker_type: "recommendation"
                })), 
                locationsData.center
              );
            }}
            className="text-blue-600 text-xs flex items-center hover:underline"
          >
            <MapPin className="h-3 w-3 mr-1" />
            지도에서 모든 장소 보기
          </button>
        </div>
      )}
    </div>
  );
};

const RenderContent: React.FC<{
  content: string, 
  message: Message,
  onRecommendLocations?: (locations: any[], center?: {lat: number, lng: number} | null) => void
}> = ({ content, message, onRecommendLocations }) => {
  const [parsedData, setParsedData] = useState<LocationsData | null>(null);
  const [isProcessed, setIsProcessed] = useState(false);
  
  useEffect(() => {
    console.log("메시지 내용:", content);
    const locationData = parseLocationData(content);
    
    if (locationData) {
      console.log("위치 데이터 파싱 성공", locationData);
      setParsedData(locationData);
    } else {
      console.log("위치 데이터 없음, 일반 텍스트로 표시");
      setParsedData(null);
    }
    
    setIsProcessed(true);
  }, [content]);
  
  if (!isProcessed) {
    return <div>처리 중...</div>;
  }
  
  if (parsedData) {
    return <LocationsView locationsData={parsedData} onRecommendLocations={onRecommendLocations} />;
  }
  
  // 기존 좌표 정보가 있는 경우에도 지도 버튼 표시
  return (
    <div>
      <div className="whitespace-pre-wrap">{content}</div>
      
      {message.coordinates && message.coordinates.length > 0 && onRecommendLocations && (
        <div className="mt-2 text-xs">
          <button 
            className="text-blue-600 flex items-center hover:underline"
            onClick={() => {
              if (message.coordinates) {
                onRecommendLocations(message.coordinates.map(coord => ({
                  name: "추천 위치",
                  description: "메시지에서 표시된 위치",
                  coordinates: coord,
                  marker_type: "chat_location"
                })), null);
              }
            }}
          >
            <MapPin className="h-3 w-3 mr-1" />
            지도에 위치 보기
          </button>
        </div>
      )}
    </div>
  );
};

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  isOwn, 
  className,
  onRecommendLocations
}) => {
  // 현재 시간부터 메시지 시간까지의 거리 계산 (예: "3분 전")
  const timeAgo = formatDistanceToNow(new Date(message.timestamp), { 
    addSuffix: true,
    locale: ko 
  })
  
  // 시간 포맷 (HH:mm)
  const formattedTime = format(new Date(message.timestamp), 'HH:mm');
  
  if (isOwn) {
    // 자신의 메시지
    return (
      <div className="flex flex-col items-end mb-4">
        <div className="flex items-end justify-end mb-1">
          <div>
            <div className="font-medium text-xs text-gray-600 text-right">{message.sender.name}</div>
          </div>
          <div className={cn(
            "w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center ml-2",
            message.sender.avatar ? "" : "text-sm"
          )}>
            {message.sender.avatar ? (
              <img src={message.sender.avatar} alt={message.sender.name} className="w-8 h-8 rounded-full" />
            ) : (
              message.sender.name.charAt(0).toUpperCase()
            )}
          </div>
        </div>
        <div className="flex items-end">
          <div className="mr-2 text-xs text-gray-500">{formattedTime}</div>
          <div className={cn(
            "bg-blue-500 text-white py-2 px-4 rounded-lg max-w-xs break-words",
            className
          )}>
            <RenderContent 
              content={message.content} 
              message={message} 
              onRecommendLocations={onRecommendLocations} 
            />
          </div>
        </div>
      </div>
    )
  } else if (message.isAI) {
    // AI 메시지
    return (
      <div className="flex flex-col items-start mb-4">
        <div className="flex items-start mb-1">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mr-2">
            AI
          </div>
          <div>
            <div className="font-medium text-xs text-gray-600">AI 어시스턴트</div>
          </div>
        </div>
        <div className="flex items-end ml-10">
          <div className={cn(
            "bg-gray-100 py-2 px-4 rounded-lg max-w-xs break-words border border-gray-200",
            className
          )}>
            <RenderContent 
              content={message.content} 
              message={message} 
              onRecommendLocations={onRecommendLocations} 
            />
          </div>
          <div className="ml-2 text-xs text-gray-500">{formattedTime}</div>
        </div>
      </div>
    )
  } else {
    // 다른 사용자 메시지
    return (
      <div className="flex flex-col items-start mb-4">
        <div className="flex items-start mb-1">
          <div className={cn(
            "w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-2",
            message.sender.avatar ? "" : "text-sm"
          )}>
            {message.sender.avatar ? (
              <img src={message.sender.avatar} alt={message.sender.name} className="w-8 h-8 rounded-full" />
            ) : (
              message.sender.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <div className="font-medium text-xs text-gray-600">{message.sender.name}</div>
          </div>
        </div>
        <div className="flex items-end ml-10">
          <div className={cn(
            "bg-gray-200 py-2 px-4 rounded-lg max-w-xs break-words",
            className
          )}>
            <RenderContent 
              content={message.content} 
              message={message} 
              onRecommendLocations={onRecommendLocations} 
            />
          </div>
          <div className="ml-2 text-xs text-gray-500">{formattedTime}</div>
        </div>
      </div>
    )
  }
}

export default ChatMessage 