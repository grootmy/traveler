'use client'

import { useEffect, useRef, useState } from 'react';

export type MarkerCategory = 'restaurant' | 'cafe' | 'attraction' | 'culture' | 'shopping' | 'transport';

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
  
  useEffect(() => {
    // 카카오맵 API가 로드되었는지 확인하는 함수
    const checkKakaoMapLoaded = () => {
      return typeof window !== 'undefined' && window.kakao && window.kakao.maps;
    };
    
    // 지도 초기화 함수
    const initializeMap = () => {
      if (!mapRef.current) return;
      
      try {
        const options = {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level
        };
        
        let mapInstance: any;
        
        if (useStaticMap) {
          mapInstance = new window.kakao.maps.StaticMap(mapRef.current, options);
        } else {
          mapInstance = new window.kakao.maps.Map(mapRef.current, options);
          
          // 클릭 이벤트 등록
          if (onClick) {
            window.kakao.maps.event.addListener(mapInstance, 'click', function(mouseEvent: any) {
              const latlng = mouseEvent.latLng;
              onClick(latlng.getLat(), latlng.getLng());
            });
          }
        }
        
        setMap(mapInstance);
        setMapLoaded(true);
      } catch (err) {
        console.error('지도 초기화 오류:', err);
        setError('지도를 초기화하는 중 오류가 발생했습니다.');
      }
    };
    
    // 카카오맵 API가 이미 로드되어 있는 경우
    if (checkKakaoMapLoaded()) {
      initializeMap();
      return;
    }
    
    // 카카오맵 API 로드 확인을 위한 인터벌
    const interval = setInterval(() => {
      if (checkKakaoMapLoaded()) {
        clearInterval(interval);
        initializeMap();
      }
    }, 500);
    
    // 10초 후에도 로드되지 않으면 에러 표시
    const timeout = setTimeout(() => {
      if (!mapLoaded) {
        clearInterval(interval);
        setError('카카오맵 API를 불러오는 데 실패했습니다. 페이지를 새로고침해 주세요.');
      }
    }, 10000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [center, level, useStaticMap, onClick]);
  
  // 마커와 동선 업데이트
  useEffect(() => {
    if (!map || !window.kakao || useStaticMap) return;

    // 기존 오버레이를 모두 제거하기 위한 함수
    const clearOverlays = () => {
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.TRAFFIC);
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.BICYCLE);
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.TERRAIN);
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    };
    
    // 기존 오버레이 제거
    clearOverlays();
    
    // 지도에 표시된 마커들을 저장할 배열
    const mapMarkers: any[] = [];
    const infoWindows: any[] = [];
    
    // 마커 추가
    markers.forEach((markerData, index) => {
      const position = new window.kakao.maps.LatLng(markerData.lat, markerData.lng);
      
      // 마커 색상 결정
      const category = markerData.category || 'default';
      const markerColor = CategoryColors[category as keyof typeof CategoryColors] || CategoryColors.default;
      
      // 마커 이미지 설정
      let markerImage;
      
      // 순서가 있는 경우(동선 표시) 번호 마커 사용
      if (markerData.order !== undefined) {
        // 번호가 있는 마커 이미지
        markerImage = new window.kakao.maps.MarkerImage(
          'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_number_blue.png',
          new window.kakao.maps.Size(36, 37),
          {
            offset: new window.kakao.maps.Point(13, 37),
            spriteSize: new window.kakao.maps.Size(36, 691),
            spriteOrigin: new window.kakao.maps.Point(0, (markerData.order % 10) * 46 + 10)
          }
        );
      } else {
        // 기본 마커에 색상 적용
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
        image: markerImage,
        zIndex: markerData.order !== undefined ? 10 : 1
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
    }
    
    // 컴포넌트 언마운트 시 마커와 이벤트 정리
    return () => {
      mapMarkers.forEach(marker => marker.setMap(null));
    };
  }, [map, markers, polyline, polylineColor, polylineOpacity, useStaticMap]);
  
  return (
    <div className="relative" style={{ width, height }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50">
          {error || '지도를 불러오는 중...'}
        </div>
      )}
    </div>
  );
} 