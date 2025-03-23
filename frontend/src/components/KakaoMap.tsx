'use client'

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMapStore } from '@/store/mapStore';

export type MarkerCategory = 'restaurant' | 'cafe' | 'attraction' | 'culture' | 'shopping' | 'transport' | 'recommendation' | 'chat_location' | 'default';

interface KakaoMapProps {
  width?: string;
  height?: string;
  center?: { lat: number; lng: number };
  level?: number;
  markers?: Array<{ 
    lat: number; 
    lng: number; 
    title: string;
    content?: string;
    category?: MarkerCategory;
    order?: number; // 동선에서의 순서
  }>;
  polyline?: Array<{ lat: number; lng: number }>;
  polylineColor?: string;
  polylineOpacity?: number;
  useStaticMap?: boolean;
  mapTypeId?: string;
  onClick?: (lat: number, lng: number) => void;
}

const CategoryColors = {
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

declare global {
  interface Window {
    kakao: any;
  }
}

// 카카오맵 API가 로드되었는지 확인하는 함수
const isKakaoMapLoaded = () => {
  return typeof window !== 'undefined' && window.kakao && window.kakao.maps;
};

// DOM이 준비되었고 요소가 문서에 연결되어 있는지 확인하는 함수
const isDomElementReady = (element: HTMLDivElement | null): boolean => {
  if (!element) return false;
  if (!document.body) return false;
  
  // 요소가 document에 연결되어 있는지 확인
  if (!document.body.contains(element)) return false;
  
  // 요소의 크기가 유효한지 확인
  if (element.clientWidth <= 0 || element.clientHeight <= 0) return false;
  
  return true;
};

// SVG를 안전하게 Base64로 인코딩하는 함수
const safeBase64Encode = (str: string): string => {
  try {
    // UTF-8로 인코딩하여 처리
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => 
      String.fromCharCode(parseInt(p1, 16))
    ));
  } catch (e) {
    console.error('SVG Base64 인코딩 오류:', e);
    // 오류 발생 시 기본 마커용 간단한 SVG 반환
    const fallbackSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2563EB" stroke="white" stroke-width="2"/></svg>';
    return btoa(fallbackSvg);
  }
};

