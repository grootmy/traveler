'use client'

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMapStore, type MarkerCategory } from '@/store/mapStore';

// 카카오맵 관련 타입 정의 개선
type KakaoLatLng = {lat: number; lng: number};

interface KakaoMapProps {
  width?: string;
  height?: string;
  center?: KakaoLatLng;
  level?: number;
  markers?: Array<{ 
    lat: number; 
    lng: number; 
    title: string;
    content?: string;
    category?: MarkerCategory;
    order?: number; // 동선에서의 순서
  }>;
  polyline?: KakaoLatLng[];
  polylineColor?: string;
  polylineOpacity?: number;
  useCurrentLocation?: boolean;
  mapTypeId?: 'ROADMAP' | 'SKYVIEW' | 'HYBRID';
  onClick?: (lat: number, lng: number) => void;
  useStaticMap?: boolean; // 정적 지도 사용 여부 추가
}

// 카테고리별 마커 색상 정의
const CategoryColors: Record<string, string> = {
  restaurant: '#FF6B6B', // 음식점 - 빨간색
  cafe: '#4ECDC4',       // 카페 - 청록색
  attraction: '#FF9F1C',  // 관광지 - 주황색
  culture: '#A78BFA',     // 문화시설 - 보라색
  shopping: '#3B82F6',    // 쇼핑 - 파란색
  transport: '#6B7280',   // 교통 - 회색
  recommendation: '#FF5733', // 추천 장소 - 주황빨간색
  chat_location: '#39FF14', // 채팅 위치 - 네온 그린
  default: '#2563EB'      // 기본 - 파란색
};

// SVG를 Base64로 인코딩하는 함수
const svgToBase64 = (svg: string): string => {
  try {
    return btoa(unescape(encodeURIComponent(svg)));
  } catch (e) {
    console.error('SVG 인코딩 오류:', e);
    return '';
  }
};

