'use client'

import { useEffect, useRef } from 'react';
import Script from 'next/script';

interface KakaoMapProps {
  width?: string;
  height?: string;
  center?: { lat: number; lng: number };
  level?: number;
  markers?: Array<{ lat: number; lng: number; title: string }>;
  polyline?: Array<{ lat: number; lng: number }>;
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
  polyline = []
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  
  useEffect(() => {
    if (!window.kakao || !window.kakao.maps) return;
    
    const loadMap = () => {
      if (!mapRef.current) return;
      
      const options = {
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level
      };
      
      const map = new window.kakao.maps.Map(mapRef.current, options);
      mapInstanceRef.current = map;
      
      // 마커 추가
      markers.forEach(marker => {
        const position = new window.kakao.maps.LatLng(marker.lat, marker.lng);
        new window.kakao.maps.Marker({
          map,
          position,
          title: marker.title
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
          strokeColor: '#FF0000',
          strokeOpacity: 0.7,
          strokeStyle: 'solid'
        });
      }
    };
    
    window.kakao.maps.load(loadMap);
  }, [center, level, markers, polyline]);
  
  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false`}
      />
      <div ref={mapRef} style={{ width, height }} />
    </>
  );
} 