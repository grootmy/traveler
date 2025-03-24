'use client';

import { type Coordinate, type Marker, type MarkerCategory } from '@/store/mapStore';

// 카테고리별 마커 색상 정의
export const CategoryColors: Record<string, string> = {
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

// 기본 지도 중심 좌표 (서울시청)
export const DEFAULT_MAP_CENTER: Coordinate = { lat: 37.5665, lng: 126.9780 };

// 기본 지도 확대 레벨
export const DEFAULT_MAP_LEVEL = 9;

// SVG를 Base64로 인코딩하는 함수
export const svgToBase64 = (svg: string): string => {
  try {
    return btoa(unescape(encodeURIComponent(svg)));
  } catch (e) {
    console.error('SVG 인코딩 오류:', e);
    return '';
  }
};

// 디바운스 함수
export const debounce = <T extends (...args: any[]) => any>(
  func: T, 
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// 중심 좌표 계산 함수
export const calculateCentroid = (points: Coordinate[]): Coordinate => {
  if (points.length === 0) return DEFAULT_MAP_CENTER;
  
  const sum = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lng: acc.lng + point.lng
    }),
    { lat: 0, lng: 0 }
  );
  
  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length
  };
};

// 좌표 거리 계산 함수 (하버사인 공식)
export const calculateDistance = (coord1: Coordinate, coord2: Coordinate): number => {
  const toRadian = (value: number) => (value * Math.PI) / 180;
  const R = 6371; // 지구 반경 (km)
  
  const lat1 = toRadian(coord1.lat);
  const lng1 = toRadian(coord1.lng);
  const lat2 = toRadian(coord2.lat);
  const lng2 = toRadian(coord2.lng);
  
  const dlat = lat2 - lat1;
  const dlng = lng2 - lng1;
  
  const a = 
    Math.sin(dlat / 2) * Math.sin(dlat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) * Math.sin(dlng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // 킬로미터 단위
};

// 좌표가 크게 변경되었는지 확인하는 함수
export const isCoordinateChanged = (
  coord1: Coordinate, 
  coord2: Coordinate, 
  threshold: number = 0.0001
): boolean => {
  return (
    Math.abs(coord1.lat - coord2.lat) > threshold || 
    Math.abs(coord1.lng - coord2.lng) > threshold
  );
};

// API 응답을 Marker 형식으로 변환하는 함수
export const convertToMarkers = (locations: any[], category: MarkerCategory = 'recommendation'): Marker[] => {
  return locations.map((loc: any) => ({
    lat: loc.coordinates ? loc.coordinates.lat : (loc.latitude || loc.lat),
    lng: loc.coordinates ? loc.coordinates.lng : (loc.longitude || loc.lng),
    title: loc.name || '추천 장소',
    content: loc.description || '',
    category
  }));
};

/**
 * 여러 좌표를 모두 포함하는 지도 경계(bounds)를 계산합니다.
 * @param coordinates 표시할 좌표 배열
 * @returns 모든 좌표를 포함하는 경계 정보 (LatLngBounds)
 */
export function calculateBounds(coordinates: Coordinate[]): any {
  if (!window.kakao || !coordinates.length) {
    return null;
  }

  try {
    // 컴파일러 오류를 피하기 위해 any 타입 사용
    const kakaoMaps = (window as any).kakao.maps;
    if (!kakaoMaps) return null;
    
    // 경계 객체 생성
    const bounds = new kakaoMaps.LatLngBounds();
    
    // 모든 좌표를 경계에 추가
    coordinates.forEach(coord => {
      bounds.extend(new kakaoMaps.LatLng(coord.lat, coord.lng));
    });
    
    return bounds;
  } catch (err) {
    console.error('경계 계산 오류:', err);
    return null;
  }
}

/**
 * 여러 좌표에 맞게 지도 화면을 조정합니다.
 * @param map 카카오맵 인스턴스
 * @param coordinates 표시할 좌표 배열
 * @param padding 경계와 지도 사이의 여백 (픽셀)
 * @returns 조정된 중심 좌표와 줌 레벨
 */
export function fitBoundsToCoordinates(map: any, coordinates: Coordinate[], padding: number = 50): { center: Coordinate, level: number } {
  if (!map || !coordinates.length) {
    return { center: DEFAULT_MAP_CENTER, level: DEFAULT_MAP_LEVEL };
  }
  
  try {
    // 경계 계산
    const bounds = calculateBounds(coordinates);
    if (!bounds) {
      return { center: DEFAULT_MAP_CENTER, level: DEFAULT_MAP_LEVEL };
    }
    
    // 지도를 해당 경계에 맞게 조정
    map.setBounds(bounds, padding);
    
    // 조정된 중심과 레벨 반환
    const center = map.getCenter();
    const adjustedCenter = { lat: center.getLat(), lng: center.getLng() };
    const adjustedLevel = map.getLevel();
    
    return { center: adjustedCenter, level: adjustedLevel };
  } catch (err) {
    console.error('지도 화면 조정 오류:', err);
    return { center: DEFAULT_MAP_CENTER, level: DEFAULT_MAP_LEVEL };
  }
} 