'use client'

import { useEffect, useRef, useState } from 'react';

export type MarkerCategory = 'restaurant' | 'cafe' | 'attraction' | 'culture' | 'shopping' | 'transport' | 'recommendation' | 'chat_location';

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

export default function KakaoMap({
  width = '100%',
  height = '400px',
  center = { lat: 37.5665, lng: 126.9780 },
  level = 9,
  markers = [],
  polyline = [],
  polylineColor = '#3B82F6',
  polylineOpacity = 0.7,
  useStaticMap = false,
  mapTypeId = 'ROADMAP',
  onClick
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<any>(null);
  const [mapInstance, setMapInstance] = useState<any>(null); // 지도 인스턴스 저장
  
  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    // 고유한 ID 생성
    const mapId = `kakao-map-${Math.random().toString(36).substring(2, 9)}`;
    if (mapRef.current) {
      mapRef.current.id = mapId;
    }
    
    // 카카오맵 API가 로드되었는지 확인하는 함수
    const checkKakaoMapLoaded = () => {
      return typeof window !== 'undefined' && window.kakao && window.kakao.maps;
    };
    
    // 지도 초기화 함수
    const initializeMap = () => {
      if (!mapRef.current) return;
      
      try {
        if (checkKakaoMapLoaded()) {
          console.log("카카오맵 API가 로드되었습니다. 지도를 초기화합니다.");
          
          // 지도 옵션 설정
          const options = {
            center: new window.kakao.maps.LatLng(center.lat, center.lng),
            level
          };
          
          // 지도 생성
          const newMapInstance = new window.kakao.maps.Map(mapRef.current, options);
          
          // 클릭 이벤트 등록
          if (onClick) {
            window.kakao.maps.event.addListener(newMapInstance, 'click', function(mouseEvent: any) {
              const latlng = mouseEvent.latLng;
              onClick(latlng.getLat(), latlng.getLng());
            });
          }
          
          setMapInstance(newMapInstance);
          setMap(newMapInstance);
          setMapLoaded(true);
          console.log("지도 인스턴스가 생성되었습니다.");
        } else {
          console.log("카카오맵 API가 아직 로드되지 않았습니다.");
        }
      } catch (err) {
        console.error('지도 초기화 오류:', err);
        setError('지도를 초기화하는 중 오류가 발생했습니다.');
      }
    };
    
    // 카카오맵 API가 로드될 때까지 대기
    const loadMapInterval = setInterval(() => {
      if (checkKakaoMapLoaded()) {
        clearInterval(loadMapInterval);
        console.log("카카오맵 API 로드 감지");
        
        window.kakao.maps.load(() => {
          console.log("카카오맵 API 초기화");
          initializeMap();
        });
      }
    }, 500);
    
    // 10초 후에도 로드되지 않으면 에러 표시 및 재시도
    const timeoutId = setTimeout(() => {
      if (!mapLoaded) {
        clearInterval(loadMapInterval);
        console.log("타임아웃: 카카오맵 API 로드 실패");
        
        // 로그 출력
        console.log("Window.kakao 존재 여부:", !!window.kakao);
        if (window.kakao) {
          console.log("Window.kakao.maps 존재 여부:", !!window.kakao.maps);
        }
        
        // 스크립트 재로드 시도
        const script = document.createElement('script');
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false&libraries=services,clusterer,drawing`;
        script.async = true;
        script.onload = () => {
          console.log("재시도: 카카오맵 API 스크립트 로드 완료");
          window.kakao.maps.load(() => {
            console.log("재시도: 카카오맵 API 초기화");
            initializeMap();
          });
        };
        document.head.appendChild(script);
      }
    }, 10000);
    
    return () => {
      clearInterval(loadMapInterval);
      clearTimeout(timeoutId);
    };
  }, []);
  
  // 중심점, 레벨 등이 변경되면 지도 업데이트
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    try {
      // 중심점과 레벨 설정
      map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      map.setLevel(level);
    } catch (err) {
      console.error('지도 업데이트 오류:', err);
    }
  }, [center, level, mapLoaded, map]);
  
  // 마커와 동선 업데이트
  useEffect(() => {
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
          // 모든 동선 위치에 번호 마커 사용 (1부터 시작)
          markerImage = new window.kakao.maps.MarkerImage(
            'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_number_blue.png',
            new window.kakao.maps.Size(36, 37),
            {
              offset: new window.kakao.maps.Point(13, 37),
              spriteSize: new window.kakao.maps.Size(36, 691),
              // order가 0이면 첫 번째 숫자(1) 사용, 아니면 해당 순서+1 사용
              spriteOrigin: new window.kakao.maps.Point(0, ((markerData.order + 1) % 10) * 46 + 10)
            }
          );
        } else if (category === 'recommendation') {
          // 추천 장소 마커 - 빨간색 마커 사용
          markerImage = new window.kakao.maps.MarkerImage(
            'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/red_b.png', // 빨간색 마커
            new window.kakao.maps.Size(31, 35),
            {
              offset: new window.kakao.maps.Point(15, 35)
            }
          );
        } else if (category === 'chat_location') {
          // 채팅 위치 마커 - 파란색 원형 마커 사용
          markerImage = new window.kakao.maps.MarkerImage(
            'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/blue_b.png', // 파란색 마커
            new window.kakao.maps.Size(31, 35),
            {
              offset: new window.kakao.maps.Point(15, 35)
            }
          );
        } else {
          // 기본 마커 사용
          markerImage = new window.kakao.maps.MarkerImage(
            'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
            new window.kakao.maps.Size(24, 35)
          );
        }
        
        // 마커 생성
        const marker = new window.kakao.maps.Marker({
          map,
          position,
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
      
      // 이전 폴리라인 정리를 위한 static 변수
      if (!(window as any).currentPolyline) {
        (window as any).currentPolyline = null;
      }
      
      // 이전 폴리라인이 있으면 제거
      if ((window as any).currentPolyline) {
        (window as any).currentPolyline.setMap(null);
        (window as any).currentPolyline = null;
      }
      
      // 경로선 추가
      if (polyline.length > 1) {
        const path = polyline.map(point => 
          new window.kakao.maps.LatLng(point.lat, point.lng)
        );
        
        // 경로선 생성
        const polylineInstance = new window.kakao.maps.Polyline({
          map,
          path,
          strokeWeight: 5,
          strokeColor: polylineColor,
          strokeOpacity: polylineOpacity,
          strokeStyle: 'solid'
        });
        
        // 현재 폴리라인 저장
        (window as any).currentPolyline = polylineInstance;
      }
      
      // 컴포넌트 언마운트 시 마커와 이벤트 정리
      return () => {
        mapMarkers.forEach(marker => marker.setMap(null));
        // 폴리라인도 정리
        if ((window as any).currentPolyline) {
          (window as any).currentPolyline.setMap(null);
          (window as any).currentPolyline = null;
        }
      };
    } catch (err) {
      console.error('마커 및 동선 설정 오류:', err);
    }
  }, [markers, polyline, polylineColor, polylineOpacity, map, mapLoaded]);

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