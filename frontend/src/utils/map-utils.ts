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