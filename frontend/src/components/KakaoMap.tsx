'use client'

import { useEffect, useRef, useState } from 'react';

interface KakaoMapProps {
  width?: string;
  height?: string;
  center?: { lat: number; lng: number };
  level?: number;
  markers?: Array<{ 
    lat: number; 
    lng: number; 
    title: string;
    markerType?: 'primary' | 'secondary';
  }>;
  polyline?: Array<{ lat: number; lng: number }>;
  polylineColor?: string;
  useStaticMap?: boolean;
  mapTypeId?: string;
}

declare global {
  interface Window {
    kakao: any;
  }
}

export default function KakaoMap({
  width = '100%',
  height = '400px',
  center = { lat: 37.5665, lng: 126.9780 },
  level = 3,
  markers = [],
  polyline = [],
  polylineColor = '#FF0000',
  useStaticMap = true,
  mapTypeId = 'ROADMAP'
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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
        
        let map: any;
        
        if (useStaticMap) {
          map = new window.kakao.maps.StaticMap(mapRef.current, options);
        } else {
          map = new window.kakao.maps.Map(mapRef.current, options);
          
          // 마커 추가
          markers.forEach((markerData, index) => {
            const position = new window.kakao.maps.LatLng(markerData.lat, markerData.lng);
            
            // 마커 이미지 설정
            let markerImage;
            if (markerData.markerType === 'secondary') {
              // 청록색 마커 (2차 추천)
              markerImage = new window.kakao.maps.MarkerImage(
                'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
                new window.kakao.maps.Size(24, 35)
              );
            } else {
              // 기본 파란색 마커 (1차 추천)
              markerImage = new window.kakao.maps.MarkerImage(
                'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_number_blue.png',
                new window.kakao.maps.Size(36, 37),
                {
                  offset: new window.kakao.maps.Point(13, 37),
                  spriteSize: new window.kakao.maps.Size(36, 691),
                  spriteOrigin: new window.kakao.maps.Point(0, (index % 10) * 46 + 10)
                }
              );
            }
            
            // 마커 생성
            const marker = new window.kakao.maps.Marker({
              map,
              position,
              title: markerData.title,
              image: markerImage
            });
            
            // 마커에 표시할 인포윈도우 생성
            const infowindow = new window.kakao.maps.InfoWindow({
              content: `<div style="padding:5px;font-size:12px;">${markerData.title}</div>`
            });
            
            // 마커에 마우스오버 이벤트 등록 - 마커 객체를 직접 참조
            window.kakao.maps.event.addListener(marker, 'mouseover', function() {
              infowindow.open(map, marker);
            });
            
            // 마커에 마우스아웃 이벤트 등록 - 마커 객체를 직접 참조
            window.kakao.maps.event.addListener(marker, 'mouseout', function() {
              infowindow.close();
            });
          });
          
          // 경로선 추가
          if (polyline.length > 1) {
            const path = polyline.map(point => 
              new window.kakao.maps.LatLng(point.lat, point.lng)
            );
            
            new window.kakao.maps.Polyline({
              map,
              path,
              strokeWeight: 5,
              strokeColor: polylineColor,
              strokeOpacity: 0.7,
              strokeStyle: 'solid'
            });
          }
        }
        
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
  }, [center, level, markers, polyline, polylineColor, useStaticMap, mapLoaded]);
  
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