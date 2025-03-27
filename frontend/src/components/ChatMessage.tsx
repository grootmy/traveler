'use client'
// chatmessage의 CSS나 UI를 수정해야 할 경우 여기서 수정

import React, { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from "@/lib/utils"

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
}

// JSON 문자열 판별 및 정제
const parseLocationData = (content: string): LocationsData | null => {
  console.log("파싱 시도:", content);
  
  // 숫자, 공백만 있는 경우 제거
  const cleanedContent = content.replace(/^\s*\d+\s*$/, "").trim();
  if (!cleanedContent) return null;
  
  // 1. 직접 JSON 파싱 시도
  try {
    // content가 순수 JSON 문자열인지 확인
    const trimmed = cleanedContent.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.locations && Array.isArray(parsed.locations)) {
        console.log("직접 JSON 파싱 성공:", parsed);
        return parsed as LocationsData;
      }
    }
  } catch (e) {
    console.log("직접 JSON 파싱 실패:", e);
  }

  // 2. 텍스트 내에서 JSON 객체 추출 시도
  try {
    // JSON 객체를 포함하는 부분 찾기 (가장 외부 중괄호 쌍)
    const startIndex = cleanedContent.indexOf('{');
    const endIndex = cleanedContent.lastIndexOf('}');
    
    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      const jsonCandidate = cleanedContent.substring(startIndex, endIndex + 1);
      
      try {
        const parsed = JSON.parse(jsonCandidate);
        if (parsed && parsed.locations && Array.isArray(parsed.locations)) {
          console.log("JSON 부분 추출 성공:", parsed);
          return parsed as LocationsData;
        }
      } catch (innerError) {
        console.log("JSON 부분 추출 파싱 실패:", innerError);
      }
    }
    
    // 정규식으로 JSON 객체 패턴 찾기
    const jsonPattern = /(\{[\s\S]*?\})/g;
    const matches = cleanedContent.match(jsonPattern);
    
    if (matches) {
      // 가장 긴 매치가 전체 JSON 객체일 가능성이 높음
      matches.sort((a, b) => b.length - a.length);
      
      for (const match of matches) {
        try {
          const parsed = JSON.parse(match);
          if (parsed && parsed.locations && Array.isArray(parsed.locations)) {
            console.log("정규식 매치 JSON 추출 성공:", parsed);
            return parsed as LocationsData;
          }
        } catch (innerError) {
          console.log("정규식 추출 객체 파싱 실패:", match.substring(0, 50) + '...', innerError);
        }
      }
    }
  } catch (e) {
    console.log("JSON 패턴 검색 실패:", e);
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

const LocationsView: React.FC<{locationsData: LocationsData}> = ({ locationsData }) => {
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
    </div>
  );
};

const RenderContent: React.FC<{content: string}> = ({ content }) => {
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
    return <LocationsView locationsData={parsedData} />;
  }
  
  return <div>{content}</div>;
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isOwn, className }) => {
  // 현재 시간부터 메시지 시간까지의 거리 계산 (예: "3분 전")
  const timeAgo = formatDistanceToNow(new Date(message.timestamp), { 
    addSuffix: true,
    locale: ko 
  })
  
  if (isOwn) {
    // 자신의 메시지
    return (
      <div className="flex flex-col items-end mb-4">
        <div className="flex items-end">
          <div className="mr-2 text-xs text-gray-500">{timeAgo}</div>
          <div className={cn(
            "bg-blue-500 text-white py-2 px-4 rounded-lg max-w-xs break-words",
            className
          )}>
            <RenderContent content={message.content} />
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
            "bg-gray-200 py-2 px-4 rounded-lg max-w-xs break-words",
            className
          )}>
            <RenderContent content={message.content} />
          </div>
          <div className="ml-2 text-xs text-gray-500">{timeAgo}</div>
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
            <RenderContent content={message.content} />
          </div>
          <div className="ml-2 text-xs text-gray-500">{timeAgo}</div>
        </div>
      </div>
    )
  }
}

export default ChatMessage 