'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { districtPaths } from './DistrictPaths'
import Image from 'next/image'

// 서울 행정구 ID와 한글 이름 매핑
const districtMapping: Record<string, string> = {
  'Dobong-gu': '도봉구',
  'Dongdaemun-gu': '동대문구',
  'Dongjak-gu': '동작구',
  'Eunpyeong-gu': '은평구',
  'Gangbuk-gu': '강북구',
  'Gangdong-gu': '강동구',
  'Gangnam-gu': '강남구',
  'Gangseo-gu': '강서구',
  'Geumcheon-gu': '금천구',
  'Guro-gu': '구로구',
  'Gwanak-gu': '관악구',
  'Gwangjin-gu': '광진구',
  'Jongno-gu': '종로구',
  'Jung-gu': '중구',
  'Jungnang-gu': '중랑구',
  'Mapo-gu': '마포구',
  'Nowon-gu': '노원구',
  'Seocho-gu': '서초구',
  'Seodaemun-gu': '서대문구',
  'Seongbuk-gu': '성북구',
  'Seongdong-gu': '성동구',
  'Songpa-gu': '송파구',
  'Yangcheon-gu': '양천구',
  'Yeongdeungpo-gu_1_': '영등포구',
  'Yongsan-gu': '용산구'
}

// 영어 이름을 한글로 변환하는 매핑 (반대 방향)
const koreanToEnglishMapping: Record<string, string> = Object.entries(districtMapping).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {} as Record<string, string>
);

// 각 지역의 중심 좌표 계산 함수
const getDistrictCenter = (pathData: string): { x: number, y: number } => {
  try {
    // SVG 경로에서 첫 번째 M 명령의 좌표 추출
    const match = pathData.match(/M\s*([0-9.-]+)[,\s]([0-9.-]+)/);
    if (match && match.length >= 3) {
      return {
        x: parseFloat(match[1]) + 20, // 약간의 오프셋 추가
        y: parseFloat(match[2])
      };
    }
    // 기본값 반환
    return { x: 400, y: 400 };
  } catch (e) {
    console.error('좌표 추출 오류:', e);
    return { x: 400, y: 400 };
  }
};

type SeoulDistrictMapProps = {
  selectedDistricts?: string[]
  onChange?: (districts: string[]) => void
  multiple?: boolean
}

