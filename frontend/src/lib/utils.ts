import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns";
import { ko } from 'date-fns/locale'

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function generateRoomCode(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  
  return result;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * ISO 문자열이나 Date를 원하는 포맷으로 변환
 */
export function formatDateCustom(date: Date | string, formatStr = 'yyyy년 M월 d일') {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return format(dateObj, formatStr, { locale: ko });
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error);
    return '';
  }
}

/**
 * 시간 포맷팅 유틸리티
 */
export function formatTime(time: Date | string, formatStr = 'HH:mm') {
  if (!time) return '';
  
  try {
    const dateObj = typeof time === 'string' ? parseISO(time) : time;
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('시간 포맷팅 오류:', error);
    return '';
  }
}

/**
 * 거리 포맷팅 유틸리티
 */
export function formatDistance(meters: number) {
  if (meters < 1000) {
    return `${meters}m`;
  } else {
    return `${(meters / 1000).toFixed(1)}km`;
  }
}

/**
 * 소요 시간 포맷팅 유틸리티
 */
export function formatDuration(minutes: number) {
  if (!minutes && minutes !== 0) return '';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}분`;
  } else if (mins === 0) {
    return `${hours}시간`;
  } else {
    return `${hours}시간 ${mins}분`;
  }
}

/**
 * 가격 포맷팅 유틸리티
 */
export function formatPrice(price: number) {
  if (!price && price !== 0) return '';
  return price.toLocaleString('ko-KR') + '원';
}

/**
 * 카테고리 색상 클래스 반환 유틸리티
 */
export function getCategoryColorClass(category: string) {
  switch(category?.toLowerCase()) {
    case 'restaurant':
      return "bg-red-100 text-red-800";
    case 'cafe':
      return "bg-teal-100 text-teal-800";
    case 'attraction':
      return "bg-amber-100 text-amber-800";
    case 'culture':
      return "bg-purple-100 text-purple-800";
    case 'shopping':
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/**
 * 카테고리 한글명 반환 유틸리티
 */
export function getCategoryName(category: string) {
  switch(category?.toLowerCase()) {
    case 'restaurant':
      return "음식점";
    case 'cafe':
      return "카페";
    case 'attraction':
      return "관광지";
    case 'culture':
      return "문화시설";
    case 'shopping':
      return "쇼핑";
    default:
      return "기타";
  }
}
