'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMapStore, type MarkerCategory, type Coordinate, type Marker } from '@/store/mapStore';
import {
  CategoryColors,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_LEVEL,
  svgToBase64,
  debounce,
  isCoordinateChanged
} from '@/utils/map-utils';

interface UseMapOptions {
  initialCenter?: Coordinate;
  initialLevel?: number;
  initialMarkers?: Marker[];
  initialPolyline?: Coordinate[];
  mapTypeId?: 'ROADMAP' | 'SKYVIEW' | 'HYBRID';
  polylineColor?: string;
  polylineOpacity?: number;
  useCurrentLocation?: boolean;
  onClick?: (lat: number, lng: number) => void;
}

export function useMap({
  initialCenter,
  initialLevel = DEFAULT_MAP_LEVEL,
  initialMarkers = [],
  initialPolyline = [],
  mapTypeId = 'ROADMAP',
  polylineColor = '#3B82F6',
  polylineOpacity = 0.7,
  useCurrentLocation = false,
  onClick
}: UseMapOptions = {}) {
  // Refs - center와 level을 ref로 관리하여 렌더링 사이클에 영향을 주지 않음
  const mapInstanceRef = useRef<any>(null);
  const centerRef = useRef<Coordinate>(initialCenter || DEFAULT_MAP_CENTER);
  const levelRef = useRef<number>(initialLevel);
  const markerInstancesRef = useRef<any[]>([]);
  const polylineInstanceRef = useRef<any | null>(null);
  const currentLocationMarkerRef = useRef<any | null>(null);
  
  // States
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // mapStore
  const { markers, recommendedMarkers, polyline } = useMapStore();
  
  // 최종 사용할 데이터 계산 (center와 level 제외)
  const finalMarkers = initialMarkers.length > 0 
    ? initialMarkers 
    : [...markers, ...recommendedMarkers];
  const finalPolyline = initialPolyline.length > 0 
    ? initialPolyline 
    : polyline;
  
  // 사용자가 직접 지도를 조작했는지 추적하는 플래그
  const userInteractedRef = useRef<boolean>(false);
  
  // 마커 이미지 생성 함수
  const createMarkerImage = useCallback((text: string, category?: MarkerCategory) => {
    if (!window.kakao || !window.kakao.maps) return null;
    
    const color = CategoryColors[category || 'default'] || CategoryColors.default;
    
    // SVG 마커 생성
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="18" y="23" font-family="Arial" font-size="16" font-weight="bold" fill="white" text-anchor="middle">
          ${text}
        </text>
      </svg>
    `;
    
    const encodedSvg = svgToBase64(svg);
    if (!encodedSvg) return null;
    
    return new window.kakao.maps.MarkerImage(
      `data:image/svg+xml;base64,${encodedSvg}`,
      new window.kakao.maps.Size(36, 36),
      { offset: new window.kakao.maps.Point(18, 18) }
    );
  }, []);
  
  // 현재 위치 가져오기
  const getCurrentLocation = useCallback(() => {
    if (!mapInstanceRef.current || !navigator.geolocation) {
      setError('이 브라우저에서는 위치 정보를 사용할 수 없습니다.');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newCenter = new window.kakao.maps.LatLng(latitude, longitude);
        
        // 지도 중심 이동 - 직접 인스턴스 조작
        mapInstanceRef.current.setCenter(newCenter);
        
        // 현재 중심 좌표 ref 업데이트
        centerRef.current = { lat: latitude, lng: longitude };
        
        // 기존 현재 위치 마커 제거
        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setMap(null);
        }
        
        // 현재 위치 마커 추가
        const marker = new window.kakao.maps.Marker({
          position: newCenter,
          map: mapInstanceRef.current,
          title: '현재 위치'
        });
        
        currentLocationMarkerRef.current = marker;
      },
      (err) => {
        console.error('위치 정보를 가져오는데 실패했습니다:', err);
        setError('위치 정보를 가져오는데 실패했습니다.');
      }
    );
  }, []);
  
  // 지도 인스턴스 초기화
  const initializeMap = useCallback((mapContainer: HTMLDivElement) => {
    if (!window.kakao || !window.kakao.maps) {
      setError('카카오맵 API가 로드되지 않았습니다.');
      return null;
    }
    
    try {
      // 지도 옵션 설정
      const options = {
        center: new window.kakao.maps.LatLng(centerRef.current.lat, centerRef.current.lng),
        level: levelRef.current,
        mapTypeId: window.kakao.maps.MapTypeId[mapTypeId]
      };
      
      // 지도 생성
      const mapInstance = new window.kakao.maps.Map(mapContainer, options);
      mapInstanceRef.current = mapInstance;
      setIsLoaded(true);
      
      // 클릭 이벤트 등록
      if (onClick) {
        window.kakao.maps.event.addListener(mapInstance, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.latLng;
          onClick(latlng.getLat(), latlng.getLng());
        });
      }
      
      // 사용자 조작 이벤트 감지
      window.kakao.maps.event.addListener(mapInstance, 'dragstart', () => {
        userInteractedRef.current = true;
      });
      
      window.kakao.maps.event.addListener(mapInstance, 'zoom_changed', () => {
        userInteractedRef.current = true;
      });
      
      // idle 이벤트 (지도 이동 및 확대/축소 완료 시 발생)
      const handleIdle = debounce(() => {
        if (!mapInstanceRef.current) return;
        
        const center = mapInstanceRef.current.getCenter();
        if (!center) return;
        
        // center와 level 값을 직접 ref에만 업데이트
        centerRef.current = {
          lat: center.getLat(),
          lng: center.getLng()
        };
        
        levelRef.current = mapInstanceRef.current.getLevel();
      }, 300);
      
      window.kakao.maps.event.addListener(mapInstance, 'idle', handleIdle);
      
      // 현재 위치 사용 설정된 경우 위치 가져오기
      if (useCurrentLocation) {
        setTimeout(getCurrentLocation, 500);
      }
      
      return mapInstance;
    } catch (err) {
      console.error('지도 초기화 오류:', err);
      setError('지도를 초기화하는데 문제가 발생했습니다.');
      return null;
    }
  }, [mapTypeId, onClick, useCurrentLocation, getCurrentLocation]);
  
  // 지도 중심 수동 설정 함수
  const setCenter = useCallback((center: Coordinate) => {
    if (!mapInstanceRef.current || !isLoaded) return;
    
    try {
      // 중심 좌표가 실제로 변경되었을 때만 업데이트
      if (isCoordinateChanged(centerRef.current, center)) {
        // 사용자 상호작용 플래그 초기화 (프로그래밍 방식 업데이트)
        userInteractedRef.current = false;
        
        mapInstanceRef.current.setCenter(
          new window.kakao.maps.LatLng(center.lat, center.lng)
        );
        
        // center ref 업데이트
        centerRef.current = center;
      }
    } catch (err) {
      console.error('지도 중심 설정 오류:', err);
    }
  }, [isLoaded]);
  
  // 줌 레벨 수동 설정 함수
  const setLevel = useCallback((level: number) => {
    if (!mapInstanceRef.current || !isLoaded) return;
    
    try {
      // 줌 레벨이 실제로 변경되었을 때만 업데이트
      if (levelRef.current !== level) {
        // 사용자 상호작용 플래그 초기화 (프로그래밍 방식 업데이트)
        userInteractedRef.current = false;
        
        mapInstanceRef.current.setLevel(level);
        
        // level ref 업데이트
        levelRef.current = level;
      }
    } catch (err) {
      console.error('지도 레벨 설정 오류:', err);
    }
  }, [isLoaded]);
  
  // 중심 좌표 가져오기 함수
  const getCenter = useCallback((): Coordinate => {
    if (mapInstanceRef.current && isLoaded) {
      const center = mapInstanceRef.current.getCenter();
      return {
        lat: center.getLat(),
        lng: center.getLng()
      };
    }
    return centerRef.current;
  }, [isLoaded]);
  
  // 줌 레벨 가져오기 함수
  const getLevel = useCallback((): number => {
    if (mapInstanceRef.current && isLoaded) {
      return mapInstanceRef.current.getLevel();
    }
    return levelRef.current;
  }, [isLoaded]);
  
  // 지도 옵션 업데이트 (mapTypeId만 업데이트)
  const updateMapOptions = useCallback(() => {
    if (!isLoaded || !mapInstanceRef.current) return;
    
    try {
      // 맵 타입 변경이 필요한 경우에만 업데이트
      const currentMapTypeId = mapInstanceRef.current.getMapTypeId();
      const targetMapTypeId = window.kakao.maps.MapTypeId[mapTypeId];
      
      if (currentMapTypeId !== targetMapTypeId) {
        mapInstanceRef.current.setMapTypeId(targetMapTypeId);
      }
    } catch (err) {
      console.error('지도 옵션 업데이트 오류:', err);
    }
  }, [isLoaded, mapTypeId]);
  
  // 마커 업데이트
  const updateMarkers = useCallback(() => {
    if (!isLoaded || !mapInstanceRef.current) return;
    
    try {
      // 기존 마커 모두 제거
      markerInstancesRef.current.forEach(marker => marker.setMap(null));
      markerInstancesRef.current = [];
      
      // 새 마커 추가
      finalMarkers.forEach((markerInfo, index) => {
        const position = new window.kakao.maps.LatLng(markerInfo.lat, markerInfo.lng);
        
        // 마커 이미지 설정
        let markerImage;
        if (markerInfo.order !== undefined) {
          // 순서가 있는 경우 숫자 표시
          markerImage = createMarkerImage(String(markerInfo.order + 1), markerInfo.category);
        } else {
          // 순서가 없는 경우 첫 글자 표시
          const label = markerInfo.title && markerInfo.title.length > 0 
            ? markerInfo.title.charAt(0) 
            : '';
          markerImage = createMarkerImage(label, markerInfo.category);
        }
        
        // 마커 생성
        const marker = new window.kakao.maps.Marker({
          position,
          map: mapInstanceRef.current,
          title: markerInfo.title,
          image: markerImage
        });
        
        // 콘텐츠가 있는 경우 클릭 이벤트 추가
        if (markerInfo.content && markerInfo.title) {
          // 클릭 시 콘솔에 표시 (필요에 따라 사용자 정의 클릭 핸들러 제공 가능)
          window.kakao.maps.event.addListener(marker, 'click', () => {
            console.log(`마커 클릭: ${markerInfo.title}`, markerInfo);
            // 여기서 애플리케이션에 맞게 클릭 이벤트 처리 로직 추가 가능
          });
        }
        
        markerInstancesRef.current.push(marker);
      });
    } catch (err) {
      console.error('마커 업데이트 오류:', err);
    }
  }, [isLoaded, finalMarkers, createMarkerImage]);
  
  // 폴리라인 업데이트
  const updatePolyline = useCallback(() => {
    if (!isLoaded || !mapInstanceRef.current || finalPolyline.length < 2) {
      // 폴리라인이 충분히 없으면 제거
      if (polylineInstanceRef.current) {
        polylineInstanceRef.current.setMap(null);
        polylineInstanceRef.current = null;
      }
      return;
    }
    
    try {
      // 기존 폴리라인 제거
      if (polylineInstanceRef.current) {
        polylineInstanceRef.current.setMap(null);
        polylineInstanceRef.current = null;
      }
      
      // 경로 좌표 변환
      const path = finalPolyline.map(
        coord => new window.kakao.maps.LatLng(coord.lat, coord.lng)
      );
      
      // 새 폴리라인 생성
      const polyline = new window.kakao.maps.Polyline({
        path,
        strokeWeight: 5,
        strokeColor: polylineColor,
        strokeOpacity: polylineOpacity,
        strokeStyle: 'solid'
      });
      
      polyline.setMap(mapInstanceRef.current);
      polylineInstanceRef.current = polyline;
    } catch (err) {
      console.error('폴리라인 업데이트 오류:', err);
    }
  }, [isLoaded, finalPolyline, polylineColor, polylineOpacity]);
  
  // 윈도우 리사이즈 이벤트 핸들러 설정
  const setupResizeHandler = useCallback(() => {
    if (!isLoaded || !mapInstanceRef.current) return () => {};
    
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.relayout();
      }
    };
    
    // 디바운스된 리사이즈 핸들러
    const debouncedResize = debounce(handleResize, 200);
    
    window.addEventListener('resize', debouncedResize);
    return () => window.removeEventListener('resize', debouncedResize);
  }, [isLoaded]);
  
  // 정리 함수
  const cleanup = useCallback(() => {
    // 마커 제거
    markerInstancesRef.current.forEach(marker => marker.setMap(null));
    markerInstancesRef.current = [];
    
    // 폴리라인 제거
    if (polylineInstanceRef.current) {
      polylineInstanceRef.current.setMap(null);
      polylineInstanceRef.current = null;
    }
    
    // 현재 위치 마커 제거
    if (currentLocationMarkerRef.current) {
      currentLocationMarkerRef.current.setMap(null);
      currentLocationMarkerRef.current = null;
    }
    
    // 지도 인스턴스 참조 제거
    mapInstanceRef.current = null;
  }, []);
  
  return {
    isLoaded,
    error,
    initializeMap,
    updateMapOptions,
    updateMarkers,
    updatePolyline,
    setupResizeHandler,
    cleanup,
    getCurrentLocation,
    setCenter,
    getCenter,
    setLevel,
    getLevel,
    mapInstance: mapInstanceRef
  };
} 