export default function SeoulDistrictMap({
  selectedDistricts = [],
  onChange,
  multiple = false
}: SeoulDistrictMapProps) {
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>(selectedDistricts)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  
  // 선택된 초기 구역 설정
  useEffect(() => {
    if (selectedDistricts && selectedDistricts.length > 0) {
      const englishDistricts = selectedDistricts.map(
        (district) => koreanToEnglishMapping[district] || district
      );
      setSelected(englishDistricts);
      
      if (onChange) {
        const koreanNames = englishDistricts.map(id => districtMapping[id] || id);
        // setTimeout을 사용하여 다음 렌더링 사이클에서 호출되도록 함
        setTimeout(() => {
          onChange(koreanNames);
        }, 0);
      }
    }
  // selected를 의존성 배열에서 제거하여 무한 루프 방지
  }, [selectedDistricts, onChange]);

  // 성능 최적화를 위한 메모이제이션된 지역 중심 좌표
  const districtCenters = useMemo(() => {
    const centers: Record<string, { x: number, y: number }> = {};
    Object.entries(districtPaths).forEach(([districtId, pathData]) => {
      centers[districtId] = getDistrictCenter(pathData);
    });
    return centers;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseEnter = useCallback((districtId: string) => {
    setHoveredDistrict(districtId)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredDistrict(null)
  }, [])

  const handleClick = useCallback((districtId: string) => {
    setSelected(prev => {
      let newSelected = [...prev]
      
      // 이미 선택된 상태면 선택 해제
      if (newSelected.includes(districtId)) {
        newSelected = newSelected.filter(id => id !== districtId)
      } else {
        // 다중 선택이 아니면 기존 선택 초기화
        if (!multiple) {
          newSelected = []
        }
        newSelected.push(districtId)
      }
      
      // 상위 컴포넌트에 변경 사항 알림
      if (onChange) {
        // 한글 이름으로 변환하여 전달
        const koreanNames = newSelected.map(id => districtMapping[id] || id);
        // setTimeout을 사용하여 다음 렌더링 사이클에서 호출되도록 함
        setTimeout(() => {
          onChange(koreanNames);
        }, 0);
      }
      
      return newSelected
    })
  }, [multiple, onChange])

  const removeDistrict = useCallback((districtId: string) => {
    setSelected(prev => {
      const newSelected = prev.filter(id => id !== districtId)
      
      // 상위 컴포넌트에 변경 사항 알림
      if (onChange) {
        // 한글 이름으로 변환하여 전달
        const koreanNames = newSelected.map(id => districtMapping[id] || id);
        // setTimeout을 사용하여 다음 렌더링 사이클에서 호출되도록 함
        setTimeout(() => {
          onChange(koreanNames);
        }, 0);
      }
      
      return newSelected
    })
  }, [onChange])

  // 선택된 지역만 렌더링할 엘리먼트
  const selectedElements = useMemo(() => {
    if (selected.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-2 mb-4">
        {selected.map(districtId => (
          <Badge key={districtId} variant="secondary" className="px-3 py-1">
            {districtMapping[districtId] || districtId}
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 ml-1 p-0"
              onClick={() => removeDistrict(districtId)}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
      </div>
    );
  }, [selected, removeDistrict]);

  // 툴팁 엘리먼트
  const tooltipElement = useMemo(() => {
    if (!hoveredDistrict) return null;
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bg-blue-900 bg-opacity-80 text-white px-2 py-1 rounded text-sm pointer-events-none z-10"
        style={{
          left: tooltipPosition.x - 20,
          top: tooltipPosition.y - 30,
        }}
      >
        {districtMapping[hoveredDistrict] || hoveredDistrict}
      </motion.div>
    );
  }, [hoveredDistrict, tooltipPosition]);

  // 지역 경로 엘리먼트들
  const districtElements = useMemo(() => {
    // 구역별 다른 색상 지정을 위한 색상 배열
    const strokeColors = [
      '#60a5fa', // 밝은 파랑
      '#f472b6', // 분홍
      '#4ade80', // 초록
      '#facc15', // 노랑
      '#fb923c', // 주황
      '#a78bfa', // 보라
      '#34d399', // 청록
      '#f87171', // 빨강
      '#fbbf24', // 주황노랑
      '#8b5cf6', // 진한보라
      '#10b981', // 밝은 청록
    ];

    return Object.keys(districtMapping).map((districtId, index) => {
      const isSelected = selected.includes(districtId);
      const isHovered = hoveredDistrict === districtId;
      
      // 구역별로 다른 색상 할당 (배열 순환)
      const colorIndex = index % strokeColors.length;
      const districtColor = strokeColors[colorIndex];
      
      return (
        <motion.path
          key={districtId}
          id={districtId}
          d={districtPaths[districtId]}
          fill={isSelected ? 'rgba(59, 130, 246, 0.7)' : 'rgba(229, 231, 235, 0.15)'}
          stroke={isHovered || isSelected ? '#2563EB' : districtColor}
          strokeWidth={isHovered || isSelected ? 2.5 : 2}
          whileHover={{ 
            scale: 1.03,
            fill: isSelected ? 'rgba(59, 130, 246, 0.8)' : 'rgba(147, 197, 253, 0.5)',
            stroke: districtColor,
            strokeWidth: 3,
            transition: { duration: 0.2 }
          }}
          animate={isHovered ? {
            scale: 1.02,
            transition: { duration: 0.2 }
          } : {
            scale: 1,
            transition: { duration: 0.2 }
          }}
          onMouseEnter={() => handleMouseEnter(districtId)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleClick(districtId)}
          className="cursor-pointer"
          initial={{ opacity: 0 }}
          transition={{ 
            duration: 0.2,
            delay: Object.keys(districtMapping).indexOf(districtId) * 0.01
          }}
        />
      );
    });
  }, [selected, hoveredDistrict, handleMouseEnter, handleMouseLeave, handleClick]);

  // 선택된 지역 이름 표시
  const selectedLabels = useMemo(() => {
    return selected.map(districtId => (
      <motion.text
        key={`text-${districtId}`}
        x={districtCenters[districtId]?.x || 400}
        y={districtCenters[districtId]?.y || 400}
        fontSize="14"
        fontWeight="bold"
        fill="#60a5fa"
        textAnchor="middle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {districtMapping[districtId]}
      </motion.text>
    ));
  }, [selected, districtCenters]);

  return (
    <div className="flex flex-col w-full">
      {/* 선택된 구 표시 영역 */}
      {selectedElements}

      {/* SVG 맵 영역 */}
      <div 
        className="relative w-full border border-gray-800 rounded-md overflow-hidden bg-white"
        style={{ maxWidth: '100%', height: '400px', margin: '0 auto' }}
        onMouseMove={handleMouseMove}
      >
        {/* 툴팁 */}
        {tooltipElement}

        {/* 서울 지도 SVG */}
        <svg 
          viewBox="100 160 900 750" 
          className="w-full h-full"
          style={{ display: 'block' }}
        >
          {/* 배경 */}
          <rect x="100" y="160" width="900" height="750" fill="#000000" />
          
          {/* 각 행정구 */}
          {districtElements}
          
          {/* 구 이름 표시 (선택 시) */}
          {selectedLabels}
        </svg>
        
        {/* 선택된 구 이름 표시 (지도 위) */}
        {selected.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 bg-black bg-opacity-70 p-2 rounded-md text-center">
            <p className="font-bold text-blue-300">
              선택된 지역: {selected.map(id => districtMapping[id]).join(', ')}
            </p>
          </div>
        )}
      </div>
      
      <div className="mt-4 text-sm text-gray-400 text-center">
        지도에서 원하는 지역을 선택해주세요. {multiple ? '여러 지역을 선택할 수 있습니다.' : ''}
      </div>
    </div>
  )
} 