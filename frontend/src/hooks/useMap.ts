/// <reference path="../types/kakao-maps.d.ts" />
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

interface MapOptions {
  initialCenter: Coordinate;
  initialLevel: number;
  initialMarkers: Array<any>;
  initialPolyline: Coordinate[];
  mapTypeId: 'ROADMAP' | 'SKYVIEW' | 'HYBRID';
  polylineColor: string;
  polylineOpacity: number;
  useCurrentLocation: boolean;
  onClick?: (lat: number, lng: number) => void;
  onDragEnd?: () => void;
  onZoomChanged?: () => void;
  onMarkerClick?: (markerId: string) => void;
}

// Bounds 타입 정의
export interface KakaoBounds {
  sw: Coordinate;
  ne: Coordinate;
}

export const useMap = ({
  initialCenter,
  initialLevel,
  initialMarkers = [],
  initialPolyline = [],
  mapTypeId = 'ROADMAP',
  polylineColor = '#3B82F6',
  polylineOpacity = 0.7,
  useCurrentLocation = false,
  onClick,
  onDragEnd,
  onZoomChanged,
  onMarkerClick
}: MapOptions) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 참조 상태 관리
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Array<any>>([]);
  const infoWindowsRef = useRef<Array<any>>([]);
  const polylineRef = useRef<any>(null);
  const currentMarkersData = useRef<Array<any>>(initialMarkers);
  const currentPolylineData = useRef<Coordinate[]>(initialPolyline);
  const isMapInitialized = useRef<boolean>(false); // 지도 초기화 여부 추적

  // mapStore
  const { markers, recommendedMarkers, polyline } = useMapStore();
  
  // 최종 사용할 데이터 계산 (center와 level 제외)
  const finalMarkers = initialMarkers.length > 0 
    ? initialMarkers 
    : [...markers, ...recommendedMarkers];
  const finalPolyline = initialPolyline.length > 0 
    ? initialPolyline 
    : polyline;
  
  // 지도 초기화
  const initializeMap = useCallback((container: HTMLElement) => {
    try {
      // 이미 초기화된 경우 중복 초기화 방지
      if (isMapInitialized.current && mapRef.current) {
        console.log('지도가 이미 초기화되어 있습니다.');
        return;
      }
      
      if (!window.kakao || !window.kakao.maps) {
        setError('카카오맵 API가 로드되지 않았습니다.');
        return;
      }
      
      // 맵 생성
      const options = {
        center: new window.kakao.maps.LatLng(initialCenter.lat, initialCenter.lng),
        level: initialLevel
      };
      
      const map = new window.kakao.maps.Map(container, options);
      mapRef.current = map;
      
      // 맵 타입 설정
      const mapTypes = {
        ROADMAP: window.kakao.maps.MapTypeId.ROADMAP,
        SKYVIEW: window.kakao.maps.MapTypeId.SKYVIEW,
        HYBRID: window.kakao.maps.MapTypeId.HYBRID
      };
      map.setMapTypeId(mapTypes[mapTypeId]);
      
      // 클릭 이벤트 리스너 등록
      if (onClick) {
        window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.latLng;
          onClick(latlng.getLat(), latlng.getLng());
        });
      }
      
      // 드래그 종료 이벤트 리스너 등록
      if (onDragEnd) {
        window.kakao.maps.event.addListener(map, 'dragend', () => {
          onDragEnd();
        });
      }
      
      // 줌 변경 이벤트 리스너 등록
      if (onZoomChanged) {
        window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
          onZoomChanged();
        });
      }
      
      // 현재 위치 사용 설정
      if (useCurrentLocation) {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              
              const moveLatLng = new window.kakao.maps.LatLng(lat, lng);
              map.setCenter(moveLatLng);
              map.setLevel(3); // 더 가까이 줌
              
              // 현재 위치에 마커 추가
              const markerPosition = new window.kakao.maps.LatLng(lat, lng);
              const marker = new window.kakao.maps.Marker({
                position: markerPosition,
                map: map
              });
              
              markersRef.current.push(marker);
            },
            (error) => {
              console.error('Geolocation 오류:', error);
              setError('현재 위치를 가져올 수 없습니다.');
            }
          );
        } else {
          setError('이 브라우저에서는 Geolocation이 지원되지 않습니다.');
        }
      }
      
      // 마커 및 폴리라인 초기화
      updateMarkersInternal(initialMarkers);
      updatePolylineInternal(initialPolyline);
      
      isMapInitialized.current = true; // 초기화 완료 표시
      setIsLoaded(true);
    } catch (err: any) {
      console.error('지도 초기화 오류:', err);
      setError(err.message || '지도를 초기화하는 중 오류가 발생했습니다.');
    }
  }, []);
  
  // 내부 마커 업데이트 함수
  const updateMarkersInternal = useCallback((markersData: Array<any>) => {
    if (!mapRef.current) return;
    
    // 기존 마커와 인포윈도우 제거
    markersRef.current.forEach(marker => marker.setMap(null));
    infoWindowsRef.current.forEach(infoWindow => infoWindow.close());
    
    markersRef.current = [];
    infoWindowsRef.current = [];
    
    // 새 마커 생성 및 추가
    markersData.forEach((markerData, index) => {
      // 전통적인 마커 형식과 새 형식 모두 지원
      const lat = markerData.lat || markerData.position?.lat;
      const lng = markerData.lng || markerData.position?.lng;
      const title = markerData.title || '';
      const content = markerData.content || '';
      const category = markerData.category || 'default';
      const order = markerData.order;
      const id = markerData.id || `marker-${index}`;
      const color = markerData.color || CategoryColors[category] || CategoryColors.default;
      
      if (!lat || !lng) {
        console.warn('마커 데이터에 유효한 좌표가 없습니다:', markerData);
        return;
      }
      
      const position = new window.kakao.maps.LatLng(lat, lng);
      
      // 마커 이미지 생성
      let markerImage;
      
      if (order !== undefined) {
        // 순서가 있는 마커는 원 안에 숫자로 표시
        const orderSvg = `
          <svg width="36" height="36" xmlns="http://www.w3.org/2000/svg">
            <circle cx="18" cy="18" r="14" fill="${color}" stroke="white" stroke-width="2" />
            <text x="18" y="22" text-anchor="middle" fill="white" font-size="12px" font-weight="bold" font-family="Arial">${order + 1}</text>
          </svg>
        `;
        
        const imageSize = new window.kakao.maps.Size(36, 36);
        const imageOption = { offset: new window.kakao.maps.Point(18, 18) };
        
        markerImage = new window.kakao.maps.MarkerImage(
          `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(orderSvg)))}`,
          imageSize,
          imageOption
        );
      } else {
        // 일반 마커는 핀 모양으로 표시
        const pinSvg = `
          <svg width="24" height="34" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.383 0 0 5.383 0 12c0 9 12 22 12 22s12-13 12-22c0-6.617-5.383-12-12-12z" fill="${color}" />
            <circle cx="12" cy="12" r="5" fill="white" />
          </svg>
        `;
        
        const imageSize = new window.kakao.maps.Size(24, 34);
        const imageOption = { offset: new window.kakao.maps.Point(12, 34) };
        
        markerImage = new window.kakao.maps.MarkerImage(
          `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(pinSvg)))}`,
          imageSize,
          imageOption
        );
      }
      
      // 마커 생성
      const marker = new window.kakao.maps.Marker({
        position,
        image: markerImage,
        map: mapRef.current,
        title
      });
      
      // 마커 ID 저장 (데이터 속성 활용)
      (marker as any).id = id;
      
      // 인포윈도우 생성
      if (title || content) {
        const infoContent = `
          <div style="padding:10px;min-width:150px;max-width:250px;color:#333;font-size:13px;border-radius:4px;">
            ${title ? `<div style="font-weight:bold;margin-bottom:4px;">${title}</div>` : ''}
            ${content ? `<div>${content}</div>` : ''}
          </div>
        `;
        
        // @ts-ignore - 타입 정의 문제 해결을 위해 타입 검사 무시
        const infoWindow = new window.kakao.maps.InfoWindow({
          content: infoContent,
          removable: false,
          zIndex: 1
        });
        
        infoWindowsRef.current.push(infoWindow);
        
        // 클릭 이벤트 - 인포윈도우 표시
        window.kakao.maps.event.addListener(marker, 'click', () => {
          infoWindow.open(mapRef.current!, marker);
          
          // 마커 클릭 콜백 호출
          if (onMarkerClick) {
            onMarkerClick((marker as any).id);
          }
        });
      } else if (onMarkerClick) {
        // 인포윈도우 없는 경우에도 마커 클릭 콜백 호출
        window.kakao.maps.event.addListener(marker, 'click', () => {
          if (onMarkerClick) {
            onMarkerClick((marker as any).id);
          }
        });
      }
      
      markersRef.current.push(marker);
    });
    
    // 현재 마커 데이터 업데이트
    currentMarkersData.current = markersData;
  }, [onMarkerClick]);
  
  // 내부 폴리라인 업데이트 함수
  const updatePolylineInternal = useCallback((coordinates: Coordinate[]) => {
    if (!mapRef.current || coordinates.length < 2) {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      return;
    }
    
    // 기존 폴리라인 제거
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    
    // 폴리라인 경로 생성
    const path = coordinates.map(
      coord => new window.kakao.maps.LatLng(coord.lat, coord.lng)
    );
    
    // 폴리라인 옵션
    const polylineOptions = {
      path,
      strokeWeight: 4,
      strokeColor: polylineColor,
      strokeOpacity: polylineOpacity,
      strokeStyle: 'solid'
    };
    
    // 폴리라인 생성 및 지도에 표시
    const polyline = new window.kakao.maps.Polyline(polylineOptions);
    polyline.setMap(mapRef.current);
    
    polylineRef.current = polyline;
    currentPolylineData.current = coordinates;
  }, [polylineColor, polylineOpacity]);
  
  // 외부 인터페이스: 마커 업데이트
  const updateMarkers = useCallback((markersData?: Array<any>) => {
    const newMarkersData = markersData || initialMarkers;
    updateMarkersInternal(newMarkersData);
  }, [initialMarkers, updateMarkersInternal]);
  
  // 외부 인터페이스: 폴리라인 업데이트
  const updatePolyline = useCallback((coordinates?: Coordinate[]) => {
    const newCoordinates = coordinates || initialPolyline;
    updatePolylineInternal(newCoordinates);
  }, [initialPolyline, updatePolylineInternal]);
  
  // 중심점 설정
  const setCenter = useCallback((center: Coordinate) => {
    if (!mapRef.current) return;
    
    const moveLatLng = new window.kakao.maps.LatLng(center.lat, center.lng);
    mapRef.current.setCenter(moveLatLng);
  }, []);
  
  // 줌 레벨 설정
  const setLevel = useCallback((level: number) => {
    if (!mapRef.current) return;
    
    mapRef.current.setLevel(level);
  }, []);
  
  // bounds 영역 내로 지도 조절
  const fitBounds = useCallback((coordinates: Coordinate[], padding: number = 50) => {
    if (!mapRef.current || coordinates.length === 0) return;
    
    const bounds = new window.kakao.maps.LatLngBounds();
    
    coordinates.forEach(coord => {
      bounds.extend(new window.kakao.maps.LatLng(coord.lat, coord.lng));
    });
    
    mapRef.current.setBounds(bounds, padding);
  }, []);
  
  // 현재 지도 중심 가져오기
  const getCenter = useCallback((): Coordinate | null => {
    if (!mapRef.current) return null;
    
    const center = mapRef.current.getCenter();
    return {
      lat: center.getLat(),
      lng: center.getLng()
    };
  }, []);
  
  // 현재 지도 확대 레벨 가져오기
  const getLevel = useCallback((): number | null => {
    if (!mapRef.current) return null;
    
    return mapRef.current.getLevel();
  }, []);
  
  // 현재 지도 영역 가져오기
  const getBounds = useCallback((): KakaoBounds | null => {
    if (!mapRef.current) return null;
    
    const bounds = mapRef.current.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    
    return {
      sw: { lat: sw.getLat(), lng: sw.getLng() },
      ne: { lat: ne.getLat(), lng: ne.getLng() }
    };
  }, []);
  
  // 지도 옵션 업데이트
  const updateMapOptions = useCallback((options: Partial<{
    center: Coordinate;
    level: number;
    mapTypeId: 'ROADMAP' | 'SKYVIEW' | 'HYBRID';
  }>) => {
    if (!mapRef.current) return;
    
    if (options.center) {
      setCenter(options.center);
    }
    
    if (options.level) {
      setLevel(options.level);
    }
    
    if (options.mapTypeId) {
      const mapTypes = {
        ROADMAP: window.kakao.maps.MapTypeId.ROADMAP,
        SKYVIEW: window.kakao.maps.MapTypeId.SKYVIEW,
        HYBRID: window.kakao.maps.MapTypeId.HYBRID
      };
      mapRef.current.setMapTypeId(mapTypes[options.mapTypeId]);
    }
  }, [setCenter, setLevel]);
  
  // 지도 리사이즈 핸들러 (컨테이너 크기 변화에 대응)
  const setupResizeHandler = useCallback(() => {
    const resizeHandler = debounce(() => {
      if (mapRef.current) {
        // @ts-ignore - 타입 정의 문제 해결을 위해 타입 검사 무시
        window.kakao.maps.event.trigger(mapRef.current, 'resize');
      }
    }, 100);
    
    window.addEventListener('resize', resizeHandler);
    
    return () => {
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);
  
  // 정리 함수
  const cleanup = useCallback(() => {
    // 모든 마커 제거
    markersRef.current.forEach(marker => {
      marker.setMap(null);
    });
    
    // 모든 인포윈도우 닫기
    infoWindowsRef.current.forEach(infoWindow => {
      infoWindow.close();
    });
    
    // 폴리라인 제거
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }
    
    // 참조 초기화
    markersRef.current = [];
    infoWindowsRef.current = [];
    polylineRef.current = null;
    mapRef.current = null;
    
    setIsLoaded(false);
  }, []);
  
  // initialCenter prop이 변경될 때만 중심점 업데이트
  useEffect(() => {
    if (isLoaded && mapRef.current && initialCenter) {
      const currentCenter = getCenter();
      const centerChanged = 
        currentCenter && 
        (Math.abs(initialCenter.lat - currentCenter.lat) > 0.0001 || 
         Math.abs(initialCenter.lng - currentCenter.lng) > 0.0001);
      
      if (centerChanged) {
        console.log('지도 중심점 업데이트:', initialCenter);
        setCenter(initialCenter);
      }
    }
  }, [isLoaded, initialCenter, setCenter, getCenter]);
  
  // initialLevel prop이 변경될 때만 업데이트
  useEffect(() => {
    if (isLoaded && mapRef.current) {
      const currentLevel = getLevel();
      
      if (currentLevel !== null && initialLevel !== currentLevel) {
        console.log('지도 줌 레벨 업데이트:', initialLevel);
        setLevel(initialLevel);
      }
    }
  }, [isLoaded, initialLevel, setLevel, getLevel]);
  
  // 마커 업데이트
  useEffect(() => {
    if (isLoaded && mapRef.current) {
      // 이전 마커와 현재 마커 데이터가 다른 경우에만 업데이트
      const markersChanged = 
        initialMarkers.length !== currentMarkersData.current.length ||
        JSON.stringify(initialMarkers) !== JSON.stringify(currentMarkersData.current);
      
      if (markersChanged) {
        console.log('마커 업데이트:', initialMarkers.length);
        updateMarkers(initialMarkers);
        currentMarkersData.current = [...initialMarkers];
      }
    }
  }, [isLoaded, initialMarkers, updateMarkers]);
  
  // 폴리라인 업데이트
  useEffect(() => {
    if (isLoaded && mapRef.current) {
      // 이전 폴리라인과 현재 폴리라인 데이터가 다른 경우에만 업데이트
      const polylineChanged = 
        initialPolyline.length !== currentPolylineData.current.length ||
        JSON.stringify(initialPolyline) !== JSON.stringify(currentPolylineData.current);
      
      if (polylineChanged) {
        console.log('폴리라인 업데이트');
        updatePolyline(initialPolyline);
        currentPolylineData.current = [...initialPolyline];
      }
    }
  }, [isLoaded, initialPolyline, updatePolyline]);
  
  return {
    isLoaded,
    error,
    initializeMap,
    updateMapOptions,
    updateMarkers,
    updatePolyline,
    setupResizeHandler,
    cleanup,
    setCenter,
    setLevel,
    fitBounds,
    getCenter,
    getLevel,
    getBounds
  };
}; 