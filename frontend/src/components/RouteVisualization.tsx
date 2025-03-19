'use client'

import { useState, useEffect } from 'react'
import KakaoMap from '@/components/KakaoMap'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import PlaceCard from '@/components/PlaceCard'
import { Clock, MapPin } from 'lucide-react'

interface Place {
  textid: string;
  name: string;
  description: string;
  category: string;
  address: string;
  image_url?: string;
  location: {
    lat: number;
    lng: number;
  };
  rating?: number;
  price_level?: number;
  recommendation_reason?: string;
  is_recommended?: boolean;
}

interface Route {
  textid: string;
  title?: string;
  places: Place[];
  travel_time: number;
  total_cost?: number;
}

interface RouteVisualizationProps {
  route: Route;
  onPlaceVote?: (placeId: string, voteType: 'up' | 'down') => void;
  onPlaceFavorite?: (placeId: string) => void;
  placeVotes?: Record<string, 'up' | 'down'>;
  placeFavorites?: string[];
  className?: string;
}

/**
 * 동선 시각화 컴포넌트
 * 선택된 장소들과 이동 경로를 지도와 목록으로 표시합니다.
 */
export default function RouteVisualization({
  route,
  onPlaceVote,
  onPlaceFavorite,
  placeVotes = {},
  placeFavorites = [],
  className
}: RouteVisualizationProps) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("map")
  
  // 선택된 장소의 좌표로 지도 중심점 설정
  const selectedPlace = route.places.find(place => place.textid === selectedPlaceId)
  const mapCenter = selectedPlace?.location || 
    (route.places.length > 0 ? route.places[0].location : { lat: 37.5665, lng: 126.9780 });
  
  // 경로 데이터 생성
  const polylineCoordinates = route.places.map(place => ({
    lat: place.location.lat,
    lng: place.location.lng
  }));
  
  // 마커 데이터 생성
  const markers = route.places.map((place, index) => ({
    lat: place.location.lat,
    lng: place.location.lng,
    title: place.name,
    content: `<div class="p-2 text-sm">
      <strong>${place.name}</strong><br/>
      ${place.category}<br/>
      ${place.address}
    </div>`,
    category: place.category.toLowerCase() as any,
    order: index
  }));
  
  // 소요 시간 포맷팅
  const formatTravelTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours > 0 ? `${hours}시간 ` : ''}${mins > 0 ? `${mins}분` : ''}`;
  };
  
  return (
    <div className={className}>
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex justify-between items-center">
            <div>
              {route.title || '추천 동선'}
              <span className="text-sm text-gray-500 ml-2">
                ({route.places.length}개 장소)
              </span>
            </div>
            <div className="flex items-center text-sm text-blue-600">
              <Clock className="h-4 w-4 mr-1" />
              {formatTravelTime(route.travel_time)}
              
              {route.total_cost && (
                <span className="ml-4">
                  예상 비용: {route.total_cost.toLocaleString()}원
                </span>
              )}
            </div>
          </CardTitle>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="map" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="map">지도 보기</TabsTrigger>
          <TabsTrigger value="list">목록 보기</TabsTrigger>
        </TabsList>
        
        <TabsContent value="map" className="h-[500px]">
          <KakaoMap
            width="100%"
            height="500px"
            center={mapCenter}
            level={route.places.length > 1 ? 7 : 5}
            markers={markers}
            polyline={polylineCoordinates}
          />
        </TabsContent>
        
        <TabsContent value="list">
          <div className="space-y-4">
            {route.places.map((place, index) => (
              <div key={place.textid} className="flex">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mr-3 mt-2">
                  {index + 1}
                </div>
                <div className="flex-grow">
                  <PlaceCard
                    place={{
                      ...place,
                      order_index: index
                    }}
                    upVotes={0}
                    downVotes={0}
                    userVote={placeVotes[place.textid] || null}
                    onVote={onPlaceVote}
                    onFavorite={onPlaceFavorite}
                    isFavorite={placeFavorites.includes(place.textid)}
                    onClick={() => setSelectedPlaceId(place.textid)}
                  />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 