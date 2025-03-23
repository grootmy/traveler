import { create } from 'zustand'

// 카테고리 타입 정의
export type MarkerCategory = 'restaurant' | 'cafe' | 'attraction' | 'culture' | 'shopping' | 'transport' | 'recommendation' | 'chat_location' | 'default';

// 좌표 인터페이스
export interface Coordinate {
  lat: number;
  lng: number;
}

// 마커 인터페이스
export interface Marker extends Coordinate {
  title?: string;
  content?: string;
  order?: number;
  category?: MarkerCategory;
}

// 지도 상태 인터페이스
interface MapState {
  // 지도 중심 좌표
  center: Coordinate;
  // 지도 줌 레벨
  level: number;
  // 이전 값들을 저장
  prevCenter: Coordinate | null;
  prevLevel: number | null;
  
  // 폴리라인과 마커 관련 상태 추가
  polyline: Coordinate[];
  markers: Marker[];
  recommendedMarkers: Marker[];
  
  // 상태 업데이트 함수
  setCenter: (center: Coordinate) => void;
  setLevel: (level: number) => void;
  resetMapState: () => void;
  
  // 폴리라인과 마커 업데이트 함수
  setPolyline: (coordinates: Coordinate[]) => void;
  setMarkers: (markers: Marker[]) => void;
  setRecommendedMarkers: (markers: Marker[]) => void;
  addMarker: (marker: Marker) => void;
  removeMarker: (index: number) => void;
  clearMarkers: () => void;
  clearRecommendedMarkers: () => void;
}

// 기본 중심 좌표 (서울시청)
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };
const DEFAULT_LEVEL = 9;

// 좌표 비교 함수 (작은 오차 무시)
const isSameCoord = (coord1: Coordinate, coord2: Coordinate): boolean => {
  const EPSILON = 0.0000001; // 매우 작은 값 (오차 허용 범위)
  return Math.abs(coord1.lat - coord2.lat) < EPSILON && Math.abs(coord1.lng - coord2.lng) < EPSILON;
};

// 지도 상태 저장소 생성
export const useMapStore = create<MapState>((set, get) => ({
  // 초기 상태
  center: DEFAULT_CENTER,
  level: DEFAULT_LEVEL,
  prevCenter: null,
  prevLevel: null,
  
  // 폴리라인과 마커 초기 상태
  polyline: [],
  markers: [],
  recommendedMarkers: [],
  
  // 상태 업데이트 함수 - 중복 업데이트 방지 로직 추가
  setCenter: (center: Coordinate) => {
    const state = get();
    
    // 이전 상태와 동일하거나 매우 작은 차이면 업데이트 하지 않음
    if (state.prevCenter && isSameCoord(center, state.prevCenter)) {
      return;
    }
    
    set({ 
      center, 
      prevCenter: center 
    });
  },
  
  setLevel: (level: number) => {
    const state = get();
    
    // 이전 상태와 동일하면 업데이트 하지 않음
    if (state.prevLevel === level) {
      return;
    }
    
    set({ 
      level, 
      prevLevel: level 
    });
  },
  
  resetMapState: () => set({ 
    center: DEFAULT_CENTER, 
    level: DEFAULT_LEVEL,
    prevCenter: DEFAULT_CENTER,
    prevLevel: DEFAULT_LEVEL
  }),
  
  // 폴리라인 업데이트 함수
  setPolyline: (coordinates: Coordinate[]) => {
    const state = get();
    
    // 현재 폴리라인과 동일한지 확인하는 로직 추가
    if (state.polyline.length === coordinates.length) {
      // 모든 좌표가 동일한지 확인
      const allSame = state.polyline.every((coord, index) => {
        const newCoord = coordinates[index];
        return (
          coord.lat === newCoord.lat &&
          coord.lng === newCoord.lng
        );
      });
      
      // 모든 좌표가 동일하면 업데이트 하지 않음
      if (allSame) {
        return;
      }
    }
    
    set({ polyline: coordinates });
  },
  
  // 마커 업데이트 함수
  setMarkers: (markers: Marker[]) => {
    const state = get();
    
    // 현재 마커와 동일한지 확인하는 로직 추가
    if (state.markers.length === markers.length) {
      // 모든 마커가 동일한지 확인
      const allSame = state.markers.every((marker, index) => {
        const newMarker = markers[index];
        return (
          marker.lat === newMarker.lat &&
          marker.lng === newMarker.lng &&
          marker.title === newMarker.title &&
          marker.category === newMarker.category &&
          marker.order === newMarker.order
        );
      });
      
      // 모든 마커가 동일하면 업데이트 하지 않음
      if (allSame) {
        return;
      }
    }
    
    set({ markers });
  },
  
  // 추천 마커 업데이트 함수
  setRecommendedMarkers: (markers: Marker[]) => {
    const state = get();
    
    // 현재 추천 마커와 동일한지 확인하는 로직 추가
    if (state.recommendedMarkers.length === markers.length) {
      // 모든 마커가 동일한지 확인
      const allSame = state.recommendedMarkers.every((marker, index) => {
        const newMarker = markers[index];
        return (
          marker.lat === newMarker.lat &&
          marker.lng === newMarker.lng &&
          marker.title === newMarker.title &&
          marker.category === newMarker.category
        );
      });
      
      // 모든 마커가 동일하면 업데이트 하지 않음
      if (allSame) {
        return;
      }
    }
    
    set({ recommendedMarkers: markers });
  },
  
  // 마커 추가 함수
  addMarker: (marker: Marker) => {
    set(state => ({ 
      markers: [...state.markers, marker] 
    }));
  },
  
  // 마커 제거 함수
  removeMarker: (index: number) => {
    set(state => ({ 
      markers: state.markers.filter((_, i) => i !== index) 
    }));
  },
  
  // 모든 마커 제거 함수
  clearMarkers: () => {
    set({ markers: [] });
  },
  
  // 모든 추천 마커 제거 함수
  clearRecommendedMarkers: () => {
    set({ recommendedMarkers: [] });
  }
})); 