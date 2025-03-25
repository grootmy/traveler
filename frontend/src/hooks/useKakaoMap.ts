'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMap } from '@/hooks/useMap';
import { useMapStore, type Coordinate, type Marker, type MarkerCategory } from '@/store/mapStore';
import { convertToMarkers, calculateCentroid, DEFAULT_MAP_CENTER, DEFAULT_MAP_LEVEL } from '@/utils/map-utils';
// kakao-maps.d.ts 파일에서 타입을 자동으로 불러오므로 import는 필요 없음

// 명확한 타입 정의
interface UseKakaoMapOptions {
  initialCenter?: Coordinate;
  initialLevel?: number;
  useCurrentLocation?: boolean;
  clusteMarkers?: boolean;
  enableSearch?: boolean;
  onMarkerClick?: (marker: Marker) => void;
  onMapClick?: (lat: number, lng: number) => void;
}

interface KakaoPlaceResult {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  category_group_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string; // longitude
  y: string; // latitude
  place_url: string;
  distance: string;
}

// 훅 반환 타입 명시적으로 정의
interface KakaoMapHook {
  isLoaded: boolean;
  error: string | null;
  initializeMap: (mapContainer: HTMLDivElement) => any;
  updateMapOptions: () => void;
  updateMarkers: () => void;
  updatePolyline: () => void;
  setupResizeHandler: () => void;
  cleanup: () => void;
  getCurrentLocation: () => void;
  setCenter: (center: Coordinate) => void;
  getCenter: () => Coordinate;
  setLevel: (level: number) => void;
  getLevel: () => number;
  fitBounds: (coordinates: Coordinate[], padding?: number) => void;
  mapInstance: React.RefObject<any>;
  mapRef: React.RefObject<any>;
  searchPlaces: (query: string) => Promise<void>;
  searchResults: KakaoPlaceResult[];
  isSearching: boolean;
  showNextPage: () => void;
  showPrevPage: () => void;
  moveToLocation: (lat: number, lng: number, level?: number) => void;
  displayPlaces: (places: any[]) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * 카카오맵 기능을 위한 확장 커스텀 훅
 * useMap 훅을 기반으로 하며 검색, 클러스터링 등 추가 기능 제공
 */
export function useKakaoMap({
  initialCenter = DEFAULT_MAP_CENTER,
  initialLevel = DEFAULT_MAP_LEVEL,
  useCurrentLocation = false,
  clusteMarkers = false,
  enableSearch = false,
  onMarkerClick,
  onMapClick
}: UseKakaoMapOptions = {}) {
  // 지도 인스턴스 참조 생성
  const mapInstanceRef = useRef<any>(null);
  
  // 기본 지도 훅 사용 - 필수 파라미터 추가
  const baseMap = useMap({
    initialCenter,
    initialLevel,
    initialMarkers: [],
    initialPolyline: [],
    mapTypeId: 'ROADMAP',
    polylineColor: '#3B82F6',
    polylineOpacity: 0.7,
    useCurrentLocation,
    onClick: onMapClick
  });
  
  // 추가 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KakaoPlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPagination, setSearchPagination] = useState<any>(null);
  const [markerCluster, setMarkerCluster] = useState<any>(null);
  
  // Zustand 스토어
  const mapStore = useMapStore();
  
  // 지도 인스턴스 가져오기
  // baseMap.initializeMap이 호출될 때 mapRef가 설정됨
  const handleMapInit = useCallback((container: HTMLElement) => {
    baseMap.initializeMap(container);
    
    // 초기화 후 타이머로 지연시켜 mapRef에 접근
    setTimeout(() => {
      // 부득이하게 전역 kakao 객체에서 가장 최근 생성된 지도 인스턴스를 가져옴
      // 이 방법은 이상적이지 않지만 현재 구조에서는 이렇게 해야 함
      if (window.kakao && window.kakao.maps) {
        const maps = document.querySelectorAll('.map_canvas, .map_div');
        if (maps.length > 0) {
          const lastMap = maps[maps.length - 1];
          // kakao.maps를 any로 타입 단언하여 문자열 인덱싱 허용
          const kakaoMaps = window.kakao.maps as any;
          for (const key in kakaoMaps) {
            // 내부 객체를 순회하며 지도 인스턴스 찾기
            if (kakaoMaps[key] && kakaoMaps[key].ga) {
              const instances = kakaoMaps[key].ga;
              for (const id in instances) {
                if (instances[id].container === lastMap) {
                  mapInstanceRef.current = instances[id];
                  break;
                }
              }
            }
          }
        }
      }
    }, 100);
  }, [baseMap]);
  
  // 장소 검색 함수
  const searchPlaces = useCallback(async (query: string) => {
    if (!window.kakao || !window.kakao.maps || !mapInstanceRef.current || !query.trim()) {
      return;
    }
    
    try {
      setIsSearching(true);
      
      // 이전 검색 결과 초기화
      setSearchResults([]);
      
      // Places 서비스 객체 생성 (타입 단언 사용)
      const kakaoMaps = window.kakao.maps as any;
      const places = new kakaoMaps.services.Places();
      
      // 검색 콜백 함수
      const callback = (
        results: KakaoPlaceResult[], 
        status: any,
        pagination: any
      ) => {
        setIsSearching(false);
        
        if (status === (window.kakao.maps as any).services.Status.OK) {
          setSearchResults(results);
          setSearchPagination(pagination);
          
          // 검색 결과를 마커로 변환
          const markers = results.map((item: KakaoPlaceResult) => ({
            lat: parseFloat(item.y),
            lng: parseFloat(item.x),
            title: item.place_name,
            content: `
              <div class="info-window">
                <h3>${item.place_name}</h3>
                <p>${item.category_name}</p>
                <p>${item.address_name}</p>
                ${item.phone ? `<p>TEL: ${item.phone}</p>` : ''}
                <a href="${item.place_url}" target="_blank" rel="noopener noreferrer">상세보기</a>
              </div>
            `,
            category: 'default' as MarkerCategory
          }));
          
          // 마커 표시
          displaySearchMarkers(markers);
          
          // 검색 결과를 모두 볼 수 있도록 지도 영역 조정
          if (markers.length > 0) {
            // 중심점 계산
            const center = calculateCentroid(markers);
            
            // 지도 중심 이동
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setCenter(
                new window.kakao.maps.LatLng(center.lat, center.lng)
              );
              
              // 여러 결과가 있으면 확대 레벨 조정
              mapInstanceRef.current.setLevel(markers.length > 1 ? 5 : 3);
            }
          }
        } else {
          console.warn('장소 검색 결과가 없습니다.');
        }
      };
      
      // 키워드 검색 실행
      places.keywordSearch(query, callback);
    } catch (err) {
      console.error('장소 검색 오류:', err);
      setIsSearching(false);
    }
  }, []);
  
