import { useRef, useState, useEffect, useCallback } from 'react';
import { useMapStore } from '@/store/mapStore';
import { convertToMarkers, calculateCentroid, DEFAULT_MAP_CENTER, DEFAULT_MAP_LEVEL } from '@/utils/map-utils';
import type { KakaoMapHandle } from '@/components/KakaoMap';
import type { Coordinate as CoordType, Marker as MarkerType, MarkerCategory } from '@/store/mapStore';

// Place 타입 정의 (기존 컴포넌트에서 사용하는 타입과 일치시켜야 함)
interface Place {
  textid: string;
  name: string;
  description: string;
  category: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
}

export function useMapControl() {
  const mapStore = useMapStore();
  const mapRef = useRef<KakaoMapHandle>(null);
  const [mapCenter, setMapCenter] = useState<CoordType>(DEFAULT_MAP_CENTER);
  const [mapLevel, setMapLevel] = useState<number>(DEFAULT_MAP_LEVEL);
  const [recommendedMarkers, setRecommendedMarkers] = useState<MarkerType[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  
  // 맵 준비 상태 설정
  const setMapReady = useCallback((ready: boolean) => {
    setIsMapReady(ready);
  }, []);
  
  // 모든 마커가 보이도록 지도 범위 조정
  const fitBoundsToAllMarkers = useCallback((padding: number = 100, delay: number = 300) => {
    if (!mapRef.current) return;
    
    const allCoordinates = [
      ...mapStore.markers.map(marker => ({ lat: marker.lat, lng: marker.lng })),
      ...recommendedMarkers.map(marker => ({ lat: marker.lat, lng: marker.lng }))
    ];
    
    if (allCoordinates.length === 0) return;
    
    // 좌표가 하나만 있을 경우 해당 위치로 중심 이동
    if (allCoordinates.length === 1) {
      setTimeout(() => {
        mapRef.current?.setCenter(allCoordinates[0]);
        mapRef.current?.setLevel(3); // 적절한 확대 레벨 설정
      }, delay);
      return;
    }
    
    // 모든 마커를 포함하는 범위로 지도 조정
    setTimeout(() => {
      mapRef.current?.fitBounds(allCoordinates, padding);
    }, delay);
  }, [mapStore.markers, recommendedMarkers]);
  
  // 경로 마커와 폴리라인 업데이트
  const updateRouteMarkers = useCallback((places: Place[]) => {
    if (!places || places.length === 0) {
      mapStore.setMarkers([]);
      mapStore.setPolyline([]);
      return;
    }
    
    // 경로의 마커 정보 생성
    const routeMarkers = places.map((place, index) => ({
      lat: place.location.lat,
      lng: place.location.lng,
      title: place.name,
      order: index,
      category: (place.category || 'default') as MarkerCategory
    }));
    
    // 폴리라인 좌표 생성
    const polylineCoords = places.map(place => ({
      lat: place.location.lat,
      lng: place.location.lng
    }));
    
    // 현재 스토어의 마커와 폴리라인과 비교하여 변경이 있을 때만 업데이트
    const currentMarkers = mapStore.markers;
    const currentPolyline = mapStore.polyline;
    
    // 마커 비교 - 개수, lat, lng, title, category 비교
    const markersChanged = 
      routeMarkers.length !== currentMarkers.length ||
      routeMarkers.some((marker, i) => 
        !currentMarkers[i] ||
        marker.lat !== currentMarkers[i].lat ||
        marker.lng !== currentMarkers[i].lng ||
        marker.title !== currentMarkers[i].title ||
        marker.category !== currentMarkers[i].category
      );
      
    // 폴리라인 비교 - 개수, lat, lng 비교  
    const polylineChanged = 
      polylineCoords.length !== currentPolyline.length ||
      polylineCoords.some((coord, i) => 
        !currentPolyline[i] ||
        coord.lat !== currentPolyline[i].lat ||
        coord.lng !== currentPolyline[i].lng
      );
    
    // 변경이 있을 때만 스토어 업데이트
    if (markersChanged) {
      mapStore.setMarkers(routeMarkers);
    }
    
    if (polylineChanged) {
      mapStore.setPolyline(polylineCoords);
    }
    
    return { routeMarkers, polylineCoords };
  }, [mapStore]);
  
  // 추천 마커 업데이트
  const updateRecommendedMarkers = useCallback((locations: any[]) => {
    if (!locations || locations.length === 0) {
      setRecommendedMarkers([]);
      mapStore.clearRecommendedMarkers();
      return [];
    }
    
    // 유틸리티 함수를 사용하여 마커 배열 생성
    const markersToShow = convertToMarkers(locations, 'recommendation');
    
    // 현재 스토어 마커와 비교
    const currentRecommended = mapStore.recommendedMarkers;
    
    // 마커 비교 - 개수, lat, lng 비교
    const recommendedChanged = 
      markersToShow.length !== currentRecommended.length ||
      markersToShow.some((marker, i) => 
        !currentRecommended[i] ||
        marker.lat !== currentRecommended[i].lat ||
        marker.lng !== currentRecommended[i].lng
      );
    
    // 변경이 있을 때만 업데이트
    if (recommendedChanged) {
      setRecommendedMarkers(markersToShow);
      mapStore.setRecommendedMarkers(markersToShow.map(marker => ({
        ...marker,
        category: 'recommendation' as MarkerCategory
      })));
    }
    
    return markersToShow;
  }, [mapStore]);
  
  // 지도 뷰 범위를 특정 마커들로 제한
  const fitBoundsToMarkers = useCallback((markers: MarkerType[], padding: number = 80, delay: number = 300) => {
    if (!mapRef.current || markers.length === 0) return;
    
    const coordinatesToShow = markers.map(marker => ({ 
      lat: marker.lat, 
      lng: marker.lng 
    }));
    
    setTimeout(() => {
      mapRef.current?.fitBounds(coordinatesToShow, padding);
    }, delay);
  }, []);
  
  return {
    mapRef,
    mapCenter,
    mapLevel,
    setMapCenter,
    setMapLevel,
    recommendedMarkers,
    updateRouteMarkers,
    updateRecommendedMarkers,
    fitBoundsToAllMarkers,
    fitBoundsToMarkers,
    setMapReady,
    isMapReady
  };
} 