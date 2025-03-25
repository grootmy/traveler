'use client'

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useMap } from '@/hooks/useMap';
import { type MarkerCategory, type Coordinate } from '@/store/mapStore';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_LEVEL } from '@/utils/map-utils';

// 카카오맵 관련 타입 정의 개선
type KakaoLatLng = {lat: number; lng: number};

// 컴포넌트 참조용 핸들 타입 정의
export interface KakaoMapHandle {
  fitBounds: (coordinates: Coordinate[], padding?: number) => void;
  setCenter: (center: Coordinate) => void;
  setLevel: (level: number) => void;
  getCenter: () => Coordinate | null;
  getLevel: () => number | null;
  getBounds: () => {sw: Coordinate; ne: Coordinate} | null;
}

interface KakaoMapProps {
  width?: string;
  height?: string;
  initialCenter?: Coordinate;
  initialLevel?: number;
  markers?: Array<{ 
    id?: string;
    position?: {lat: number; lng: number};
    lat?: number; 
    lng?: number; 
    title?: string;
    content?: string;
    category?: MarkerCategory;
    color?: string;
    order?: number; // 동선에서의 순서
  }>;
  polyline?: Coordinate[];
  polylineColor?: string;
  polylineOpacity?: number;
  useCurrentLocation?: boolean;
  mapTypeId?: 'ROADMAP' | 'SKYVIEW' | 'HYBRID';
  onClick?: (lat: number, lng: number) => void;
  onMarkerClick?: (markerId: string) => void;
  onDragEnd?: () => void;
  onZoomChanged?: () => void;
  useStaticMap?: boolean;
  onMapLoad?: (isLoaded: boolean) => void;
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

const KakaoMap = forwardRef<KakaoMapHandle, KakaoMapProps>(({
  width = '100%',
  height = '400px',
  initialCenter = DEFAULT_MAP_CENTER,
  initialLevel = DEFAULT_MAP_LEVEL,
  markers = [],
  polyline = [],
  polylineColor = '#3B82F6',
  polylineOpacity = 0.7,
  useCurrentLocation = false,
  mapTypeId = 'ROADMAP',
  onClick,
  onMarkerClick,
  onDragEnd,
  onZoomChanged,
  useStaticMap = false,
  onMapLoad
}, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // 이전 프롭 값을 추적하여 프로그래밍적 변경을 감지
  const prevCenterRef = useRef<Coordinate>(initialCenter);
  const prevLevelRef = useRef<number>(initialLevel);
  
  // useMap 훅 사용
  const { 
    isLoaded,
    error,
    initializeMap,
    updateMapOptions,
    updateMarkers,
    updatePolyline,
    setupResizeHandler,
    cleanup,
    setCenter,
    setLevel,
    fitBounds,
    getCenter,
    getLevel,
    getBounds
  } = useMap({
    initialCenter,
    initialLevel,
    initialMarkers: markers,
    initialPolyline: polyline,
    mapTypeId,
    polylineColor,
    polylineOpacity,
    useCurrentLocation,
    onClick,
    onMarkerClick,
    onDragEnd,
    onZoomChanged
  });
  
  // 외부에서 접근할 수 있는 메서드 노출
  useImperativeHandle(ref, () => ({
    fitBounds,
    setCenter,
    setLevel,
    getCenter,
    getLevel,
    getBounds
  }), [fitBounds, setCenter, setLevel, getCenter, getLevel, getBounds]);
  
  // 지도 초기화
  useEffect(() => {
    // 카카오맵 API가 로드되었는지, DOM 참조가 유효한지 확인
    if (!window.kakao || !window.kakao.maps || !mapContainerRef.current) return;
    
    // 지도 초기화
    initializeMap(mapContainerRef.current);
    
    // 맵 로드 상태 콜백 호출
    if (onMapLoad) {
      onMapLoad(true);
    }
    
    // 언마운트 시 정리
    return () => {
      cleanup();
      if (onMapLoad) {
        onMapLoad(false);
      }
    };
  }, [initializeMap, cleanup, onMapLoad]);
  
  // initialCenter prop이 변경될 때만 중심점 업데이트
  useEffect(() => {
    if (isLoaded && initialCenter) {
      const centerChanged = 
        initialCenter.lat !== prevCenterRef.current.lat || 
        initialCenter.lng !== prevCenterRef.current.lng;
      
      if (centerChanged) {
        setCenter(initialCenter);
        prevCenterRef.current = initialCenter;
      }
    }
  }, [isLoaded, initialCenter, setCenter]);
  
  // initialLevel prop이 변경될 때만 업데이트
  useEffect(() => {
    if (isLoaded && initialLevel !== prevLevelRef.current) {
      setLevel(initialLevel);
      prevLevelRef.current = initialLevel;
    }
  }, [isLoaded, initialLevel, setLevel]);
  
  // 마커 업데이트
  useEffect(() => {
    if (isLoaded) {
      updateMarkers(markers);
    }
  }, [isLoaded, markers, updateMarkers]);
  
  // 폴리라인 업데이트
  useEffect(() => {
    if (isLoaded) {
      updatePolyline(polyline);
    }
  }, [isLoaded, polyline, updatePolyline]);
  
  // 윈도우 리사이즈 이벤트 처리
  useEffect(() => {
    const cleanupResizeHandler = setupResizeHandler();
    return cleanupResizeHandler;
  }, [setupResizeHandler]);

  return (
    <div className="relative w-full h-full">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-red-500 z-10">
          <p>{error}</p>
        </div>
      )}
      <div
        ref={mapContainerRef}
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
});

KakaoMap.displayName = 'KakaoMap';

export default KakaoMap; 