// 디바운스 함수
const debounce = <T extends (...args: any[]) => any>(
  func: T, 
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export default function KakaoMap({
  width = '100%',
  height = '400px',
  center,
  level = 3,
  markers = [],
  polyline = [],
  polylineColor = '#3B82F6',
  polylineOpacity = 0.7,
  useCurrentLocation = false,
  mapTypeId = 'ROADMAP',
  onClick,
  useStaticMap = false
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 렌더링 사이에 유지해야 하는 상태들
  const markerInstancesRef = useRef<any[]>([]);
  const polylineInstanceRef = useRef<any | null>(null);
  const currentLocationMarkerRef = useRef<any | null>(null);
  
  // Zustand 스토어에서 상태와 액션 가져오기
  const { 
    center: storeCenter, 
    level: storeLevel,
    markers: storeMarkers,
    recommendedMarkers: storeRecommendedMarkers,
    polyline: storePolyline,
    setCenter: setStoreCenter,
    setLevel: setStoreLevel
  } = useMapStore();
  
  // props와 store 값 통합
  const finalCenter = center || storeCenter;
  const finalLevel = level || storeLevel;
  const finalMarkers = markers.length > 0 ? markers : [...storeMarkers, ...storeRecommendedMarkers];
  const finalPolyline = polyline.length > 0 ? polyline : storePolyline;
  
  // 마커 이미지 생성 함수
  const createMarkerImage = useCallback((text: string, category?: MarkerCategory) => {
    if (!window.kakao || !window.kakao.maps) return null;
    
    const color = CategoryColors[category || 'default'] || CategoryColors.default;
    
    // SVG 마커 생성
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="18" y="23" font-family="Arial" font-size="16" font-weight="bold" fill="white" text-anchor="middle">
          ${text}
        </text>
      </svg>
    `;
    
    const encodedSvg = svgToBase64(svg);
    if (!encodedSvg) return null;
    
    return new window.kakao.maps.MarkerImage(
      `data:image/svg+xml;base64,${encodedSvg}`,
      new window.kakao.maps.Size(36, 36),
      { offset: new window.kakao.maps.Point(18, 18) }
    );
  }, []);
  
  // 현재 위치 가져오기
  const getCurrentLocation = useCallback(() => {
    if (!map || !navigator.geolocation) {
      setError('이 브라우저에서는 위치 정보를 사용할 수 없습니다.');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newCenter = new window.kakao.maps.LatLng(latitude, longitude);
        
        // 지도 중심 이동
        map.setCenter(newCenter);
        setStoreCenter({ lat: latitude, lng: longitude });
        
        // 기존 현재 위치 마커 제거
        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setMap(null);
        }
        
        // 현재 위치 마커 추가
        const marker = new window.kakao.maps.Marker({
          position: newCenter,
          map,
          title: '현재 위치'
        });
        
        currentLocationMarkerRef.current = marker;
      },
      (err) => {
        console.error('위치 정보를 가져오는데 실패했습니다:', err);
        setError('위치 정보를 가져오는데 실패했습니다.');
      }
    );
  }, [map, setStoreCenter]);
  
  // 지도 초기화
  useEffect(() => {
    // 카카오맵 API가 로드되었는지 확인
    if (!window.kakao || !window.kakao.maps) {
      return;
    }
    
    // mapRef가 없거나 DOM에 연결되지 않은 경우
    if (!mapRef.current) return;
    
    try {
      // 지도 옵션 설정
      const options = {
        center: new window.kakao.maps.LatLng(finalCenter.lat, finalCenter.lng),
        level: finalLevel,
        mapTypeId: window.kakao.maps.MapTypeId[mapTypeId]
      };
      
      // 지도 생성
      const mapInstance = new window.kakao.maps.Map(mapRef.current, options);
      setMap(mapInstance);
      setIsLoaded(true);
      
      // 클릭 이벤트 등록
      if (onClick) {
        window.kakao.maps.event.addListener(mapInstance, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.latLng;
          onClick(latlng.getLat(), latlng.getLng());
        });
      }
      
      // idle 이벤트 (지도 이동 및 확대/축소 완료 시 발생)
      const handleIdle = debounce(() => {
        const center = mapInstance.getCenter();
        setStoreCenter({
          lat: center.getLat(),
          lng: center.getLng()
        });
        setStoreLevel(mapInstance.getLevel());
      }, 300);
      
      window.kakao.maps.event.addListener(mapInstance, 'idle', handleIdle);
      
      // 현재 위치 사용 설정된 경우 위치 가져오기
      if (useCurrentLocation) {
        setTimeout(getCurrentLocation, 500);
      }
    } catch (err) {
      console.error('지도 초기화 오류:', err);
      setError('지도를 초기화하는데 실패했습니다.');
    }
    
  }, [finalCenter.lat, finalCenter.lng, finalLevel, mapTypeId, onClick, setStoreCenter, setStoreLevel, useCurrentLocation, getCurrentLocation]);
  
  // 지도 중심 및 레벨 업데이트
  useEffect(() => {
    if (!map || !isLoaded) return;
    
    // 중심점이 크게 변경된 경우만 업데이트
    const currentCenter = map.getCenter();
    const currentLat = currentCenter.getLat();
    const currentLng = currentCenter.getLng();
    
    if (
      Math.abs(currentLat - finalCenter.lat) > 0.0001 || 
      Math.abs(currentLng - finalCenter.lng) > 0.0001
    ) {
      const newCenter = new window.kakao.maps.LatLng(finalCenter.lat, finalCenter.lng);
      map.setCenter(newCenter);
    }
    
    // 레벨이 변경된 경우 업데이트
    if (map.getLevel() !== finalLevel) {
      map.setLevel(finalLevel);
    }
  }, [map, isLoaded, finalCenter.lat, finalCenter.lng, finalLevel]);
  
  // 마커 업데이트
  useEffect(() => {
    if (!map || !isLoaded) return;
    
    // 기존 마커 제거
    markerInstancesRef.current.forEach(marker => {
      marker.setMap(null);
    });
    markerInstancesRef.current = [];
    
    // 새 마커 생성
    finalMarkers.forEach((markerData, index) => {
      try {
        const position = new window.kakao.maps.LatLng(markerData.lat, markerData.lng);
        const displayOrder = markerData.order !== undefined 
          ? markerData.order.toString() 
          : (index + 1).toString();
        
        const markerImage = createMarkerImage(displayOrder, markerData.category);
        
        const marker = new window.kakao.maps.Marker({
          position,
          map,
          title: markerData.title || `위치 ${index + 1}`,
          image: markerImage
        });
        
        markerInstancesRef.current.push(marker);
      } catch (err) {
        console.error('마커 생성 오류:', err);
      }
    });
  }, [map, isLoaded, finalMarkers, createMarkerImage]);
  
  // 폴리라인 업데이트
  useEffect(() => {
    if (!map || !isLoaded || finalPolyline.length < 2) return;
    
    try {
      // 기존 폴리라인 제거
      if (polylineInstanceRef.current) {
        polylineInstanceRef.current.setMap(null);
        polylineInstanceRef.current = null;
      }
      
      // 좌표 배열 생성
      const path = finalPolyline.map(coord => 
        new window.kakao.maps.LatLng(coord.lat, coord.lng)
      );
      
      // 새 폴리라인 생성
      const polyline = new window.kakao.maps.Polyline({
        path,
        strokeWeight: 5,
        strokeColor: polylineColor,
        strokeOpacity: polylineOpacity,
        strokeStyle: 'solid'
      });
      
      polyline.setMap(map);
      polylineInstanceRef.current = polyline;
    } catch (err) {
      console.error('폴리라인 생성 오류:', err);
    }
  }, [map, isLoaded, finalPolyline, polylineColor, polylineOpacity]);
  
  // 윈도우 크기 변경 시 지도 크기 재조정
  useEffect(() => {
    if (!map) return;
    
    const handleResize = debounce(() => {
      map.relayout();
    }, 100);
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);
  
  // 컴포넌트 언마운트 시 정리 작업
  useEffect(() => {
    return () => {
      // 마커 제거
      markerInstancesRef.current.forEach(marker => {
        if (marker) marker.setMap(null);
      });
      
      // 폴리라인 제거
      if (polylineInstanceRef.current) {
        polylineInstanceRef.current.setMap(null);
      }
      
      // 현재 위치 마커 제거
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setMap(null);
      }
    };
  }, []);
  
  return (
    <div className="relative w-full h-full">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-red-500 z-10">
          <p>{error}</p>
        </div>
      )}
      <div
        ref={mapRef}
        style={{
          width,
          height,
          border: '1px solid #e5e7eb',
          borderRadius: '0.375rem'
        }}
        className={`${!isLoaded ? 'bg-gray-100' : ''} z-10`}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 z-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
    </div>
  );
} 