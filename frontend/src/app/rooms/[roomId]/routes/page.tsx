'use client'

import React, { useState, useEffect, FormEvent, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, getChatMessages, sendChatMessage, getRoutesByRoomId, generateRoutes, checkAnonymousParticipation, getRoomMembers, selectFinalRoute, voteForPlace, getPlaceVotes, saveChatMessage, getKeptPlaces, addPlaceToKeep, removePlaceFromKeep, getSharedRoutesByRoomId, sendAIMessage, getPopularPlacesByRoomId } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  joinRoomRealtime, 
  leaveRoomRealtime, 
  subscribeToVoteUpdates, 
  broadcastVote, 
  subscribeToRouteSelection, 
  broadcastRouteSelection, 
  subscribeToChatMessages, 
  subscribeToChatBroadcast, 
  broadcastChatMessage 
} from '@/lib/supabase/realtime'
import KakaoMap, { KakaoMapHandle } from '@/components/KakaoMap'
import RouteVisualization from '@/components/RouteVisualization'
import { ArrowLeft, ThumbsUp, ThumbsDown, Loader2, UserPlus, Check, Users, MapPin, MessageSquare, Bot, Star, GripVertical, X, ArrowDownCircle, ArrowUp, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import ChatContainer from '@/components/ChatContainer'
import PlaceCard from '@/components/PlaceCard'
import KakaoScriptLoader from '@/components/KakaoScriptLoader'
import { Reorder } from "framer-motion"
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { useMapStore } from '@/store/mapStore'
import { convertToMarkers, calculateCentroid, DEFAULT_MAP_CENTER, DEFAULT_MAP_LEVEL } from '@/utils/map-utils'
// 타입을 다른 이름으로 가져와서 충돌 방지
import type { Coordinate as CoordType, Marker as MarkerType, MarkerCategory } from '@/store/mapStore'
// 상단의 import 섹션에 커스텀 훅 추가
import { useMapControl } from '@/hooks/useMapControl';
import { useTabs } from '@/hooks/useTabs';
// 지도 탐색기 컴포넌트 추가
import MapExplorer from '@/components/map/MapExplorer';

type Member = {
  textid: string;
  user_id: string;
  nickname?: string;
  // status: 'pending' | 'ready';
  email?: string;
  is_friend?: boolean;
  anonymous_id?: string;
}

type AnonymousInfo = {
  id: string;
  nickname: string;
}

type Route = {
  textid: string;
  route_data: {
    places: Array<{
      textid: string;
      name: string;
      description: string;
      category: string;
      location: {
        lat: number;
        lng: number;
      };
      address: string;
      image_url?: string;
    }>;
    travel_time: number;
    total_cost: number;
  };
  votes: Record<string, 'like' | 'dislike' | null>;
  is_selected: boolean;
}

type Room = {
  textid: string;
  title: string;
  owner_id: string;
}

type Message = {
  id: string
  content: string
  sender: {
    id: string
    name: string
    avatar?: string
  }
  timestamp: Date
  isAI?: boolean
  isAIChat?: boolean
  coordinates?: Array<{lat: number, lng: number}>
}

// 장소 타입 정의
interface Place {
  textid: string;
  name: string;
  description: string;
  category: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  image_url?: string;
  price_level?: string;
  rating?: string;
  recommendation_reason?: string;
  is_recommended?: boolean;
}

// 추천 장소 타입 정의  
interface RecommendedPlace {
  textid: string;
  name: string;
  description: string;
  category: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

// User 타입 정의
type User = {
  textid: string;
  id?: string;
  email?: string;
  nickname?: string;
  avatar_url?: string;
  user_metadata?: {
    nickname?: string;
  };
}

// 새로운 커스텀 훅: 장소 투표 관련 로직 분리
const usePlaceVotes = (roomId: string, currentUserId: string | undefined, anonymousId: string | undefined) => {
  const [placeVotes, setPlaceVotes] = useState<Record<string, { likes: number, dislikes: number, userVotes: Record<string, 'like' | 'dislike'> }>>({});
  
  // 투표 정보 가져오기
  const fetchPlaceVotes = useCallback(async () => {
    try {
      const { data, error } = await getPlaceVotes(roomId);
      
      if (error) throw error;
      
      if (data) {
        setPlaceVotes(data);
      }
    } catch (err: any) {
      console.error('장소 투표 정보 가져오기 오류:', err);
    }
  }, [roomId]);
  
  // 초기 데이터 로드
  useEffect(() => {
    fetchPlaceVotes();
    
    // 주기적으로 투표 데이터 동기화 (30초마다)
    const intervalId = setInterval(fetchPlaceVotes, 30000);
    return () => clearInterval(intervalId);
  }, [fetchPlaceVotes, roomId]);
  
  // 투표 상태 확인 함수
  const getPlaceVoteStatus = useCallback((placeId?: string) => {
    const userId = currentUserId || anonymousId;
    // placeId가 undefined이거나 빈 문자열이면 기본값 반환
    if (!placeId || placeId.trim() === '' || !userId || !placeVotes[placeId]) {
      return {
        likes: 0,
        dislikes: 0,
        userVote: null
      };
    }
    
    return {
      likes: placeVotes[placeId].likes || 0,
      dislikes: placeVotes[placeId].dislikes || 0,
      userVote: placeVotes[placeId].userVotes?.[userId] || null
    };
  }, [placeVotes, currentUserId, anonymousId]);
  
  // 투표 처리 함수
  const handleVote = useCallback(async (placeId: string | undefined, voteType: 'up' | 'down') => {
    if (!currentUserId && !anonymousId) {
      toast.error('투표하려면 로그인이 필요합니다.');
      return;
    }
    
    // placeId 유효성 검사 추가
    if (!placeId || placeId.trim() === '') {
      console.error('유효하지 않은 장소 ID:', placeId);
      toast.error('유효하지 않은 장소입니다');
      return;
    }
    
    // UUID 형식 또는 임시 ID 확인
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(placeId);
    const isTempId = /^place-\d+-\d+$/i.test(placeId);
    
    if (isTempId) {
      console.error('임시 장소 ID는 투표할 수 없습니다:', placeId);
      toast.error('이 장소는 아직 저장되지 않아 투표할 수 없습니다');
      return;
    }
    
    if (!isUUID) {
      console.error('장소 ID가 유효한 UUID 형식이 아닙니다:', placeId);
      toast.error('유효하지 않은 장소 ID 형식입니다');
      return;
    }
    
    const userId = currentUserId || anonymousId;
    if (!userId) return;
    
    try {
      // 현재 투표 상태 확인
      console.log(`투표 전 상태 - 장소 ID: ${placeId}`, 
        placeVotes[placeId] ? {
          likes: placeVotes[placeId].likes, 
          dislikes: placeVotes[placeId].dislikes,
          현재사용자투표: placeVotes[placeId].userVotes[userId]
        } : '투표 정보 없음');
        
      // 'up'을 'like'로, 'down'을 'dislike'로 변환
      const convertedVoteType = voteType === 'up' ? 'like' : 'dislike';
      
      // 현재 사용자의 해당 장소에 대한 투표 상태 확인
      const currentVote = placeVotes[placeId]?.userVotes?.[userId];
      
      // 최종 투표 타입 결정 (같은 버튼 다시 누르면 취소)
      let finalVoteType: 'like' | 'dislike' | null = 
        currentVote === convertedVoteType ? null : convertedVoteType;
      
      // 서버에 투표 정보 먼저 저장
      const { success, error, data } = await voteForPlace(roomId, placeId, userId, finalVoteType);
      
      if (!success || error) {
        throw error || new Error('투표 처리 중 오류가 발생했습니다.');
      }
      
      // 서버 응답 기반으로 로컬 상태 업데이트
      if (data) {
        if (Array.isArray(data)) {
          // 투표 데이터 가공 처리
          const likes = data.filter(vote => vote.vote_type === 'up').length;
          const dislikes = data.filter(vote => vote.vote_type === 'down').length;
          const userVotes: Record<string, 'like' | 'dislike'> = {};
          
          data.forEach(vote => {
            userVotes[vote.user_id] = vote.vote_type === 'up' ? 'like' : 'dislike';
          });
          
          // 새로운 투표 정보 업데이트
          setPlaceVotes(prev => ({
            ...prev,
            [placeId]: {
              likes,
              dislikes,
              userVotes
            }
          }));
        } else {
          console.warn('서버 응답 데이터 형식이 예상과 다릅니다:', data);
          
          // 오류 방지를 위해 최소한의 데이터 구조로 저장
          setPlaceVotes(prev => ({
            ...prev,
            [placeId]: {
              likes: 0,
              dislikes: 0,
              userVotes: {
                [userId]: finalVoteType || 'like'
              }
            }
          }));
        }
      } else {
        // 서버 응답이 없을 경우 로컬에서 계산
        setPlaceVotes(prev => {
          const newPlaceVotes = { ...prev };
          
          // 해당 장소 투표 정보 초기화 (없을 경우)
          if (!newPlaceVotes[placeId]) {
            newPlaceVotes[placeId] = {
              likes: 0,
              dislikes: 0,
              userVotes: {}
            };
          }
          
          // 이전 투표 취소 처리
          if (currentVote === 'like') {
            newPlaceVotes[placeId].likes = Math.max(0, newPlaceVotes[placeId].likes - 1);
          } else if (currentVote === 'dislike') {
            newPlaceVotes[placeId].dislikes = Math.max(0, newPlaceVotes[placeId].dislikes - 1);
          }
          
          // 새 투표 적용
          if (finalVoteType === 'like') {
            newPlaceVotes[placeId].likes += 1;
            newPlaceVotes[placeId].userVotes[userId] = 'like';
          } else if (finalVoteType === 'dislike') {
            newPlaceVotes[placeId].dislikes += 1;
            newPlaceVotes[placeId].userVotes[userId] = 'dislike';
          } else {
            // 투표 취소 - 사용자 투표 데이터 삭제
            delete newPlaceVotes[placeId].userVotes[userId];
          }
          
          return newPlaceVotes;
        });
      }
      
      // 투표 결과 로그
      console.log(`투표 후 상태 - 장소 ID: ${placeId}, 최종 투표: ${finalVoteType}`);
      
      // Realtime으로 다른 사용자에게 투표 변경 알림
      broadcastVote(roomId, placeId, userId, finalVoteType);
      
    } catch (err: any) {
      console.error('장소 투표 오류:', err);
      toast.error(err.message || '투표 처리 중 오류가 발생했습니다.');
    }
  }, [placeVotes, roomId, currentUserId, anonymousId]);
  
  // 투표 수 가져오기
  const getVoteCount = useCallback((place: any, type: 'like' | 'dislike') => {
    if (!place || !place.textid) {
      return 0;
    }
    const placeId = place.textid;
    const voteStatus = getPlaceVoteStatus(placeId);
    return type === 'like' ? voteStatus.likes : voteStatus.dislikes;
  }, [getPlaceVoteStatus]);
  
  // 사용자의 투표 상태 가져오기
  const getUserVote = useCallback((place: any) => {
    if (!place || !place.textid) {
      return null;
    }
    const placeId = place.textid;
    const voteStatus = getPlaceVoteStatus(placeId);
    return voteStatus.userVote;
  }, [getPlaceVoteStatus]);
  
  return {
    placeVotes,
    getPlaceVoteStatus,
    handleVote,
    getVoteCount,
    getUserVote,
    fetchPlaceVotes
  };
};

// 새로운 커스텀 훅: 장소 KEEP 관리를 위한 훅
const useKeepPlaces = (roomId: string, userId: string | undefined) => {
  const [keepPlaces, setKeepPlaces] = useState<Array<any>>([]);
  
  // KEEP 목록 가져오기
  const fetchKeepPlaces = useCallback(async () => {
    try {
      if (!userId) {
        console.log('사용자 ID가 없지만 공용 KEEP 목록을 시도합니다.');
      }
      
      // 방의 공용 KEEP 목록 가져오기
      const { data, error } = await getKeptPlaces(roomId);
      
      if (error) {
        console.error('KEEP 장소 가져오기 오류:', error);
        return;
      }
      
      setKeepPlaces(data || []);
    } catch (error) {
      console.error('KEEP 장소 가져오기 오류:', error);
    }
  }, [roomId, userId]);
  
  // 장소를 KEEP 목록에 추가
  const addToKeep = useCallback(async (placeToAdd: any) => {
    if (!userId) {
      toast.error('로그인이 필요합니다');
      return;
    }
    
    try {
      // 이미 존재하는지 확인
      const exists = keepPlaces.some(place => place.textid === placeToAdd.textid);
      if (exists) return;
      
      // UUID가 없거나 임시 ID인 경우 새 UUID 할당
      let updatedPlace = { ...placeToAdd };
      if (!updatedPlace.textid || updatedPlace.textid.includes('loc-') || updatedPlace.textid.includes('rec-')) {
        updatedPlace.textid = uuidv4();
      }
      
      // UI에 추가
      setKeepPlaces(prev => [...prev, updatedPlace]);
      
      // 데이터베이스에 저장
      let placeId = placeToAdd.textid;
      if (!placeId || placeId.includes('loc-') || placeId.includes('rec-')) {
        placeId = uuidv4();
      }
      
      const placeData = {
        textid: placeId,
        name: placeToAdd.name,
        description: placeToAdd.description || '',
        category: placeToAdd.category || '기타',
        address: placeToAdd.address || '',
        location: placeToAdd.location || {
          lat: placeToAdd.coordinates?.lat || placeToAdd.lat || 0,
          lng: placeToAdd.coordinates?.lng || placeToAdd.lng || 0
        }
      };
      
      const { data, error } = await addPlaceToKeep(userId, roomId, placeData);
      
      if (error) {
        console.error('장소 KEEP 저장 오류:', error);
        toast.error('장소를 저장하는 중 오류가 발생했습니다');
      } else if (data) {
        // 서버에서 생성된 UUID로 업데이트
        const finalPlace = {
          ...placeToAdd,
          textid: data.textid
        };
        
        // KEEP 목록 업데이트
        setKeepPlaces(prev => prev.map(p => 
          p.name === placeToAdd.name ? finalPlace : p
        ));
        
        toast.success(`"${placeToAdd.name}" 장소가 공용 KEEP 목록에 저장되었습니다`);
      }
    } catch (err: any) {
      console.error('장소 KEEP 저장 오류:', err);
      toast.error('장소를 저장하는 중 오류가 발생했습니다');
    }
  }, [keepPlaces, roomId, userId]);
  
  // 장소를 KEEP 목록에서 제거
  const removeFromKeep = useCallback(async (placeId: string) => {
    if (!userId) {
      toast.error('로그인이 필요합니다');
      return;
    }
    
    try {
      // UI에서 제거
      setKeepPlaces(prev => prev.filter(place => place.textid !== placeId));
      
      // 데이터베이스에서 삭제
      const { error } = await removePlaceFromKeep(userId, roomId, placeId);
      
      if (error) {
        console.error('장소 Keep 삭제 오류:', error);
        toast.error('장소를 삭제하는 중 오류가 발생했습니다');
      } else {
        toast.success('장소가 Keep 목록에서 삭제되었습니다');
      }
    } catch (err: any) {
      console.error('장소 Keep 삭제 오류:', err);
      toast.error('장소를 삭제하는 중 오류가 발생했습니다');
    }
  }, [roomId, userId]);
  
  // 초기 데이터 로드
  useEffect(() => {
    if (userId) {
      fetchKeepPlaces();
    }
  }, [fetchKeepPlaces, userId]);
  
  return {
    keepPlaces,
    fetchKeepPlaces,
    addToKeep,
    removeFromKeep
  };
};

export default function RoutesPage({ params }: { params: { roomId: string } }) {
  const [room, setRoom] = useState<any>(null)
  const [routes, setRoutes] = useState<Array<any>>([])
  const [members, setMembers] = useState<Array<any>>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRoute, setSelectedRoute] = useState<any>(null)
  const [processingSelection, setProcessingSelection] = useState(false)
  // activeTab 상태는 useTabs로 대체
  const [generatingRoutes, setGeneratingRoutes] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  // 채팅 관련 상태 변수 정리
  const [teamMessages, setTeamMessages] = useState<Message[]>([])
  const [aiMessages, setAiMessages] = useState<Message[]>([])
  // submitting 상태를 분리
  const [teamSubmitting, setTeamSubmitting] = useState(false)
  const [aiSubmitting, setAiSubmitting] = useState(false)
  const [teamChatInput, setTeamChatInput] = useState('')
  const [aiChatInput, setAiChatInput] = useState('')
  const [showTeamChat, setShowTeamChat] = useState(false)
  const [showAiChat, setShowAiChat] = useState(false)
  // 추가: 추천 장소 목록을 관리하기 위한 상태
  const [recommendedPlaces, setRecommendedPlaces] = useState<Array<any>>([])
  // recommendedMarkers 상태는 useMapControl로 이동
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [anonymousInfo, setAnonymousInfo] = useState<any>(null)
  const router = useRouter()
  const { roomId } = params
  
  // 사용자 ID
  const userId = currentUser?.id || anonymousInfo?.id;
  
  // 커스텀 훅 사용
  const { activeTab, switchTab } = useTabs("members");
  
  // 지도 관련 커스텀 훅 사용
  const {
    mapRef,
    mapCenter,
    mapLevel,
    recommendedMarkers,
    updateRouteMarkers,
    updateRecommendedMarkers,
    fitBoundsToAllMarkers,
    fitBoundsToMarkers,
    setMapReady
  } = useMapControl();
  
  // 투표 관련 커스텀 훅 사용
  const { 
    placeVotes, 
    handleVote: handlePlaceVote, 
    getVoteCount,
    getUserVote, 
    fetchPlaceVotes 
  } = usePlaceVotes(roomId, currentUser?.id, anonymousInfo?.id);
  
  // 장소 KEEP 관리를 위한 훅 사용
  const { 
    keepPlaces, 
    fetchKeepPlaces, 
    addToKeep, 
    removeFromKeep 
  } = useKeepPlaces(roomId, userId);
  
  // 지도 상태 저장소
  const mapStore = useMapStore();

  // KakaoMap ref는 useMapControl로 이동했으므로 제거
  // const mapRef = useRef<KakaoMapHandle>(null);

  // 추가: 인기 장소 상태 변수
  const [popularPlaces, setPopularPlaces] = useState<Array<any>>([]);

  // 인기 장소 데이터 로드 함수 추가
  const fetchPopularPlaces = async () => {
    try {
      const { data, error } = await getPopularPlacesByRoomId(roomId);
      
      if (error) {
        console.error('인기 장소 가져오기 오류:', error);
        return;
      }
      
      if (data) {
        setPopularPlaces(data);
      }
    } catch (err) {
      console.error('인기 장소 가져오기 오류:', err);
    }
  };

  // 수정: 중복 함수 제거하고 기존 init() 함수에 fetchPopularPlaces 호출 추가
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        
        // 익명 사용자 세션 확인
        const { isAnonymous, user, anonymousInfo } = await checkAnonymousParticipation(roomId);
        
        if (user) {
          setCurrentUser(user);
          setIsAnonymous(false);
        } else if (isAnonymous && anonymousInfo) {
          setIsAnonymous(true);
          setAnonymousInfo(anonymousInfo);
        } else {
          // 로그인되지 않았고 익명 세션도 없으면 초대 페이지로 리디렉션
          router.push(`/invite?roomId=${roomId}`);
          return;
        }
        
        // 채팅 메시지 가져오기
        const fetchMessages = async () => {
          try {
            // 팀 채팅 메시지 가져오기
            const { data: teamChatData, error: teamChatError } = await getChatMessages(roomId, false, 50);
            if (teamChatError) {
              console.error('팀 채팅 메시지 조회 오류:', teamChatError);
            } else if (teamChatData) {
              setTeamMessages(teamChatData);
            }
            
            // AI 개인 채팅 메시지 가져오기
            const userId = isAnonymous ? anonymousInfo?.id : user?.id;
            if (userId) {
              const { data: aiChatData, error: aiChatError } = await getChatMessages(roomId, true, 50, userId);
              if (aiChatError) {
                console.error('AI 채팅 메시지 조회 오류:', aiChatError);
              } else if (aiChatData) {
                setAiMessages(aiChatData);
              }
            }
          } catch (err) {
            console.error('메시지 조회 오류:', err);
          }
        };
        
        await fetchMessages();
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('textid', roomId)
          .single();
        
        if (roomError || !roomData) {
          setError('방 정보를 찾을 수 없습니다');
          return;
        }
        
        setRoom(roomData);
        setIsOwner(roomData.owner_id === (user?.id || null));
        
        // 멤버 정보 가져오기
        await fetchMembers();
        
        // 경로 정보 가져오기 (항상 호출)
        await fetchRoutes();
        
        // 장소 투표 정보 가져오기
        await fetchPlaceVotes();
        
        // 사용자 정보가 확실히 설정된 후에 KEEP 목록 가져오기
        if (user || (isAnonymous && anonymousInfo)) {
          await fetchKeepPlaces();
        }
        
        // 인기 장소 정보 가져오기
        await fetchPopularPlaces();
        
        // 초기 탭을 members로 설정하여 바로 참여자 목록 표시
        switchTab("members");
        
        // Supabase Realtime 연결 - 한 번만 초기화
        const channel = joinRoomRealtime(roomId);
        console.log('Realtime 채널 초기화 완료:', roomId);
        
        // 채팅 구독 설정
        if (user?.id || anonymousInfo?.id) {
          const userId = isAnonymous ? `anonymous-${anonymousInfo?.id}` : user?.id;
          
          // 새 메시지 수신 시 처리
          subscribeToChatMessages(roomId, (message) => {
            // 중복 방지를 위한 메시지 ID 체크
            const messageId = message.id;
            
            // 새 팀 채팅 메시지 처리
            if (!message.isAIChat) {
              setTeamMessages(prev => {
                const exists = prev.some(msg => msg.id === messageId);
                if (exists) return prev;
                return [...prev, message];
              });
            }
            
            // 새 AI 채팅 메시지 처리 (자신의 메시지만)
            if (message.isAIChat && 
                (message.sender.id === userId || message.sender.id === 'ai')) {
              setAiMessages(prev => {
                const exists = prev.some(msg => msg.id === messageId);
                if (exists) return prev;
                return [...prev, message];
              });
            }
          });
          
          // 채팅 브로드캐스트 구독
          subscribeToChatBroadcast(roomId, (message) => {
            // 팀 채팅 메시지만 브로드캐스트에서 처리
            if (!message.isAIChat) {
              setTeamMessages(prev => {
                const exists = prev.some(msg => msg.id === message.id);
                if (exists) return prev;
                return [...prev, message];
              });
            }
          });
        }
        
        // 투표 이벤트 구독
        subscribeToVoteUpdates(roomId, ({ routeId, userId, voteType }) => {
          console.log(`투표 업데이트: ${userId}가 ${routeId}에 ${voteType || '취소'} 투표함`);
          
          // 경로 투표 업데이트
          setRoutes(prev => prev.map(route => {
            if (route.textid === routeId) {
              const updatedVotes = { ...route.votes };
              
              // 투표 타입에 따라 votes 객체 업데이트
              if (voteType === null) {
                // 투표 취소
                if (updatedVotes[userId]) {
                  delete updatedVotes[userId];
                }
              } else {
                // 투표 추가/변경
                updatedVotes[userId] = voteType;
              }
              
              return { ...route, votes: updatedVotes };
            }
            return route;
          }));
        });
        
        // 경로 선택 이벤트 구독
        subscribeToRouteSelection(roomId, ({ routeId }) => {
          console.log(`경로 선택: ${routeId}`);
          
          // 경로 선택 상태 업데이트
          setRoutes(prev => prev.map(route => ({
            ...route,
            is_selected: route.textid === routeId
          })));
        });
        
        setLoading(false)
      } catch (err: any) {
        console.error('라우트 페이지 초기화 오류:', err)
        setError(err.message || '페이지를 불러오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
    
    return () => {
      // 정리 함수 - 방에서 퇴장할 때 모든 리소스 정리
      console.log(`방 ${roomId}에서 퇴장 - 모든 리소스 정리`)
      leaveRoomRealtime(roomId)
      
      // 멤버 구독 해제
      try {
        supabase.channel(`room-members:${roomId}`).unsubscribe()
      } catch (err) {
        console.error('멤버 채널 구독 해제 오류:', err)
      }
    }
  }, [roomId, router, switchTab]) // switchTab 의존성 추가

  // 방 입장 시 처음 마커가 화면에 모두 보이도록 설정 - useMapControl로 대체
  useEffect(() => {
    if (mapRef.current && (mapStore.markers.length > 0 || recommendedMarkers.length > 0)) {
      // 모든 마커가 보이도록 화면 조정
      fitBoundsToAllMarkers(100, 500);
    }
  }, [mapRef.current, mapStore.markers.length, recommendedMarkers.length, fitBoundsToAllMarkers]);
  
  // 경로와 추천 장소 정보가 업데이트될 때마다 지도 스토어 업데이트 - useMapControl로 대체
  useEffect(() => {
    if (routes.length > 0 && routes[0]?.route_data?.places) {
      // 경로의 마커와 폴리라인 업데이트
      updateRouteMarkers(routes[0].route_data.places);
    }
  }, [routes, updateRouteMarkers]);
  
  // 나머지 useEffect는 제거 (useMapControl로 이동)

  // 장소 ID 유효성 검사 및 수정 (기존 코드 유지)
  useEffect(() => {
    if (routes.length > 0 && routes[0]?.route_data?.places) {
      const places = routes[0].route_data.places;
      let needsUpdate = false;
      
      // 각 장소에 고유한 textid가 있는지 확인
      const updatedPlaces = places.map((place: Place, index: number) => {
        if (!place.textid || place.textid.trim() === '') {
          // textid가 없는 경우 새로 생성
          needsUpdate = true;
          return {
            ...place,
            textid: `place-${Date.now()}-${index}`
          };
        }
        return place;
      });
      
      // textid가 변경된 경우에만 업데이트
      if (needsUpdate) {
        console.log('일부 장소에 유효한 ID가 없어 고유 ID를 생성합니다');
        setRoutes(prev => {
          if (prev.length === 0) return prev;
          
          const updatedRoutes = [...prev];
          updatedRoutes[0] = {
            ...updatedRoutes[0],
            route_data: {
              ...updatedRoutes[0].route_data,
              places: updatedPlaces
            }
          };
          return updatedRoutes;
        });
      }
    }
  }, [routes]);

  const fetchRoutes = async () => {
    try {
      // shared_routes 테이블에서 경로 정보 가져오기
      const { data: sharedRoutesData, error: sharedRoutesError } = await getSharedRoutesByRoomId(roomId);
      
      if (sharedRoutesError) {
        console.error('shared_routes 가져오기 오류:', sharedRoutesError);
        // shared_routes에서 오류 발생 시 기존 routes 테이블 조회 시도
        const { data: routesData, error: routesError } = await getRoutesByRoomId(roomId);
        
        if (routesError) throw routesError;
        
        if (!routesData || routesData.length === 0) {
          console.log('추천 경로가 없습니다. 새로운 경로를 생성합니다.');
          
          setGeneratingRoutes(true);
          
          // 경로 생성 API 호출
          const { data: generatedRoutes, error: generationError } = await generateRoutes(roomId);
          
          if (generationError) throw generationError;
          
          if (generatedRoutes && generatedRoutes.length > 0) {
            setRoutes(generatedRoutes);
          } else {
            // 생성 실패 시 더미 데이터 대신 빈 배열 설정
            setError('경로 생성에 실패했습니다. 다시 시도해주세요.');
            setRoutes([]);
          }
          
          setGeneratingRoutes(false);
        } else {
          // routes 테이블에 경로가 있는 경우
          setRoutes(routesData);
        }
      } else {
        // shared_routes 테이블에서 성공적으로 데이터를 가져온 경우
        if (!sharedRoutesData || sharedRoutesData.length === 0) {
          console.log('shared_routes에 경로가 없습니다. 새로운 경로를 생성합니다.');
          
          setGeneratingRoutes(true);
          
          // 경로 생성 API 호출
          const response = await fetch(`/api/rooms/${roomId}/generate-routes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await supabase.auth.getSession().then(res => res.data.session?.access_token || '')}`
            },
            body: JSON.stringify({
              forcedPlaces: [] // 빈 배열을 전송하여 API가 DB에서 장소 정보를 가져오도록 함
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '경로 생성 실패');
          }

          // 경로 생성 후 다시 데이터 가져오기
          const { data: newRoutesData, error: newRoutesError } = await getSharedRoutesByRoomId(roomId);
          
          if (newRoutesError) throw newRoutesError;
          
          if (newRoutesData && newRoutesData.length > 0) {
            setRoutes(newRoutesData);
          } else {
            setError('경로 생성 후에도 데이터를 불러올 수 없습니다.');
            setRoutes([]);
          }
          
          setGeneratingRoutes(false);
        } else {
          // shared_routes 테이블에 경로가 이미 있는 경우
          console.log('shared_routes에서 경로를 성공적으로 가져왔습니다:', sharedRoutesData);
          setRoutes(sharedRoutesData);
        }
      }

    } catch (err: any) {
      console.error('경로 정보 가져오기 오류:', err);
      setError(err.message || '경로 정보를 가져오는 중 오류가 발생했습니다.');
      setRoutes([]);
      setGeneratingRoutes(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const { data: membersData, error } = await getRoomMembers(roomId);
      
      if (error) throw error;
      
      if (!membersData || membersData.length === 0) {
        setMembers([]);
        return;
      }
      
      console.log('방 멤버 데이터:', membersData);
      
      // 이메일 정보와 친구 정보를 함께 처리
      const processedMembers = membersData.map(member => {
        // user 객체가 단일 객체가 아닌 배열 타입으로 인식되는 문제 해결
        const userObj = member.user as any;
        
        // 익명 사용자 또는 로그인된 사용자의 닉네임 처리
        let memberNickname = '익명';
        if (member.is_anonymous && member.nickname) {
          memberNickname = member.nickname;
        } else if (userObj) {
          memberNickname = userObj.nickname || userObj.email?.split('@')[0] || '사용자';
        }
        
        return {
          textid: member.textid,
          user_id: member.user_id || `anonymous-${member.textid}`,
          nickname: memberNickname,
          email: userObj?.email,
          is_friend: false, // 기본값, 친구 기능 구현 시 업데이트
          joined_at: member.joined_at,
          anonymous_id: member.anonymous_id // 익명 사용자 ID 추가
        }
      });
      
      setMembers(processedMembers);
      
    } catch (err: any) {
      console.error('멤버 정보 가져오기 오류:', err)
      // 오류 발생 시에도 UI가 깨지지 않도록 빈 배열 설정
      setMembers([]);
      // setAllMembersReady(false);
    }
  }

  // 장소 순서 변경 처리 함수
  const handleReorderPlaces = (reorderedPlaces: any[]) => {
    if (!routes.length) return;
    
    try {
      // 순서가 변경된 장소 목록으로 routes를 업데이트
      setRoutes(prev => {
        const updatedRoutes = [...prev];
        updatedRoutes[0] = {
          ...updatedRoutes[0],
          route_data: {
            ...updatedRoutes[0].route_data,
            places: reorderedPlaces
          }
        };
        return updatedRoutes;
      });
      
      // 폴리라인과 마커를 즉시 업데이트
      updateRouteMarkers(reorderedPlaces);
    } catch (err) {
      console.error('장소 순서 변경 오류:', err);
    }
  };

  // 장소를 선택된 동선에서 제거하고 공용 KEEP 목록으로 이동
  const moveToKeep = async (placeToMove: any, index: number) => {
    if (!routes.length) return;
    
    if (!userId) {
      setError('로그인이 필요합니다');
      return;
    }
    
    try {
      // 1. 선택된 동선에서 해당 장소 제거 (인덱스 기반으로 정확히 제거)
      setRoutes(prev => {
        const updatedRoutes = [...prev];
        if (!updatedRoutes[0]?.route_data?.places) return updatedRoutes;
        
        // 인덱스로 정확히 해당 항목 하나만 제거 (textid가 중복될 수 있으므로)
        const updatedPlaces = [...updatedRoutes[0].route_data.places];
        updatedPlaces.splice(index, 1);
        
        updatedRoutes[0] = {
          ...updatedRoutes[0],
          route_data: {
            ...updatedRoutes[0].route_data,
            places: updatedPlaces
          }
        };
        return updatedRoutes;
      });
      
      // 2. 장소 KEEP 목록에 추가 (커스텀 훅 함수 사용)
      await addToKeep(placeToMove);
      
    } catch (err: any) {
      console.error('장소 KEEP 처리 오류:', err);
      toast.error('장소를 처리하는 중 오류가 발생했습니다');
    }
  };

  // 공용 KEEP 목록에서 선택된 동선으로 장소 복원
  const moveToRoute = async (placeToMove: Place) => {
    if (!placeToMove || !placeToMove.textid) {
      console.error('유효하지 않은 장소 정보:', placeToMove);
      toast.error('유효하지 않은 장소 정보입니다');
      return;
    }
    
    if (!routes.length) return;
    
    if (!userId) {
      setError('로그인이 필요합니다');
      return;
    }
    
    try {
      // 1. KEEP 목록에서 제거 (커스텀 훅 함수 사용)
      await removeFromKeep(placeToMove.textid);
      
      // 2. 선택된 동선에 추가 (중복 방지)
      setRoutes(prev => {
        const updatedRoutes = [...prev];
        
        // 이미 동선에 있는지 확인
        const exists = updatedRoutes[0].route_data.places.some(
          (place: Place) => place.textid === placeToMove.textid
        );
        
        if (!exists) {
          updatedRoutes[0] = {
            ...updatedRoutes[0],
            route_data: {
              ...updatedRoutes[0].route_data,
              places: [...updatedRoutes[0].route_data.places, placeToMove]
            }
          };
        }
        
        return updatedRoutes;
      });
      
      toast.success(`"${placeToMove.name}" 장소를 공용 KEEP에서 동선으로 이동했습니다`);
    } catch (err: any) {
      console.error('장소 KEEP 처리 오류:', err);
      toast.error('장소를 처리하는 중 오류가 발생했습니다');
    }
  };

  // 경로 선택 처리
  const handleSelectRoute = async (routeId: string) => {
    try {
      if (!isOwner) {
        setError('여행 경로는 방장만 선택할 수 있습니다')
        return
      }
      
      // 로딩 상태 표시
      setProcessingSelection(true);
      
      // 로컬 상태 업데이트
      setRoutes(prev => prev.map(route => ({
        ...route,
        is_selected: route.textid === routeId
      })))
      
      // 선택된 경로 ID 업데이트
      setSelectedRoute(routeId)
      
      // shared_routes 테이블 업데이트
      const { error: updateError } = await supabase
        .from('shared_routes')
        .update({ is_final: true })
        .eq('route_id', routeId)
      
      if (updateError) {
        console.error('shared_routes 업데이트 오류:', updateError);
        // shared_routes 업데이트 실패 시 기존 routes 테이블 시도
        const { error } = await supabase
          .from('routes')
          .update({ is_selected: true })
          .eq('textid', routeId)
        
        if (error) throw error
      }
      
      // 다른 경로들은 선택 해제 (shared_routes)
      const { error: unselectSharedError } = await supabase
        .from('shared_routes')
        .update({ is_final: false })
        .eq('room_id', roomId)
        .neq('route_id', routeId)
      
      if (unselectSharedError) {
        console.error('shared_routes 선택 해제 오류:', unselectSharedError);
        // shared_routes 업데이트 실패 시 기존 routes 테이블 시도
        const { error: unselectError } = await supabase
          .from('routes')
          .update({ is_selected: false })
          .eq('room_id', roomId)
          .neq('textid', routeId)
        
        if (unselectError) throw unselectError
      }
      
      // Realtime으로 다른 사용자에게 알림
      broadcastRouteSelection(roomId, routeId)
      
      // 선택 완료 메시지 표시
      toast.success('여행 경로가 선택되었습니다')
      
      // 로딩 상태 해제
      setProcessingSelection(false);
      
      // 경로 결과 페이지로 이동
      router.push(`/rooms/${roomId}/result`)
    } catch (err: any) {
      console.error('경로 선택 오류:', err)
      setError(err.message || '경로를 선택하는 중 오류가 발생했습니다')
      setProcessingSelection(false);
    }
  }

  // 친구 추가 함수
  const handleAddFriend = (userId: string) => {
    // 친구 추가 로직 구현
    console.log(`사용자 ${userId}를 친구로 추가`);
    
    // 실제 환경에서는 API 호출
    // 여기서는 UI 업데이트만 시뮬레이션
    setMembers(prev => prev.map(member => 
      member.user_id === userId 
        ? { ...member, is_friend: true } 
        : member
    ));
  }

  // 추천 장소를 지도에 표시하는 함수
  const handleRecommendedLocations = useCallback((locations: any[], center: CoordType | null = null) => {
    if (!locations || locations.length === 0) return;
    
    console.log('추천 장소 처리:', locations.length, '개의 장소');
    
    // 연관추천 탭에 표시할 장소 정보 저장
    const placesToSave = locations.map(loc => {
      return {
        textid: loc.textid || `loc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: loc.name || '추천 장소',
        description: loc.description || '',
        category: loc.category || '관광지',
        address: loc.address || '주소 정보 없음',
        location: {
          lat: loc.coordinates ? loc.coordinates.lat : (loc.latitude || loc.lat),
          lng: loc.coordinates ? loc.coordinates.lng : (loc.longitude || loc.lng)
        }
      };
    });
    
    // 추천 장소 리스트 설정 - UI 표시용
    setRecommendedPlaces(placesToSave);
    
    // 추천 마커 업데이트
    const markersToShow = updateRecommendedMarkers(locations);
    
    // 추천 마커가 있을 경우 화면 조정 (딜레이를 더 길게 설정)
    if (markersToShow.length > 0) {
      fitBoundsToMarkers(markersToShow, 80, 600);
    }
    
    // 자동으로 연관추천 탭으로 전환
    switchTab("recommendations");
  }, [updateRecommendedMarkers, fitBoundsToMarkers, switchTab]);

  // 추가: 추천 장소를 동선에 추가하는 함수
  const addRecommendedPlaceToRoute = (place: any) => {
    if (!routes.length) {
      // 경로가 없는 경우 새 경로 생성
      const newRoute: Route = {
        textid: `route-${Date.now()}`,
        route_data: {
          places: [place],
          travel_time: 180,
          total_cost: 30000
        },
        votes: {},
        is_selected: false
      };
      
      setRoutes([newRoute]);
    } else {
      // 기존 경로가 있는 경우, 장소 추가 (중복 방지)
      const existingPlaceNames = routes[0].route_data.places.map((p: Place) => p.name);
      
      if (!existingPlaceNames.includes(place.name)) {
        setRoutes(prev => {
          const updated = [...prev];
          updated[0] = {
            ...updated[0],
            route_data: {
              ...updated[0].route_data,
              places: [...updated[0].route_data.places, place]
            }
          };
          return updated;
        });
      }
    }
    
    // 성공 알림 표시
    toast(`"${place.name}"이(가) 동선에 추가되었습니다.`);
  };

  // 추가: 추천 장소를 공용 KEEP 목록에 추가하는 함수 - 커스텀 훅 사용
  const addRecommendedPlaceToKeep = (place: any) => {
    // 이미 보관함에 있는지 확인
    const existingPlaceNames = keepPlaces.map(p => p.name);
    
    if (!existingPlaceNames.includes(place.name)) {
      // 없으면 KEEP에 추가 (커스텀 훅 함수 사용)
      addToKeep(place);
    } else {
      // 이미 있으면 알림
      toast(`"${place.name}"은(는) 이미 공용 보관함에 있습니다.`);
    }
  };

  // 팀 채팅 메시지 전송 함수
  const handleSendTeamMessage = async () => {
    if (!teamChatInput.trim() || teamSubmitting) return;
    
    setTeamSubmitting(true);
    
    try {
      // 익명 사용자 ID 처리
      const userId = isAnonymous ? `anonymous-${anonymousInfo?.id}` : currentUser?.id;
      if (!userId) {
        setError('로그인이 필요합니다.');
        return;
      }
      
      // 닉네임 가져오기 (room_members 테이블에서 먼저 확인)
      let nickname = '사용자';
      
      // 현재 사용자의 room_members 정보 찾기
      // 익명 사용자의 경우 anonymous_id로 찾아야 함
      const currentMember = isAnonymous 
        ? members.find(m => m.anonymous_id === anonymousInfo?.id)
        : members.find(m => m.user_id === currentUser?.id);
      
      if (currentMember?.nickname) {
        nickname = currentMember.nickname;
      } else if (currentUser?.nickname) {
        nickname = currentUser.nickname;
      } else if (currentUser?.email) {
        nickname = currentUser.email.split('@')[0];
      } else if (anonymousInfo?.nickname) {
        nickname = anonymousInfo.nickname;
      }
      
      // 메시지 ID 생성
      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 메시지 UI에 즉시 추가
      const newMessage = {
        id: messageId,
        content: teamChatInput,
        sender: {
          id: userId,
          name: nickname,
          avatar: currentUser?.user_metadata?.avatar_url || anonymousInfo?.avatar_url
        },
        timestamp: new Date(),
        isAI: false,
        isAIChat: false // 팀 채팅 메시지
      };
      
      setTeamMessages(prev => [...prev, newMessage]);
      setTeamChatInput(''); // 입력창 초기화
      
      // 메시지 브로드캐스트 - 실시간 업데이트
      broadcastChatMessage(roomId, newMessage);
      
      // 메시지 저장 - team_chat_messages 테이블 사용
      // 데이터베이스에는 원본 ID 전달 (익명 사용자의 경우 prefix 없이)
      const dbUserId = isAnonymous ? anonymousInfo?.id : currentUser?.id;
      await sendChatMessage(roomId, dbUserId || '', teamChatInput, false);
      
    } catch (err: any) {
      console.error('팀 메시지 전송 오류:', err);
      setError('메시지를 전송하는 중 오류가 발생했습니다.');
    } finally {
      setTeamSubmitting(false);
    }
  };

  // AI 채팅 메시지 전송 함수
  const handleSendAiMessage = async () => {
    if (!aiChatInput.trim() || aiSubmitting) return;
    
    setAiSubmitting(true);
    
    try {
      // 익명 사용자 ID 처리
      const userId = isAnonymous ? `anonymous-${anonymousInfo?.id}` : currentUser?.id;
      if (!userId) {
        setError('로그인이 필요합니다.');
        return;
      }
      
      // 닉네임 가져오기 (room_members 테이블에서 먼저 확인)
      let nickname = '사용자';
      
      // 현재 사용자의 room_members 정보 찾기
      // 익명 사용자의 경우 anonymous_id로 찾아야 함
      const currentMember = isAnonymous 
        ? members.find(m => m.anonymous_id === anonymousInfo?.id)
        : members.find(m => m.user_id === currentUser?.id);
        
      if (currentMember?.nickname) {
        nickname = currentMember.nickname;
      } else if (currentUser?.nickname) {
        nickname = currentUser.nickname;
      } else if (currentUser?.email) {
        nickname = currentUser.email.split('@')[0];
      } else if (anonymousInfo?.nickname) {
        nickname = anonymousInfo.nickname;
      }
      
      // 메시지 ID 생성
      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 사용자 메시지 UI에 즉시 추가
      const userMessage = {
        id: messageId,
        content: aiChatInput,
        sender: {
          id: userId,
          name: nickname,
          avatar: currentUser?.user_metadata?.avatar_url || anonymousInfo?.avatar_url
        },
        timestamp: new Date(),
        isAI: false,
        isAIChat: true // AI 채팅 메시지
      };
      
      setAiMessages(prev => [...prev, userMessage]);
      setAiChatInput(''); // 입력창 초기화
      
      // 메시지 저장 - ai_chat_messages 테이블 사용
      // 데이터베이스에는 원본 ID 전달 (익명 사용자의 경우 prefix 없이)
      const dbUserId = isAnonymous ? anonymousInfo?.id : currentUser?.id;
      await sendChatMessage(roomId, dbUserId || '', aiChatInput, true);
      
      try {
        // AI 응답 생성 - API 엔드포인트 직접 호출
        const response = await fetch(`/api/rooms/${roomId}/recommand`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomId,
            query: aiChatInput
          }),
        });
        
        if (!response.ok) {
          throw new Error('AI 응답 생성 실패');
        }
        
        const aiResponseData = await response.json();
        
        if (aiResponseData) {
          // AI 응답 메시지 ID 생성
          const aiMessageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          // 응답 데이터 처리
          let aiResponseContent = '';
          let coordinates: {lat: number; lng: number}[] = [];
          
          // API 응답이 배열인 경우(장소 목록)
          if (Array.isArray(aiResponseData)) {
            // 추천 장소 목록 형식인 경우 - 이름과 설명만 간단하게 표시
            aiResponseContent = aiResponseData.map((place) => 
              `${place.name}\n${place.description || '추천 장소'}`
            ).join('\n\n');
            
            // 좌표 정보 수집
            coordinates = aiResponseData.map(place => ({
              lat: place.coordinates?.lat || 0,
              lng: place.coordinates?.lng || 0
            })).filter(coord => coord.lat !== 0 && coord.lng !== 0);
          } else {
            // 일반 텍스트 응답인 경우
            aiResponseContent = typeof aiResponseData === 'string' 
              ? aiResponseData 
              : JSON.stringify(aiResponseData);
          }
          
          // AI 응답 메시지 UI에 추가
          const aiMessage = {
            id: aiMessageId,
            content: aiResponseContent,
            sender: {
              id: 'ai',
              name: 'AI 어시스턴트'
            },
            timestamp: new Date(),
            isAI: true,
            isAIChat: true,
            coordinates: coordinates
          };
          
          setAiMessages(prev => [...prev, aiMessage]);
          
          // AI 응답 저장 - ai_chat_messages 테이블 사용
          await sendAIMessage(roomId, aiResponseContent, dbUserId || '', true);
          
          // 위치 좌표가 포함된 경우 자동으로 지도에 표시
          if (coordinates && coordinates.length > 0) {
            console.log('AI 응답에 좌표 정보가 포함되어 있습니다:', coordinates);
            
            // 좌표 데이터를 사용하여 추천 장소 목록 생성
            const places = aiResponseData.map((place: any, index: number) => ({
              name: place.name || `추천 장소 ${index + 1}`,
              description: place.description || '',
              category: place.category || '추천 장소',
              address: place.address || '주소 정보 없음',
              coordinates: place.coordinates || { lat: 0, lng: 0 },
              textid: `rec-${Date.now()}-${index}`
            })).filter((place: any) => 
              place.coordinates && 
              place.coordinates.lat !== 0 && 
              place.coordinates.lng !== 0
            );
            
            // 추천 장소 지도에 표시 및 연관추천 탭 활성화
            if (places.length > 0) {
              handleRecommendedLocations(places);
            }
          }
        }
      } catch (apiError) {
        console.error('AI 응답 생성 API 오류:', apiError);
        
        // 백업 응답 생성 - ChatContainer 컴포넌트에서 위치 추천 기능 사용
        const chatContainerResponse = await fetch(`/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: aiChatInput
          }),
        });
        
        if (chatContainerResponse.ok) {
          const backupResponseData = await chatContainerResponse.json();
          
          // AI 응답 생성
          const aiMessageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          const aiMessage = {
            id: aiMessageId,
            content: backupResponseData.reply || '죄송합니다. 현재 추천 시스템에 문제가 있습니다.',
            sender: {
              id: 'ai',
              name: 'AI 어시스턴트'
            },
            timestamp: new Date(),
            isAI: true,
            isAIChat: true
          };
          
          setAiMessages(prev => [...prev, aiMessage]);
        } else {
          // 모든 방법 실패 시 기본 메시지 표시
          const aiMessageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          const aiMessage = {
            id: aiMessageId,
            content: '죄송합니다. 현재 추천 시스템에 문제가 있어 응답을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.',
            sender: {
              id: 'ai',
              name: 'AI 어시스턴트'
            },
            timestamp: new Date(),
            isAI: true,
            isAIChat: true
          };
          
          setAiMessages(prev => [...prev, aiMessage]);
        }
      }
    } catch (err: any) {
      console.error('AI 메시지 전송 오류:', err);
      setError('메시지를 전송하는 중 오류가 발생했습니다.');
    } finally {
      setAiSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      {/* 카카오맵 스크립트 로더 추가 */}
      <KakaoScriptLoader />
      
      {/* 상단 헤더 */}
      <div className="border-b border-gray-200">
        <div className="flex items-center p-4">
          <Link href="/mypage" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{room?.title || '방제목'}</h1>
        </div>
      </div>
      
      {/* 메인 컨텐츠 - 네이버 지도 스타일 인터페이스 */}
      <div className="flex flex-row h-[calc(100vh-64px)]">
        {/* 왼쪽 세로 탭 */}
        <div className="flex flex-row">
          {/* 탭 버튼 영역 */}
          <div className="w-20 bg-gray-100 flex flex-col items-center border-r border-gray-200">
            <Button 
              variant={activeTab === "members" ? "default" : "ghost"}
              size="icon" 
              className={`h-20 w-20 rounded-none ${activeTab === "members" ? "bg-blue-600" : ""}`}
              onClick={() => switchTab("members")}
            >
              <Users className="h-10 w-10" />
            </Button>
            <Button 
              variant={activeTab === "routes" ? "default" : "ghost"}
              size="icon" 
              className={`h-20 w-20 rounded-none ${activeTab === "routes" ? "bg-blue-600" : ""}`}
              onClick={() => switchTab("routes")}
            >
              <MapPin className="h-10 w-10" />
            </Button>
            <Button 
              variant={activeTab === "recommendations" ? "default" : "ghost"}
              size="icon" 
              className={`h-20 w-20 rounded-none ${activeTab === "recommendations" ? "bg-blue-600" : ""}`}
              onClick={() => switchTab("recommendations")}
            >
              <Star className="h-10 w-10" />
            </Button>
          </div>
          
          {/* 탭 내용 영역 */}
          <div className="w-[400px] border-r border-gray-200 overflow-hidden">
            {/* 참여 인원 탭 */}
            {activeTab === "members" && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-bold text-lg">참여 인원</h2>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {members.map(member => (
                    <div key={member.textid} className="flex items-center justify-between py-3 px-4 border-b border-gray-100">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                          {(member.nickname || member.email || '익명')?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.nickname || member.email?.split('@')[0] || '익명 사용자'}
                            {member.user_id === currentUser?.id && ' (나)'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {member.user_id === room?.owner_id ? '방장' : '참여자'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        {/* {member.status === 'ready' ? (
                          <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full mr-2">완료</span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-full mr-2">진행 중</span>
                        )} */}
                        {member.user_id !== currentUser?.id && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleAddFriend(member.user_id)}
                            className="h-8 w-8"
                            disabled={member.is_friend}
                          >
                            {member.is_friend ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <UserPlus className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 선택한 동선 탭 */}
            {activeTab === "routes" && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-bold text-lg">모두의 동선</h2>
                  
                  {/* 카테고리 필터 버튼 */}
                  {/* <div className="flex mt-2 space-x-2 overflow-x-auto pb-2">
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      음식
                    </Button>
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      카페
                    </Button>
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      전시
                    </Button>
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      자연
                    </Button>
                  </div> */}
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  {routes.length > 0 ? (
                    <div>
                      {/* 첫 번째 선택한 동선만 표시 */}
                      <div className="mb-4">
                        <div className="px-4 py-2 bg-gray-50 font-medium flex justify-between items-center">
                          <span>동선 (드래그하여 순서 변경)</span>
                        </div>
                        
                        <Reorder.Group 
                          axis="y" 
                          values={routes[0]?.route_data.places || []} 
                          onReorder={handleReorderPlaces}
                        >
                          {routes[0].route_data.places.map((place: Place, index: number) => (
                            <Reorder.Item 
                              key={place.textid || `place-${index}`}
                              value={place} 
                              className="p-4 border-b border-gray-100 bg-white cursor-move"
                            >
                              <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center">
                                  <GripVertical className="h-4 w-4 mr-2 text-gray-400" />
                                  <h3 className="font-medium">{index + 1}. {place.name}</h3>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-xs bg-gray-100 px-2 py-1 rounded-full mr-2">{place.category}</span>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-gray-400 hover:text-red-500"
                                    onClick={(e) => {
                                      e.stopPropagation(); // 이벤트 전파 방지
                                      moveToKeep(place, index);
                                    }}
                                  >
                                    <ArrowDownCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2">{place.description}</p>
                              <p className="text-xs text-gray-500 mt-1">{place.address}</p>
                              <div className="flex items-center mt-2 space-x-2">
                                <Button 
                                    variant={getUserVote(place) === 'like' ? "default" : "outline"}
                                    size="sm" 
                                    className={`h-7 px-2 text-xs ${getUserVote(place) === 'like' ? "bg-green-500 hover:bg-green-600" : ""}`}
                                    onClick={() => {
                                        if (!place || !place.textid) {
                                            console.error('유효하지 않은 장소 ID:', place?.textid);
                                            toast.error('유효하지 않은 장소입니다');
                                            return;
                                        }
                                        handlePlaceVote(place.textid, 'up');
                                    }}
                                >
                                    <ThumbsUp className={`h-3 w-3 mr-1 ${getUserVote(place) === 'like' ? "text-white" : ""}`} />
                                    찬성 {getVoteCount(place, 'like')}
                                </Button>
                                <Button 
                                    variant={getUserVote(place) === 'dislike' ? "default" : "outline"}
                                    size="sm" 
                                    className={`h-7 px-2 text-xs ${getUserVote(place) === 'dislike' ? "bg-red-500 hover:bg-red-600" : ""}`}
                                    onClick={() => {
                                        if (!place || !place.textid) {
                                            console.error('유효하지 않은 장소 ID:', place?.textid);
                                            toast.error('유효하지 않은 장소입니다');
                                            return;
                                        }
                                        handlePlaceVote(place.textid, 'down');
                                    }}
                                >
                                    <ThumbsDown className={`h-3 w-3 mr-1 ${getUserVote(place) === 'dislike' ? "text-white" : ""}`} />
                                    반대 {getVoteCount(place, 'dislike')}
                                </Button>
                              </div>
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>
                      </div>

                      {/* 장소 KEEP 섹션 */}
                      <div className="p-4 border-t border-gray-200">
                        <h3 className="font-medium text-sm text-gray-500 mb-2">장소 KEEP</h3>
                        <div className="space-y-3">
                          {keepPlaces.length > 0 ? (
                            keepPlaces.map((place, index) => (
                              <div key={place.textid} className="p-3 border border-gray-100 rounded-md bg-white">
                                <div className="flex justify-between items-center mb-1">
                                  <h3 className="font-medium text-sm">{place.name}</h3>
                                  <div className="flex items-center">
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full mr-2">{place.category}</span>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-6 w-6 text-gray-400 hover:text-blue-500"
                                      onClick={() => moveToRoute(place)}
                                    >
                                      <ArrowUp className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-500">{place.address}</p>
                                <div className="flex justify-end mt-2">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-gray-400 hover:text-red-500"
                                    onClick={() => removeFromKeep(place.textid)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-center text-gray-400">
                              동선에서 내려보낸 장소가 여기에 표시됩니다
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center bg-white">
                      <p className="text-gray-500 mb-4">추천 경로를 불러오는 중입니다...</p>
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 연관 추천 탭 */}
            {activeTab === "recommendations" && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-bold text-lg">연관 추천</h2>
                </div>
                
                {/* 변경: 추천 장소 목록 표시 */}
                <div className="flex-1 overflow-y-auto">
                  {recommendedPlaces.length > 0 ? (
                    <div className="p-4 space-y-4">
                      <h3 className="font-medium text-sm text-gray-500">추천 장소</h3>
                      {recommendedPlaces.map((place: RecommendedPlace) => (
                        <div key={place.textid} className="p-4 border border-gray-200 rounded-md bg-white">
                          <div className="flex justify-between items-center mb-2">
                            <h3 className="font-medium">{place.name}</h3>
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{place.category}</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{place.description}</p>
                          <p className="text-xs text-gray-500 mb-3">{place.address}</p>
                          <div className="flex space-x-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => addRecommendedPlaceToKeep(place)}
                              className="text-xs"
                            >
                              장소 KEEP에 추가
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => addRecommendedPlaceToRoute(place)}
                              className="text-xs"
                            >
                              동선에 추가
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-t border-gray-200 p-4">
                      <h3 className="font-medium text-sm text-gray-500 mb-2">추천 장소</h3>
                      <div className="text-center py-8 text-gray-500">
                        <p>AI 어시스턴트에게 장소 추천을 요청해보세요.</p>
                        <p className="text-sm mt-2">예: "서울에서 가볼만한 곳 추천해줘"</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="border-t border-gray-200 p-4">
                    <h3 className="font-medium text-sm text-gray-500 mb-2">인기 장소</h3>
                    {popularPlaces.length > 0 ? (
                      <div className="space-y-3">
                        {popularPlaces.slice(0, 3).map((place) => (
                          <PlaceCard
                            key={place.textid}
                            place={{
                              textid: place.textid,
                              name: place.name || '이름 없음',
                              category: place.category || '기타',
                              address: place.address || '',
                              description: place.description || '',
                              image_url: place.image_url,
                              price_level: place.price_level,
                              rating: place.rating,
                              recommendation_reason: place.recommendation_reason,
                              is_recommended: place.is_recommended
                            }}
                            showActions={false}
                          />
                        ))}
                      </div>
                    ) : routes.length > 0 ? (
                      <div className="space-y-3">
                        {routes[0]?.route_data.places.slice(0, 3).map((place: Place) => (
                          <PlaceCard
                            key={place.textid}
                            place={{
                              textid: place.textid,
                              name: place.name,
                              category: place.category || '기타',
                              address: place.address || '',
                              description: place.description || '',
                              image_url: place.image_url
                            }}
                            showActions={false}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4 text-center bg-white">
                        <p className="text-gray-500">추천 장소를 불러오는 중...</p>
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mt-2" />
                      </div>
                    )}
                  </div>
                  
                  {/* 장소 탐색 기능 추가 */}
                  <div className="border-t border-gray-200 p-4">
                    <Button 
                      variant="outline" 
                      className="w-full flex items-center justify-center gap-2"
                      onClick={() => switchTab("explore")}
                    >
                      <Search className="h-4 w-4" />
                      주변 장소 탐색하기
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {/* 주변 장소 탐색 탭 추가 */}
            {activeTab === "explore" && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-bold text-lg">주변 장소 탐색</h2>
                </div>
                
                <div className="flex-1 overflow-hidden">
                  <MapExplorer 
                    initialCenter={mapCenter}
                    initialLevel={mapLevel}
                    onSelectPlace={(place) => {
                      if (place) {
                        // 선택한 장소 처리
                        console.log('장소 선택됨:', place);
                        
                        // 옵션: KEEP에 추가
                        if (confirm(`"${place.name}" 장소를 KEEP 목록에 추가하시겠습니까?`)) {
                          addToKeep(place);
                        }
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* 중앙 - 지도 영역 */}
        <div className="flex-1 relative min-h-full">
          <div className="absolute inset-0">
            <KakaoMap
              ref={mapRef}
              width="100%"
              height="calc(110vh - 182px)"
              initialCenter={mapCenter}
              initialLevel={mapLevel}
              markers={[
                ...mapStore.markers.map(marker => ({
                  ...marker,
                  title: marker.title || '위치'
                })),
                ...recommendedMarkers.map(marker => ({
                  ...marker,
                  title: marker.title || '추천 위치'
                }))
              ]}
              polyline={mapStore.polyline}
              onClick={(lat, lng) => {
                console.log('지도 클릭:', lat, lng);
              }}
              onMapLoad={() => setMapReady(true)}
            />
          </div>
          
          {/* 팀 채팅 카드 - 조건부 렌더링 */}
          {showTeamChat && (
            <div className="absolute top-4 right-4 w-[350px] flex flex-col gap-4 z-[50]">
              <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
                <div className="p-4 border-b border-gray-200 bg-white">
                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-lg flex items-center">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      팀 채팅
                    </h2>
                    <Button variant="ghost" size="icon" onClick={() => setShowTeamChat(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="h-[500px]">
                  <ChatContainer
                    messages={teamMessages}
                    currentUser={{
                      id: currentUser?.id || '',
                      name: currentUser?.user_metadata?.nickname || currentUser?.email || '사용자'
                    }}
                    onSendMessage={handleSendTeamMessage}
                    onRecommendLocations={handleRecommendedLocations}
                    className="h-full"
                    loading={teamSubmitting}
                    input={teamChatInput}
                    onChangeInput={(e) => setTeamChatInput(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* AI 채팅 오버레이 UI */}
          {showAiChat && (
            <div className="absolute bottom-20 left-4 w-[350px] h-[450px] bg-white shadow-lg rounded-lg overflow-hidden z-[101] border border-gray-200">
              <div className="p-4 border-b border-gray-200 bg-white">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-lg flex items-center">
                    <Bot className="h-4 w-4 mr-2" />
                    AI 여행 어시스턴트
                  </h2>
                  <Button variant="ghost" size="icon" onClick={() => setShowAiChat(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="h-[calc(100%-60px)]">
                <ChatContainer
                  messages={aiMessages}
                  currentUser={{
                    id: currentUser?.id || '',
                    name: currentUser?.user_metadata?.nickname || currentUser?.email || '사용자'
                  }}
                  onSendMessage={handleSendAiMessage}
                  onRecommendLocations={handleRecommendedLocations}
                  className="h-full"
                  isAIChat={true}
                  loading={aiSubmitting}
                  input={aiChatInput}
                  onChangeInput={(e) => setAiChatInput(e.target.value)}
                />
              </div>
            </div>
          )}
          
          {/* 하단 버튼 영역 */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-white bg-opacity-90 border-t border-gray-200 flex justify-between z-[50] shadow-md">
            <div className="flex gap-2">
              {/* AI 채팅 버튼 */}
              <Button 
                variant="outline"
                size="lg" 
                className="rounded-full bg-white shadow-md px-6"
                onClick={() => setShowAiChat(!showAiChat)}
              >
                <Bot className="h-7 w-7 mr-2" />
                AI 어시스턴트
              </Button>
              
              {/* 팀 채팅 버튼 */}
              <Button 
                variant="outline"
                size="lg" 
                className="rounded-full bg-white shadow-md px-6"
                onClick={() => setShowTeamChat(!showTeamChat)}
              >
                <MessageSquare className="h-7 w-7 mr-2" />
                팀 채팅
              </Button>
            </div>
            
            <Button
              onClick={() => {
                if (typeof window !== "undefined") {
                  const url = window.location.href;
                  navigator.clipboard.writeText(url)
                    .then(() => {
                      alert("방 링크가 클립보드에 복사되었습니다.");
                    })
                    .catch(err => {
                      console.error('URL 복사 실패:', err);
                      alert("링크 복사에 실패했습니다.");
                    });
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-6 text-lg"
              size="lg"
            >
              공유하기
            </Button>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-500 text-center">
          {error}
        </div>
      )}
    </main>
  )
} 