// 디바운스 함수 구현
function debounce<F extends (...args: any[]) => any>(func: F, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<F>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// 전역 변수로 스크립트 로드 상태와 지도 인스턴스를 관리
let isScriptInjected = false;
let globalMapInstance: any = null;
// 프로그래밍 방식의 변경 여부를 추적하는 전역 플래그
let isGlobalProgrammaticChange = false;
// 지도 초기화 중인지 추적하는 플래그 추가
let isInitializing = false;
// 스크립트 로드 시간 추적
let scriptLoadTimestamp = 0;
// 지도 인스턴스 마운트 상태
let isMapMounted = false;
// 인스턴스 카운터 - 중복 인스턴스 방지용
let instanceId = 0;
// DOM에 이미 추가된 폴리라인 추적 맵
const polylineInstances = new Map<number, any[]>();

export default function KakaoMap({
  width = '100%',
  height = '400px',
  center: propCenter,
  level: propLevel,
  markers = [],
  polyline = [],
  polylineColor = '#3B82F6',
  polylineOpacity = 0.7,
  useStaticMap = false,
  mapTypeId = 'ROADMAP',
  onClick
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polylineInstance, setPolylineInstance] = useState<any>(null);
  
  // 이벤트 리스너 참조를 저장하기 위한 ref
  const idleListenerRef = useRef<any>(null);
  
  // 마지막 업데이트 시간 추적
  const lastUpdateRef = useRef<number>(0);
  
  // zustand 상태에서 지도 정보 가져오기
  const mapStore = useMapStore();
  
  // props에 주어진 중심 좌표나 줌 레벨이 있으면 우선 사용, 없으면 저장소에서 가져옴
  const center = propCenter || mapStore.center;
  const level = propLevel || mapStore.level;
  
  // 디바운스 상태 업데이트 함수 - 더 짧은 대기 시간 적용 (100ms)
  const debouncedUpdateStore = useCallback(
    debounce((newCenter: { lat: number; lng: number }, newLevel: number) => {
      const now = Date.now();
      // 프로그래밍 방식 변경이거나 마지막 업데이트 이후 시간이 너무 짧으면 무시
      if (isGlobalProgrammaticChange || now - lastUpdateRef.current < 200) return;
      
      lastUpdateRef.current = now;
      // 스토어 상태 업데이트
      mapStore.setCenter(newCenter);
      mapStore.setLevel(newLevel);
    }, 100),
    [mapStore]
  );
  
  // 지도 초기화 함수
  const initializeMap = useCallback(() => {
    // 이미 초기화 중이면 리턴
    if (isInitializing) return;
    
    // 초기화 중 플래그 설정
    isInitializing = true;
    
    const thisInstanceId = currentInstanceId.current;
    console.log(`[KakaoMap ${thisInstanceId}] 지도 초기화 시작, DOM 준비 상태:`, !!mapRef.current);
    
    // DOM 준비 상태 확인
    if (!isDomElementReady(mapRef.current)) {
      console.log(`[KakaoMap ${thisInstanceId}] 지도 컨테이너가 준비되지 않음, 초기화 연기`);
      isInitializing = false;
      
      // 약간의 지연 후 다시 시도
      if (isMapMounted) {
        setTimeout(() => initializeMap(), 100);
      }
      return;
    }
    
    // 이미 지도 인스턴스가 있으면 재사용
    if (globalMapInstance && mapRef.current) {
      console.log(`[KakaoMap ${thisInstanceId}] 기존 지도 인스턴스를 재사용합니다.`);
      mapInstanceRef.current = globalMapInstance;
      
      try {
        // 컨테이너 엘리먼트가 DOM에 존재하는지 확인
        if (!document.body.contains(mapRef.current)) {
          console.error(`[KakaoMap ${thisInstanceId}] 지도 컨테이너가 DOM에 존재하지 않습니다!`);
          globalMapInstance = null;
          isInitializing = false;
          setTimeout(() => initializeMap(), 100);
          return;
        }
        
        // mapRef에 지도 컨테이너를 재설정
        globalMapInstance.relayout();
        
        // 지도 옵션 업데이트 - 프로그래밍 방식 변경 플래그 설정
        isGlobalProgrammaticChange = true;
        globalMapInstance.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
        globalMapInstance.setLevel(level);
        // 플래그 초기화 타이머 설정
        setTimeout(() => { isGlobalProgrammaticChange = false; }, 500);
        
        setMapLoaded(true);
        isInitializing = false;
      } catch (err) {
        console.error(`[KakaoMap ${thisInstanceId}] 지도 인스턴스 재사용 오류:`, err);
        // 오류 발생 시 전역 인스턴스 초기화
        globalMapInstance = null;
        // 새 인스턴스 생성 시도를 위해 초기화 플래그 해제
        isInitializing = false;
        // 약간의 딜레이 후 다시 시도
        setTimeout(() => initializeMap(), 100);
        return;
      }
      return;
    }
    
    if (!isKakaoMapLoaded()) {
      console.log(`[KakaoMap ${thisInstanceId}] 카카오맵 API가 로드되지 않음, 초기화 연기`);
      isInitializing = false;
      return;
    }
    
    // DOM 요소 유효성 재확인
    if (!isDomElementReady(mapRef.current)) {
      console.error(`[KakaoMap ${thisInstanceId}] 지도 컨테이너가 DOM에 연결되어 있지 않거나 크기가 유효하지 않음`);
      isInitializing = false;
      
      // 약간의 지연 후 다시 시도
      if (isMapMounted) {
        setTimeout(() => initializeMap(), 100);
      }
      return;
    }
    
    try {
      console.log(`[KakaoMap ${thisInstanceId}] 카카오맵 API가 로드되었습니다. 지도를 초기화합니다.`);
      
      // 카카오맵 API 준비 확인
      if (!window.kakao || !window.kakao.maps) {
        throw new Error("카카오맵 API가 준비되지 않았습니다.");
      }
      
      // DOM 엘리먼트 확인
      if (!mapRef.current) {
        throw new Error("지도를 표시할 DOM 엘리먼트를 찾을 수 없습니다.");
      }
      
      console.log(`[KakaoMap ${thisInstanceId}] 지도 옵션 설정 중...`);
      
      // 지도 옵션 설정
      const options = {
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level,
        // 부드러운 움직임을 위한 옵션
        draggable: true,
        zoomable: true
      };
      
      console.log(`[KakaoMap ${thisInstanceId}] 지도 인스턴스 생성 중...`);
      
      // 지도 생성 시도 - DOM 요소 검증 처리 시도
      try {
        if (!mapRef.current || mapRef.current.clientWidth === 0 || mapRef.current.clientHeight === 0) {
          throw new Error("유효하지 않은 지도 컨테이너 크기");
        }
        
        // DOM 요소가 준비되었는지 확인하는 렌더링 지연 처리
        const containerEl = mapRef.current;
        
        // 지도 옵션에 disableDoubleClick과 disableDoubleClickZoom 추가
        // (DOM 노드 오류를 줄이기 위한 조치)
        const enhancedOptions = {
          ...options,
          disableDoubleClick: true,
          disableDoubleClickZoom: true
        };
        
        // 지도 생성을 requestAnimationFrame을 통해 수행
        // DOM 렌더링 사이클과 동기화하여 DOM 조작 문제를 최소화
        requestAnimationFrame(() => {
          try {
            if (!isMapMounted || currentInstanceId.current !== thisInstanceId) {
              console.log(`[KakaoMap ${thisInstanceId}] 인스턴스 변경됨, 지도 생성 취소`);
              isInitializing = false;
              return;
            }
            
            if (!isDomElementReady(containerEl)) {
              console.error(`[KakaoMap ${thisInstanceId}] requestAnimationFrame 내에서 DOM 요소가 준비되지 않음`);
              isInitializing = false;
              
              // 약간의 지연 후 다시 시도
              if (isMapMounted) {
                setTimeout(() => initializeMap(), 100);
              }
              return;
            }
            
            // 지도 생성
            const newMapInstance = new window.kakao.maps.Map(containerEl, enhancedOptions);
            
            // 생성 즉시 재확인
            setTimeout(() => {
              try {
                // 컴포넌트가 여전히 마운트되어 있는지 확인
                if (!isMapMounted || currentInstanceId.current !== thisInstanceId) {
                  console.log(`[KakaoMap ${thisInstanceId}] 인스턴스 변경됨, 지도 생성 취소`);
                  isInitializing = false;
                  return;
                }
                
                // 생성된 지도가 유효한지 확인
                const center = newMapInstance.getCenter();
                if (!center) {
                  throw new Error("생성된 지도 인스턴스가 유효하지 않습니다.");
                }
                
                console.log(`[KakaoMap ${thisInstanceId}] 지도 인스턴스 생성 완료 및 유효성 확인됨`);
                
                // 지도가 유효함이 확인된 후에만 전역 변수에 저장
                globalMapInstance = newMapInstance;
                mapInstanceRef.current = newMapInstance;
                
                // 클릭 이벤트 등록
                if (onClick) {
                  console.log(`[KakaoMap ${thisInstanceId}] 클릭 이벤트 등록 중...`);
                  window.kakao.maps.event.addListener(newMapInstance, 'click', function(mouseEvent: any) {
                    const latlng = mouseEvent.latLng;
                    onClick(latlng.getLat(), latlng.getLng());
                  });
                }
                
                // 이전 이벤트 리스너가 있으면 제거
                if (idleListenerRef.current) {
                  console.log(`[KakaoMap ${thisInstanceId}] 이전 이벤트 리스너 제거 중...`);
                  try {
                    window.kakao.maps.event.removeListener(idleListenerRef.current);
                  } catch (e) {
                    console.error(`[KakaoMap ${thisInstanceId}] 이전 리스너 제거 오류`, e);
                  }
                }
                
                // idle 이벤트 리스너 추가 (지도 이동 및 확대/축소가 완료되었을 때 발생)
                console.log(`[KakaoMap ${thisInstanceId}] idle 이벤트 리스너 등록 중...`);
                const idleListener = window.kakao.maps.event.addListener(newMapInstance, 'idle', function() {
                  // 프로그래밍 방식 변경이면 이벤트 무시
                  if (isGlobalProgrammaticChange) return;
                  
                  // 현재 지도 상태 가져오기
                  const latlng = newMapInstance.getCenter();
                  const newCenter = { lat: latlng.getLat(), lng: latlng.getLng() };
                  const newLevel = newMapInstance.getLevel();
                  
                  // 상태 업데이트 (디바운스 처리)
                  debouncedUpdateStore(newCenter, newLevel);
                });
                
                // 이벤트 리스너 참조 저장
                idleListenerRef.current = idleListener;
                
                // 지도 로드 완료 표시
                setMapLoaded(true);
                console.log(`[KakaoMap ${thisInstanceId}] 지도 인스턴스가 생성되고 이벤트 리스너가 등록되었습니다.`);
              } catch (validationErr) {
                console.error(`[KakaoMap ${thisInstanceId}] 지도 인스턴스 유효성 검증 실패:`, validationErr);
                globalMapInstance = null;
                isInitializing = false;
                
                // 약간의 딜레이 후 다시 시도
                setTimeout(() => {
                  if (isMapMounted && currentInstanceId.current === thisInstanceId) {
                    initializeMap();
                  }
                }, 200);
              }
            }, 50);
          } catch (animFrameErr) {
            console.error(`[KakaoMap ${thisInstanceId}] requestAnimationFrame 내 지도 생성 오류:`, animFrameErr);
            isInitializing = false;
            
            // 약간의 지연 후 다시 시도
            setTimeout(() => {
              if (isMapMounted && currentInstanceId.current === thisInstanceId) {
                initializeMap();
              }
            }, 200);
          }
        });
      } catch (mapCreateErr) {
        console.error(`[KakaoMap ${thisInstanceId}] 지도 인스턴스 생성 오류:`, mapCreateErr);
        // 약간의 지연 후 다시 시도
        setTimeout(() => {
          if (isMapMounted && currentInstanceId.current === thisInstanceId) {
            globalMapInstance = null;
            isInitializing = false;
            initializeMap();
          }
        }, 200);
        return;
      }
    } catch (err) {
      console.error(`[KakaoMap ${thisInstanceId}] 지도 초기화 오류:`, err);
      setError('지도를 초기화하는 중 오류가 발생했습니다.');
      // 오류 발생 시 전역 인스턴스 초기화
      globalMapInstance = null;
    } finally {
      // 초기화 완료 플래그 설정
      console.log(`[KakaoMap ${thisInstanceId}] 지도 초기화 과정 완료`);
      isInitializing = false;
    }
  }, [center, level, onClick, debouncedUpdateStore]);
  
  const currentInstanceId = useRef<number>(0);
  
  // 컴포넌트 마운트 시 고유 ID 할당
  useEffect(() => {
    currentInstanceId.current = ++instanceId;
    console.log(`[KakaoMap] 컴포넌트 마운트 (인스턴스 ID: ${currentInstanceId.current})`);
    isMapMounted = true;
    
    // 언마운트 시 클린업
    return () => {
      console.log(`[KakaoMap] 컴포넌트 언마운트 (인스턴스 ID: ${currentInstanceId.current})`);
      isMapMounted = false;
    };
  }, []);

  // 카카오맵 API 로드
  useEffect(() => {
    // 안전장치: 컴포넌트가 마운트된 상태에서만 상태 업데이트
    let isMounted = true;
    const thisInstanceId = currentInstanceId.current;
    
    const loadKakaoMap = async () => {
      console.log(`[KakaoMap ${thisInstanceId}] 지도 로드 시작, API 로드 상태:`, isKakaoMapLoaded());
      
      // DOM이 완전히 준비되었는지 확인
      if (!document.body) {
        console.log(`[KakaoMap ${thisInstanceId}] DOM이 아직 완전히 준비되지 않음, 잠시 후 재시도`);
        setTimeout(loadKakaoMap, 50);
        return;
      }
      
      // 이미 API가 로드되었는지 확인
      if (isKakaoMapLoaded()) {
        console.log(`[KakaoMap ${thisInstanceId}] API가 이미 로드되어 있음, 지도 초기화 시작`);
        
        // DOM이 완전히 준비된 후 초기화 시작
        setTimeout(() => {
          if (isMounted && thisInstanceId === currentInstanceId.current) {
            initializeMap();
          }
        }, 100);
        return;
      }
      
      // 스크립트가 이미 주입되었는지 확인
      if (isScriptInjected) {
        console.log(`[KakaoMap ${thisInstanceId}] 스크립트가 이미 주입됨, 로드 완료 대기 중...`);
        // 스크립트가 이미 주입되었지만 아직 로드되지 않은 경우
        let waitAttempts = 0;
        const maxAttempts = 20; // 최대 대기 시도 횟수
        
        const waitForKakao = setInterval(() => {
          // 현재 인스턴스가 여전히 유효한지 확인
          if (thisInstanceId !== currentInstanceId.current) {
            console.log(`[KakaoMap ${thisInstanceId}] 대기 중 다른 인스턴스 감지됨, 로드 취소`);
            clearInterval(waitForKakao);
            return;
          }
          
          waitAttempts++;
          console.log(`[KakaoMap ${thisInstanceId}] API 로드 대기 중... (${waitAttempts}/${maxAttempts})`);
          
          if (isKakaoMapLoaded()) {
            clearInterval(waitForKakao);
            console.log(`[KakaoMap ${thisInstanceId}] 대기 후 API 로드 확인됨`);
            
            if (isMounted && thisInstanceId === currentInstanceId.current) {
              try {
                console.log(`[KakaoMap ${thisInstanceId}] 지도 SDK 초기화 시작`);
                
                // DOM이 완전히 준비된 후 초기화 시작
                setTimeout(() => {
                  try {
                    if (isMounted && thisInstanceId === currentInstanceId.current) {
                      window.kakao.maps.load(() => {
                        if (isMounted && thisInstanceId === currentInstanceId.current) {
                          console.log(`[KakaoMap ${thisInstanceId}] 지도 SDK 초기화 완료, 지도 인스턴스 생성 시작`);
                          
                          // 약간의 지연 후 초기화 시작 - DOM 준비 보장
                          setTimeout(() => {
                            if (isMounted && thisInstanceId === currentInstanceId.current) {
                              initializeMap();
                            } else {
                              console.log(`[KakaoMap ${thisInstanceId}] SDK 초기화 완료 후 타이머에서 인스턴스 불일치`);
                            }
                          }, 50);
                        } else {
                          console.log(`[KakaoMap ${thisInstanceId}] SDK 초기화 완료 후 인스턴스 불일치`);
                        }
                      });
                    }
                  } catch (err) {
                    console.error(`[KakaoMap ${thisInstanceId}] SDK 로드 타이머 오류:`, err);
                  }
                }, 50);
              } catch (err) {
                console.error(`[KakaoMap ${thisInstanceId}] 카카오맵 로드 오류:`, err);
                isScriptInjected = false; // 실패 시 다시 시도할 수 있도록 플래그 초기화
                
                if (isMounted && thisInstanceId === currentInstanceId.current) {
                  setError('카카오맵 API 로드에 실패했습니다. 새로고침 해주세요.');
                }
              }
            } else {
              console.log(`[KakaoMap ${thisInstanceId}] 로드됨 상태 감지 후 인스턴스 불일치`);
            }
          } else if (waitAttempts >= maxAttempts) {
            // 최대 시도 횟수를 초과하면 포기
            clearInterval(waitForKakao);
            console.error(`[KakaoMap ${thisInstanceId}] 카카오맵 API 로드 타임아웃`);
            
            // 스크립트 로드 시간이 오래 지났으면 다시 로드 시도
            const currentTime = Date.now();
            if (currentTime - scriptLoadTimestamp > 10000) { // 10초 이상 지났으면
              console.log(`[KakaoMap ${thisInstanceId}] 스크립트 재로드 시도`);
              isScriptInjected = false;
              
              if (isMounted && thisInstanceId === currentInstanceId.current) {
                // 약간의 지연 후 다시 로드 시도
                setTimeout(() => {
                  if (thisInstanceId === currentInstanceId.current) {
                    loadKakaoMap();
                  }
                }, 1000);
              }
            } else {
              isScriptInjected = false; // 다음 시도를 위해 재설정
              
              if (isMounted && thisInstanceId === currentInstanceId.current) {
                setError('카카오맵 API 로드 타임아웃. 새로고침 해주세요.');
              }
            }
          }
        }, 300); // 타이머 간격 늘림
        
        return () => {
          clearInterval(waitForKakao);
        };
      }
      
      // 스크립트 주입
      isScriptInjected = true;
      scriptLoadTimestamp = Date.now();
      console.log(`[KakaoMap ${thisInstanceId}] 카카오맵 API 스크립트 주입 시작:`, scriptLoadTimestamp);
      
      try {
        // DOM이 준비되었는지 확인
        if (!document.body || !document.head) {
          console.log(`[KakaoMap ${thisInstanceId}] DOM이 완전히 준비되지 않음, 스크립트 주입 취소`);
          isScriptInjected = false;
          
          // 약간의 지연 후 다시 시도
          setTimeout(() => {
            if (isMounted && thisInstanceId === currentInstanceId.current) {
              loadKakaoMap();
            }
          }, 100);
          return;
        }
        
        // 인스턴스가 변경되었는지 확인
        if (thisInstanceId !== currentInstanceId.current) {
          console.log(`[KakaoMap ${thisInstanceId}] 스크립트 주입 전 다른 인스턴스 감지됨, 로드 취소`);
          isScriptInjected = false;
          return;
        }
        
        return new Promise<void>((resolve, reject) => {
          // 이전 스크립트 태그가 있으면 제거 (충돌 방지)
          const existingScript = document.querySelector('script[src*="dapi.kakao.com/v2/maps/sdk.js"]');
          if (existingScript) {
            console.log(`[KakaoMap ${thisInstanceId}] 기존 스크립트 태그 제거`);
            existingScript.remove();
          }
          
          const script = document.createElement('script');
          script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false&libraries=services,clusterer,drawing`;
          script.async = true;
          script.id = 'kakao-map-sdk';
          script.crossOrigin = 'anonymous'; // CORS 이슈 방지
          
          // 스크립트 로드 완료 후 처리
          script.onload = () => {
            console.log(`[KakaoMap ${thisInstanceId}] 카카오맵 API 스크립트 로드 완료`);
            
            if (isMounted && thisInstanceId === currentInstanceId.current) {
              try {
                console.log(`[KakaoMap ${thisInstanceId}] 지도 SDK 초기화 중...`);
                
                // DOM이 완전히 준비된 후 초기화 시작
                setTimeout(() => {
                  try {
                    if (isMounted && thisInstanceId === currentInstanceId.current) {
                      window.kakao.maps.load(() => {
                        if (isMounted && thisInstanceId === currentInstanceId.current) {
                          console.log(`[KakaoMap ${thisInstanceId}] 지도 SDK 초기화 완료, 지도 인스턴스 생성 시작`);
                          
                          // 약간의 지연 후 초기화 시작 - DOM 준비 보장
                          setTimeout(() => {
                            if (isMounted && thisInstanceId === currentInstanceId.current) {
                              initializeMap();
                              resolve();
                            } else {
                              console.log(`[KakaoMap ${thisInstanceId}] SDK 초기화 완료 후 타이머에서 인스턴스 불일치, 초기화 건너뜀`);
                              resolve();
                            }
                          }, 50);
                        } else {
                          console.log(`[KakaoMap ${thisInstanceId}] SDK 초기화 완료 후 인스턴스 불일치, 초기화 건너뜀`);
                          resolve();
                        }
                      });
                    } else {
                      resolve();
                    }
                  } catch (err) {
                    console.error(`[KakaoMap ${thisInstanceId}] SDK 로드 타이머 오류:`, err);
                    reject(err);
                  }
                }, 50);
              } catch (err) {
                console.error(`[KakaoMap ${thisInstanceId}] 카카오맵 로드 오류:`, err);
                isScriptInjected = false;
                reject(err);
              }
            } else {
              // 다른 인스턴스로 전환되었으므로 정리 작업만 수행
              console.log(`[KakaoMap ${thisInstanceId}] 스크립트 로드됨 상태에서 인스턴스 불일치 감지`);
              resolve();
            }
          };
          
          script.onerror = (e) => {
            console.error(`[KakaoMap ${thisInstanceId}] 카카오맵 API 스크립트 로드 실패`, e);
            
            if (isMounted && thisInstanceId === currentInstanceId.current) {
              setError('카카오맵 API 로드에 실패했습니다.');
              isScriptInjected = false; // 다음 시도를 위해 재설정
              reject(e);
            } else {
              reject("인스턴스 불일치");
            }
          };
          
          // 스크립트를 body 마지막에 추가 (head 대신)
          document.body.appendChild(script);
        });
      } catch (err) {
        console.error(`[KakaoMap ${thisInstanceId}] 스크립트 로드 에러:`, err);
        isScriptInjected = false;
        if (isMounted && thisInstanceId === currentInstanceId.current) {
          setError('카카오맵 API 로드에 실패했습니다.');
        }
      }
    };
    
    // 약간의 지연 후 로드 시작 - DOM 준비 보장
    setTimeout(() => {
      if (isMounted && thisInstanceId === currentInstanceId.current) {
        loadKakaoMap();
      }
    }, 50);
    
    // 클린업 함수
    return () => {
      console.log(`[KakaoMap ${thisInstanceId}] 로드 효과 클린업`);
      isMounted = false;
    };
  }, [initializeMap]);
  
  // props로 전달된 중심점, 레벨 등이 변경되면 지도 업데이트
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;
    
    try {
      // props로 전달된 center와 level만 처리
      if (propCenter) {
        // 프로그래밍 방식 변경임을 표시
        isGlobalProgrammaticChange = true;
        
        // 부드러운 움직임을 위해 panTo 사용 (중심 변경)
        map.panTo(new window.kakao.maps.LatLng(propCenter.lat, propCenter.lng));
        
        // 약간의 지연 후 플래그 초기화
        setTimeout(() => { isGlobalProgrammaticChange = false; }, 1000);
      }
      
      if (propLevel !== undefined) {
        // 프로그래밍 방식 변경임을 표시
        isGlobalProgrammaticChange = true;
        
        // 부드러운 움직임을 위해 setLevel에 animate: true 옵션 사용
        map.setLevel(propLevel, {animate: true});
        
        // 약간의 지연 후 플래그 초기화
        setTimeout(() => { isGlobalProgrammaticChange = false; }, 1000);
      }
    } catch (err) {
      console.error('지도 업데이트 오류:', err);
    }
  }, [propCenter, propLevel, mapLoaded]);
  
  // 마커와 동선 업데이트
  useEffect(() => {
    const map = mapInstanceRef.current;
    const thisInstanceId = currentInstanceId.current;
    
    if (!map || !mapLoaded || !window.kakao) {
      console.log(`[KakaoMap ${thisInstanceId}] 마커/동선 업데이트 건너뜀 - 지도 미로드 상태`);
      return;
    }
    
    console.log(`[KakaoMap ${thisInstanceId}] 마커와 동선 업데이트 시작`);
    
    // 마커와 폴리라인 관리를 위한 클린업 함수
    let cleanup = () => {};
    
    try {
      // 기존 오버레이 제거
      try {
        map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.TRAFFIC);
        map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.BICYCLE);
        map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.TERRAIN);
        map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
      } catch (overlayErr) {
        console.error('[KakaoMap] 오버레이 제거 오류:', overlayErr);
      }
      
      // 기존 마커와 인포윈도우 제거를 위한 변수
      const mapMarkers: any[] = [];
      const infoWindows: any[] = [];
      
      // 마커 추가
      markers.forEach((markerData, index) => {
        try {
          const position = new window.kakao.maps.LatLng(markerData.lat, markerData.lng);
          
          // 마커 색상 결정
          const category = markerData.category || 'default';
          
          // 순서가 있는 경우 번호 마커 사용
          let markerImage;
          
          if (markerData.order !== undefined) {
            // 순서가 있는 경우 - 번호 표시 마커
            const categoryColor = CategoryColors[category] || CategoryColors.default;
            
            // 원형 마커에 번호 표시하는 SVG 생성
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="${categoryColor}" stroke="white" stroke-width="2"/>
              <text x="18" y="23" font-family="Arial" font-size="16" font-weight="bold" fill="white" text-anchor="middle">
                ${markerData.order + 1}
              </text>
            </svg>`;
            
            // 안전한 Base64 인코딩 사용
            const svgBase64 = safeBase64Encode(svg);
            
            // 마커 이미지 생성
            markerImage = new window.kakao.maps.MarkerImage(
              `data:image/svg+xml;base64,${svgBase64}`,
              new window.kakao.maps.Size(36, 36),
              { offset: new window.kakao.maps.Point(18, 18) }
            );
          } else {
            // 순서가 없는 일반 마커
            const categoryColor = CategoryColors[category] || CategoryColors.default;
            
            // 단순 원형 마커 SVG
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="${categoryColor}" stroke="white" stroke-width="2"/>
            </svg>`;
            
            // 안전한 Base64 인코딩 사용
            const svgBase64 = safeBase64Encode(svg);
            
            // 마커 이미지 생성
            markerImage = new window.kakao.maps.MarkerImage(
              `data:image/svg+xml;base64,${svgBase64}`,
              new window.kakao.maps.Size(24, 24),
              { offset: new window.kakao.maps.Point(12, 12) }
            );
          }
          
          // 마커 생성
          const marker = new window.kakao.maps.Marker({
            position: position,
            map: map,
            title: markerData.title,
            image: markerImage
          });
          
          mapMarkers.push(marker);
          
          // 마커에 표시할 인포윈도우 생성
          const infoContent = markerData.content || 
            `<div style="padding:5px;font-size:12px;width:150px;">
              <strong>${markerData.title}</strong>
              ${markerData.order !== undefined ? `<br><span style="color:#3B82F6">순서: ${markerData.order + 1}</span>` : ''}
             </div>`;
             
          const infowindow = new window.kakao.maps.InfoWindow({
            content: infoContent
          });
          
          infoWindows.push(infowindow);
          
          // 마커에 마우스오버 이벤트 등록
          window.kakao.maps.event.addListener(marker, 'mouseover', function() {
            infowindow.open(map, marker);
          });
          
          // 마커에 마우스아웃 이벤트 등록
          window.kakao.maps.event.addListener(marker, 'mouseout', function() {
            infowindow.close();
          });
          
          // 마커 클릭 이벤트
          window.kakao.maps.event.addListener(marker, 'click', function() {
            // 모든 인포윈도우 닫기
            infoWindows.forEach(info => info.close());
            // 클릭한 마커의 인포윈도우 열기
            infowindow.open(map, marker);
          });
        } catch (markerErr) {
          console.error('[KakaoMap] 마커 생성 오류:', markerErr);
        }
      });
      
      // 이전 폴리라인 정리
      if (polylineInstance) {
        try {
          console.log("[KakaoMap] 기존 폴리라인 제거");
          polylineInstance.setMap(null);
          setPolylineInstance(null);
        } catch (polyErr) {
          console.error('[KakaoMap] 폴리라인 제거 오류:', polyErr);
        }
      }
      
      // 경로선 추가
      if (polyline.length > 1) {
        try {
          console.log(`[KakaoMap ${thisInstanceId}] 폴리라인 생성 시작 - 포인트 수: ${polyline.length}`);
          
          // 지도 인스턴스 유효성 검사
          if (!map || typeof map.getCenter !== 'function') {
            console.error(`[KakaoMap ${thisInstanceId}] 유효하지 않은 지도 인스턴스:`, map);
            return;
          }
          
          // 유효한 좌표인지 확인 - 더 엄격한 검증으로 변경
          const validPoints = polyline.filter((point: { lat: number; lng: number }) => 
            typeof point.lat === 'number' && !isNaN(point.lat) && 
            typeof point.lng === 'number' && !isNaN(point.lng) &&
            point.lat >= -90 && point.lat <= 90 && 
            point.lng >= -180 && point.lng <= 180
          );
          
          if (validPoints.length !== polyline.length) {
            console.error(`[KakaoMap ${thisInstanceId}] 유효하지 않은 좌표가 필터링되었습니다:`, 
              polyline.filter((p: { lat: number; lng: number }) => 
                typeof p.lat !== 'number' || isNaN(p.lat) || 
                typeof p.lng !== 'number' || isNaN(p.lng) ||
                p.lat < -90 || p.lat > 90 || 
                p.lng < -180 || p.lng > 180
              )
            );
          }
          
          if (validPoints.length < 2) {
            console.error(`[KakaoMap ${thisInstanceId}] 유효한 좌표가 너무 적습니다:`, validPoints.length);
            return;
          }
          
          // 안전하게 좌표 생성
          const path = validPoints.map((point: { lat: number; lng: number }) => 
            new window.kakao.maps.LatLng(point.lat, point.lng)
          );
          
          console.log(`[KakaoMap ${thisInstanceId}] 경로 좌표 생성 완료, 폴리라인 객체 생성 준비`);
          
          // 더블 체크: 지도 인스턴스가 유효한지
          if (!isMapMounted || !map || !window.kakao || thisInstanceId !== currentInstanceId.current) {
            console.log(`[KakaoMap ${thisInstanceId}] 폴리라인 생성 취소 - 지도가 더 이상 유효하지 않음`);
            return;
          }
          
          // 이전 폴리라인 정리 - 더 철저하게 정리
          // 먼저 단일 인스턴스 정리
          if (polylineInstance) {
            try {
              polylineInstance.setMap(null);
              setPolylineInstance(null);
            } catch (err) {
              console.error(`[KakaoMap ${thisInstanceId}] 단일 폴리라인 제거 오류:`, err);
            }
          }
          
          // 폴리라인 세그먼트 정리
          if (polylineInstances.has(thisInstanceId)) {
            try {
              const previousSegments = polylineInstances.get(thisInstanceId) || [];
              console.log(`[KakaoMap ${thisInstanceId}] 이전에 생성된 ${previousSegments.length}개의 세그먼트 제거`);
              
              previousSegments.forEach((segment, idx) => {
                try {
                  segment.setMap(null);
                } catch (e) {
                  console.error(`[KakaoMap ${thisInstanceId}] 이전 세그먼트 ${idx} 제거 오류:`, e);
                }
              });
              
              polylineInstances.delete(thisInstanceId);
            } catch (cleanupErr) {
              console.error(`[KakaoMap ${thisInstanceId}] 이전 폴리라인 정리 오류:`, cleanupErr);
            }
          }
          
          // 세그먼트 방식으로 폴리라인 생성 - DOM 조작 오류 방지를 위한 안전한 방법
          console.log(`[KakaoMap ${thisInstanceId}] 세그먼트 방식으로 폴리라인 생성...`);
          
          const segments: any[] = [];
          const currentSegments: any[] = [];
          
          const processSegment = (index: number) => {
            if (index >= path.length - 1 || !isMapMounted || thisInstanceId !== currentInstanceId.current) {
              // 모든 세그먼트 처리 완료 또는 컴포넌트 언마운트됨
              if (segments.length > 0) {
                console.log(`[KakaoMap ${thisInstanceId}] ${segments.length} 세그먼트로 폴리라인 생성 완료`);
                
                // 인스턴스 맵에 저장
                polylineInstances.set(thisInstanceId, segments);
                
                // 클린업 함수 업데이트
                const originalCleanup = cleanup;
                cleanup = () => {
                  originalCleanup();
                  segments.forEach((segment, idx) => {
                    try {
                      segment.setMap(null);
                    } catch (e) {
                      console.error(`[KakaoMap ${thisInstanceId}] 세그먼트 ${idx} 제거 오류:`, e);
                    }
                  });
                  
                  // 인스턴스 맵에서 제거
                  polylineInstances.delete(thisInstanceId);
                };
              }
              return;
            }
            
            try {
              // 컴포넌트가 여전히 마운트되어 있고 인스턴스가 유효한지 확인
              if (!isMapMounted || thisInstanceId !== currentInstanceId.current) {
                console.log(`[KakaoMap ${thisInstanceId}] 처리 중단 - 컴포넌트가 더 이상 유효하지 않음`);
                return;
              }
              
              // 지도 인스턴스가 여전히 유효한지 확인
              if (!map || typeof map.getCenter !== 'function') {
                console.error(`[KakaoMap ${thisInstanceId}] 지도 인스턴스가 더 이상 유효하지 않음`);
                return;
              }
              
              const segmentPath = [path[index], path[index + 1]];
              const segment = new window.kakao.maps.Polyline({
                path: segmentPath,
                strokeWeight: 5,
                strokeColor: polylineColor,
                strokeOpacity: polylineOpacity,
                strokeStyle: 'solid'
              });
              
              // 작은 지연 후 지도에 세그먼트 추가
              setTimeout(() => {
                try {
                  if (isMapMounted && thisInstanceId === currentInstanceId.current) {
                    segment.setMap(map);
                    segments.push(segment);
                    currentSegments.push(segment);
                    
                    // 다음 세그먼트 처리
                    setTimeout(() => processSegment(index + 1), 10);
                  }
                } catch (setErr) {
                  console.error(`[KakaoMap ${thisInstanceId}] 세그먼트 ${index} 지도 설정 오류:`, setErr);
                  // 계속 진행
                  setTimeout(() => processSegment(index + 1), 10);
                }
              }, 10);
            } catch (segErr) {
              console.error(`[KakaoMap ${thisInstanceId}] 세그먼트 ${index} 생성 실패:`, segErr);
              // 오류가 발생해도 다음 세그먼트로 계속 진행
              setTimeout(() => processSegment(index + 1), 10);
            }
          };
          
          // 세그먼트 처리 시작 - 약간의 지연 후 시작
          setTimeout(() => {
            if (isMapMounted && thisInstanceId === currentInstanceId.current) {
              processSegment(0);
            }
          }, 50);
          
        } catch (polyErr) {
          console.error(`[KakaoMap ${thisInstanceId}] 폴리라인 생성 오류:`, polyErr);
        }
      } else {
        console.log(`[KakaoMap ${thisInstanceId}] 폴리라인 생성 건너뜀 - 좌표가 충분하지 않음:`, polyline.length);
      }
      
      // 마커 클린업 함수 업데이트
      const originalCleanup = cleanup;
      cleanup = () => {
        originalCleanup();
        try {
          console.log(`[KakaoMap ${thisInstanceId}] 마커 제거 중...`);
          mapMarkers.forEach(marker => {
            try {
              marker.setMap(null);
            } catch (e) {
              console.error(`[KakaoMap ${thisInstanceId}] 마커 제거 오류:`, e);
            }
          });
        } catch (e) {
          console.error(`[KakaoMap ${thisInstanceId}] 마커 정리 오류:`, e);
        }
      };
    } catch (err) {
      console.error(`[KakaoMap ${thisInstanceId}] 마커 및 동선 설정 오류:`, err);
    }
    
    // 컴포넌트 언마운트 시 마커와 이벤트 정리
    return () => {
      try {
        console.log(`[KakaoMap ${thisInstanceId}] 마커/동선 정리 시작`);
        cleanup();
      } catch (cleanupErr) {
        console.error(`[KakaoMap ${thisInstanceId}] 정리 과정 오류:`, cleanupErr);
      }
    };
  }, [markers, polyline, polylineColor, polylineOpacity, mapLoaded]);

  // 윈도우 크기 변경 시 지도 크기 조정
  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.relayout();
        } catch (err) {
          console.error('지도 레이아웃 재조정 오류:', err);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 컴포넌트 언마운트 시 전역 변수 정리
  useEffect(() => {
    // 컴포넌트 마운트 표시
    isMapMounted = true;
    
    return () => {
      // 컴포넌트가 언마운트될 때 이벤트 리스너 제거
      if (idleListenerRef.current && globalMapInstance) {
        try {
          console.log("[KakaoMap] 컴포넌트 언마운트 시 이벤트 리스너 제거");
          window.kakao?.maps?.event.removeListener(idleListenerRef.current);
          idleListenerRef.current = null;
        } catch (err) {
          console.error('[KakaoMap] 이벤트 리스너 제거 오류:', err);
        }
      }
      
      // 이 인스턴스의 폴리라인 제거
      try {
        const thisInstanceId = currentInstanceId.current;
        if (polylineInstances.has(thisInstanceId)) {
          const segments = polylineInstances.get(thisInstanceId) || [];
          console.log(`[KakaoMap] 컴포넌트 언마운트 시 ${segments.length}개 폴리라인 제거`);
          
          segments.forEach((segment) => {
            try {
              segment.setMap(null);
            } catch (e) {
              // 오류 무시
            }
          });
          
          polylineInstances.delete(thisInstanceId);
        }
      } catch (e) {
        // 오류 무시
      }
      
      // 컴포넌트 언마운트 표시
      isMapMounted = false;
      
      // 지도 인스턴스도 정리 - 페이지 전환 시 메모리 누수 방지
      if (globalMapInstance) {
        try {
          // 참조를 끊어 가비지 컬렉션이 가능하게 함
          setTimeout(() => {
            if (!isMapMounted) {
              // 지도 인스턴스가 더 이상 사용되지 않으면 초기화
              console.log("[KakaoMap] 지도 인스턴스 정리");
              globalMapInstance = null;
            }
          }, 300);
        } catch (e) {
          // 오류 무시
        }
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
        className={`${!mapLoaded ? 'bg-gray-100' : ''} z-10`}
      />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 z-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
    </div>
  );
} 