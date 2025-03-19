'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Clock, Coffee, Utensils, Camera, Landmark, ShoppingBag } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface TimelinePlace {
  textid: string;
  name: string;
  category: string;
  address: string;
  startTime: Date;
  endTime: Date;
  description?: string;
}

interface TimelineViewProps {
  date: Date;
  places: TimelinePlace[];
  className?: string;
}

/**
 * 시간표 형식의 일정 타임라인 컴포넌트
 * 시간대별로 장소와 활동을 표시하는 컴포넌트입니다.
 */
export default function TimelineView({
  date,
  places,
  className
}: TimelineViewProps) {
  // 장소 카테고리에 따른 아이콘 반환
  const getCategoryIcon = (category: string) => {
    const iconClass = "h-6 w-6";
    
    switch(category.toLowerCase()) {
      case 'restaurant':
        return <Utensils className={iconClass} />;
      case 'cafe':
        return <Coffee className={iconClass} />;
      case 'attraction':
        return <Camera className={iconClass} />;
      case 'culture':
        return <Landmark className={iconClass} />;
      case 'shopping':
        return <ShoppingBag className={iconClass} />;
      default:
        return <MapPin className={iconClass} />;
    }
  };
  
  // 카테고리에 따른 배경색 클래스 반환
  const getCategoryColorClass = (category: string) => {
    switch(category.toLowerCase()) {
      case 'restaurant':
        return "bg-red-100 text-red-800";
      case 'cafe':
        return "bg-teal-100 text-teal-800";
      case 'attraction':
        return "bg-amber-100 text-amber-800";
      case 'culture':
        return "bg-purple-100 text-purple-800";
      case 'shopping':
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  // 한국어 날짜 포맷
  const formatDate = (date: Date) => {
    return format(date, 'yyyy년 M월 d일 (eee)', { locale: ko });
  };
  
  // 시간 포맷 (00:00)
  const formatTime = (date: Date) => {
    return format(date, 'HH:mm');
  };
  
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <span>{formatDate(date)} 일정</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {places.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              일정이 없습니다
            </div>
          ) : (
            <div className="relative pl-8 border-l-2 border-gray-200">
              {places.map((place, index) => (
                <div key={place.textid} className="mb-8 relative">
                  {/* 타임라인 마커 */}
                  <div className={`absolute -left-[31px] p-2 rounded-full ${getCategoryColorClass(place.category)}`}>
                    {getCategoryIcon(place.category)}
                  </div>
                  
                  {/* 시간 */}
                  <div className="text-sm font-semibold text-gray-600 mb-1">
                    {formatTime(place.startTime)} - {formatTime(place.endTime)}
                  </div>
                  
                  {/* 장소 정보 */}
                  <div className="bg-white p-4 rounded-lg border">
                    <h3 className="font-bold text-lg">{place.name}</h3>
                    <div className="flex items-center text-gray-500 text-sm mt-1">
                      <MapPin className="h-3.5 w-3.5 mr-1" />
                      <span>{place.address}</span>
                    </div>
                    
                    {place.description && (
                      <p className="mt-2 text-sm">{place.description}</p>
                    )}
                  </div>
                  
                  {/* 이동 정보 (마지막 장소가 아닐 경우) */}
                  {index < places.length - 1 && (
                    <div className="flex items-center text-gray-400 text-xs mt-2 mb-2 ml-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      이동 ({index + 1}번 → {index + 2}번)
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 