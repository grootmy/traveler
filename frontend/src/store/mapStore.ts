import { create } from 'zustand'

// 지도 상태 인터페이스
interface MapState {
  // 지도 중심 좌표
  center: { lat: number; lng: number };
  // 지도 줌 레벨
  level: number;
  // 이전 값들을 저장
  prevCenter: { lat: number; lng: number } | null;
  prevLevel: number | null;
  // 상태 업데이트 함수
  setCenter: (center: { lat: number; lng: number }) => void;
  setLevel: (level: number) => void;
  resetMapState: () => void;
}

// 기본 중심 좌표 (서울시청)
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };
const DEFAULT_LEVEL = 9;

// 좌표 비교 함수 (작은 오차 무시)
const isSameCoord = (coord1: { lat: number; lng: number }, coord2: { lat: number; lng: number }): boolean => {
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
  
  // 상태 업데이트 함수 - 중복 업데이트 방지 로직 추가
  setCenter: (center: { lat: number; lng: number }) => {
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
})); 