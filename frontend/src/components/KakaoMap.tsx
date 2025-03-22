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
    // 이미 지도 인스턴스가 있으면 재사용
    if (globalMapInstance && mapRef.current) {
      console.log("기존 지도 인스턴스를 재사용합니다.");
      mapInstanceRef.current = globalMapInstance;
      
      // mapRef에 지도 컨테이너를 재설정
      globalMapInstance.relayout();
      
      // 지도 옵션 업데이트 - 프로그래밍 방식 변경 플래그 설정
      isGlobalProgrammaticChange = true;
      globalMapInstance.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      globalMapInstance.setLevel(level);
      // 플래그 초기화 타이머 설정
      setTimeout(() => { isGlobalProgrammaticChange = false; }, 500);
      
      setMapLoaded(true);
      return;
    }
    
    if (!mapRef.current || !isKakaoMapLoaded()) return;
    
    try {
      console.log("카카오맵 API가 로드되었습니다. 지도를 초기화합니다.");
      
      // 지도 옵션 설정
      const options = {
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level,
        // 부드러운 움직임을 위한 옵션
        draggable: true,
        zoomable: true
      };
      
      // 지도 생성
      const newMapInstance = new window.kakao.maps.Map(mapRef.current, options);
      
      // 전역 변수에 저장
      globalMapInstance = newMapInstance;
      mapInstanceRef.current = newMapInstance;
      
      // 클릭 이벤트 등록
      if (onClick) {
        window.kakao.maps.event.addListener(newMapInstance, 'click', function(mouseEvent: any) {
          const latlng = mouseEvent.latLng;
          onClick(latlng.getLat(), latlng.getLng());
        });
      }
      
      // 이전 이벤트 리스너가 있으면 제거
      if (idleListenerRef.current) {
        window.kakao.maps.event.removeListener(idleListenerRef.current);
      }
      
      // idle 이벤트 리스너 추가 (지도 이동 및 확대/축소가 완료되었을 때 발생)
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
      
      setMapLoaded(true);
      console.log("지도 인스턴스가 생성되었습니다.");
    } catch (err) {
      console.error('지도 초기화 오류:', err);
      setError('지도를 초기화하는 중 오류가 발생했습니다.');
    }
  }, [center, level, onClick, debouncedUpdateStore]);
  
  // 카카오맵 API 로드
  useEffect(() => {
    // 안전장치: 컴포넌트가 마운트된 상태에서만 상태 업데이트
    let isMounted = true;
    
    const loadKakaoMap = async () => {
      // 이미 API가 로드되었는지 확인
      if (isKakaoMapLoaded()) {
        initializeMap();
        return;
      }
      
      // 스크립트가 이미 주입되었는지 확인
      if (isScriptInjected) {
        // 스크립트가 이미 주입되었지만 아직 로드되지 않은 경우
        const waitForKakao = setInterval(() => {
          if (isKakaoMapLoaded()) {
            clearInterval(waitForKakao);
            
            if (isMounted) {
              window.kakao.maps.load(() => {
                if (isMounted) {
                  initializeMap();
                }
              });
            }
          }
        }, 100);
        
        return () => {
          clearInterval(waitForKakao);
        };
      }
      
      // 스크립트 주입
      isScriptInjected = true;
      console.log("카카오맵 API 스크립트 주입 시작");
      
      return new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false&libraries=services,clusterer,drawing`;
        script.async = true;
        
        script.onload = () => {
          console.log("카카오맵 API 스크립트 로드 완료");
          
          if (isMounted) {
            window.kakao.maps.load(() => {
              if (isMounted) {
                initializeMap();
                resolve();
              }
            });
          }
        };
        
        script.onerror = (e) => {
          console.error("카카오맵 API 스크립트 로드 실패", e);
          
          if (isMounted) {
            setError('카카오맵 API 로드에 실패했습니다.');
            isScriptInjected = false; // 다음 시도를 위해 재설정
            reject(e);
          }
        };
        
        document.head.appendChild(script);
      });
    };
    
    loadKakaoMap();
    
    // 클린업 함수
    return () => {
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
    if (!map || !mapLoaded || !window.kakao) return;
    
    try {
      // 기존 오버레이 제거
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.TRAFFIC);
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.BICYCLE);
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.TERRAIN);
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
      
      // 기존 마커와 인포윈도우 제거를 위한 변수
      const mapMarkers: any[] = [];
      const infoWindows: any[] = [];
      
      // 마커 추가
      markers.forEach((markerData, index) => {
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
          
          // Base64로 인코딩
          const svgBase64 = btoa(svg);
          
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
          
          // Base64로 인코딩
          const svgBase64 = btoa(svg);
          
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
      });
      
      // 이전 폴리라인 정리
      if (polylineInstance) {
        polylineInstance.setMap(null);
      }
      
      // 경로선 추가
      if (polyline.length > 1) {
        const path = polyline.map(point => 
          new window.kakao.maps.LatLng(point.lat, point.lng)
        );
        
        // 경로선 생성 - 절대 좌표로 생성합니다
        const newPolyline = new window.kakao.maps.Polyline({
          map,
          path,
          strokeWeight: 5,
          strokeColor: polylineColor,
          strokeOpacity: polylineOpacity,
          strokeStyle: 'solid' // 실선
        });
        
        // 상태로 폴리라인 저장
        setPolylineInstance(newPolyline);
      }
      
      // 컴포넌트 언마운트 시 마커와 이벤트 정리
      return () => {
        mapMarkers.forEach(marker => marker.setMap(null));
        if (polylineInstance) {
          polylineInstance.setMap(null);
        }
      };
    } catch (err) {
      console.error('마커 및 동선 설정 오류:', err);
    }
  }, [markers, polyline, polylineColor, polylineOpacity, mapLoaded]);

  // 윈도우 크기 변경 시 지도 크기 조정
  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.relayout();
      }
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
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