  // 검색 결과 마커 표시 함수
  const displaySearchMarkers = useCallback((markers: Marker[]) => {
    // 전역 스토어에 마커 업데이트
    mapStore.setRecommendedMarkers(markers);
    
    // 마커 업데이트
    baseMap.updateMarkers();
  }, [mapStore, baseMap]);
  
  // 마커 클러스터링 초기화 함수
  const initCluster = useCallback(() => {
    if (!window.kakao || !window.kakao.maps || !mapInstanceRef.current || !clusteMarkers) {
      return;
    }
    
    try {
      if (markerCluster) {
        // 이미 클러스터가 있으면 제거
        markerCluster.clear();
      }
      
      // MarkerClusterer 생성 (타입 단언 사용)
      const kakaoMaps = window.kakao.maps as any;
      const clusterer = new kakaoMaps.MarkerClusterer({
        map: mapInstanceRef.current,
        averageCenter: true,
        minLevel: 5,
        disableClickZoom: false,
        styles: [
          {
            width: '36px',
            height: '36px',
            background: 'rgba(51, 153, 255, 0.8)',
            borderRadius: '50%',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '36px'
          }
        ]
      });
      
      setMarkerCluster(clusterer);
    } catch (err) {
      console.error('마커 클러스터링 초기화 오류:', err);
    }
  }, [clusteMarkers, markerCluster]);
  
  // 다음 검색 페이지 표시
  const showNextPage = useCallback(() => {
    if (searchPagination && searchPagination.hasNextPage) {
      searchPagination.nextPage();
    }
  }, [searchPagination]);
  
  // 이전 검색 페이지 표시
  const showPrevPage = useCallback(() => {
    if (searchPagination && searchPagination.hasPrevPage) {
      searchPagination.prevPage();
    }
  }, [searchPagination]);
  
  // 특정 좌표로 지도 이동
  const moveToLocation = useCallback((lat: number, lng: number, level?: number) => {
    if (!mapInstanceRef.current) return;
    
    const position = new window.kakao.maps.LatLng(lat, lng);
    mapInstanceRef.current.setCenter(position);
    
    if (level) {
      mapInstanceRef.current.setLevel(level);
    }
  }, []);
  
  // 여러 장소를 표시하고 적절하게 영역 조정
  const displayPlaces = useCallback((places: any[]) => {
    if (places.length === 0 || !mapInstanceRef.current) return;
    
    // 장소 데이터를 마커 형식으로 변환
    const markers = convertToMarkers(places);
    
    // 지도에 마커 표시
    mapStore.setMarkers(markers);
    
    // 마커 업데이트
    baseMap.updateMarkers();
    
    // 모든 마커가 보이도록 영역 조정 (타입 단언 사용)
    const kakaoMaps = window.kakao.maps as any;
    const bounds = new kakaoMaps.LatLngBounds();
    
    markers.forEach(marker => {
      bounds.extend(new window.kakao.maps.LatLng(marker.lat, marker.lng));
    });
    
    mapInstanceRef.current.setBounds(bounds);
  }, [baseMap.updateMarkers, mapStore]);
  
  // 현재 위치 획득
  const getCurrentLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          moveToLocation(lat, lng, 3); // 줌 레벨 3으로 설정
        },
        (error) => {
          console.error('위치 정보를 가져올 수 없습니다:', error);
        }
      );
    } else {
      console.error('이 브라우저에서는 Geolocation이 지원되지 않습니다.');
    }
  }, [moveToLocation]);
  
  // 클러스터링 효과
  useEffect(() => {
    if (clusteMarkers) {
      initCluster();
    }
    
    return () => {
      if (markerCluster) {
        markerCluster.clear();
      }
    };
  }, [clusteMarkers, initCluster, markerCluster]);
  
  // 명확한 반환 객체 - baseMap을 확장하되 mapInstance 추가
  return {
    ...baseMap,
    initializeMap: handleMapInit,  // 원래 함수를 래핑한 함수로 교체
    searchPlaces,
    searchResults,
    isSearching,
    showNextPage,
    showPrevPage,
    moveToLocation,
    displayPlaces,
    searchQuery,
    setSearchQuery,
    getCurrentLocation,
    mapInstance: mapInstanceRef,
    mapRef: mapInstanceRef,
  };
} 