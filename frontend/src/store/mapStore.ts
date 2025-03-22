import { create } from 'zustand'

// 지도 상태 인터페이스
interface MapState {
  // 지도 중심 좌표
  center: { lat: number; lng: number };
  // 지도 줌 레벨
  level: number;
  // 상태 업데이트 함수
  setCenter: (center: { lat: number; lng: number }) => void;
  setLevel: (level: number) => void;
  resetMapState: () => void;
}

// 기본 중심 좌표 (서울시청)
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };
const DEFAULT_LEVEL = 9;

// 지도 상태 저장소 생성
export const useMapStore = create<MapState>((set) => ({
  // 초기 상태
  center: DEFAULT_CENTER,
  level: DEFAULT_LEVEL,
  
  // 상태 업데이트 함수
  setCenter: (center: { lat: number; lng: number }) => set({ center }),
  setLevel: (level: number) => set({ level }),
  resetMapState: () => set({ center: DEFAULT_CENTER, level: DEFAULT_LEVEL }),
})); 