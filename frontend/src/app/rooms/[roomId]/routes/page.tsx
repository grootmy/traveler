'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { joinRoomRealtime, leaveRoomRealtime, subscribeToVoteUpdates, updateVoteRealtime, subscribeToRouteSelection, selectRouteRealtime } from '@/lib/supabase/realtime'
import KakaoMap from '@/components/KakaoMap'
import RouteVisualization from '@/components/RouteVisualization'
import { ArrowLeft, ThumbsUp, ThumbsDown, Loader2, UserPlus, Check, Users, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Member = {
  textid: string;
  user_id: string;
  nickname?: string;
  status: 'pending' | 'ready';
  email?: string;
  is_friend?: boolean;
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
  votes: Record<string, 'like' | 'dislike'>;
  is_selected: boolean;
}

type Room = {
  textid: string;
  title: string;
  owner_id: string;
}

export default function RoutesPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
  const [processingSelection, setProcessingSelection] = useState(false)
  const [activeTab, setActiveTab] = useState("places")
  const [allMembersReady, setAllMembersReady] = useState(false)
  const [generatingRoutes, setGeneratingRoutes] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const router = useRouter()
  const { roomId } = params

  // 더미 데이터 - 실제로는 API에서 가져와야 함
  const dummyRoutes = [
    {
      textid: '1',
      route_data: {
        places: [
          { textid: '1', name: '광장시장', category: '관광지', address: '서울 중구 종로 88', description: '서울의 대표적인 전통시장', location: { lat: 37.5701, lng: 126.9986 } },
          { textid: '2', name: '광화문광장', category: '관광지', address: '서울 종로구 세종로 172', description: '서울의 중심 광장', location: { lat: 37.5759, lng: 126.9769 } },
          { textid: '3', name: '국립극장', category: '문화시설', address: '서울 중구 장충단로 59', description: '한국의 대표적인 공연장', location: { lat: 37.5525, lng: 127.0073 } },
        ],
        travel_time: 180,
        total_cost: 30000
      },
      votes: {},
      is_selected: false
    },
    {
      textid: '2',
      route_data: {
        places: [
          { textid: '4', name: '청계천', category: '자연', address: '서울 종로구 청계천로', description: '서울 도심을 가로지르는 하천', location: { lat: 37.5696, lng: 126.9784 } },
          { textid: '5', name: '덕수궁', category: '역사', address: '서울 중구 세종대로 99', description: '조선시대의 궁궐', location: { lat: 37.5655, lng: 126.9751 } },
          { textid: '6', name: '명동성당', category: '종교', address: '서울 중구 명동길 74', description: '서울의 대표적인 성당', location: { lat: 37.5633, lng: 126.9873 } },
        ],
        travel_time: 150,
        total_cost: 25000
      },
      votes: {},
      is_selected: false
    },
    {
      textid: '3',
      route_data: {
        places: [
          { textid: '7', name: '남산타워', category: '관광지', address: '서울 용산구 남산공원길 105', description: '서울의 랜드마크', location: { lat: 37.5511, lng: 126.9882 } },
          { textid: '8', name: '이태원', category: '상권', address: '서울 용산구 이태원로', description: '다양한 문화가 공존하는 거리', location: { lat: 37.5344, lng: 126.9947 } },
          { textid: '9', name: '경복궁', category: '역사', address: '서울 종로구 사직로 161', description: '조선의 정궁', location: { lat: 37.5796, lng: 126.9770 } },
        ],
        travel_time: 200,
        total_cost: 35000
      },
      votes: {},
      is_selected: false
    }
  ];

  // 더미 멤버 데이터
  const dummyMembers = [
    { textid: '1', user_id: '1', nickname: '요요', status: 'ready' as const, email: 'yoyo@example.com', is_friend: true },
    { textid: '2', user_id: '2', nickname: '오늘도 즐거움', status: 'ready' as const, email: 'happy@example.com', is_friend: false },
    { textid: '3', user_id: '3', nickname: '다다', status: 'pending' as const, email: 'dada@example.com', is_friend: false },
    { textid: '4', user_id: '4', nickname: 'KKKKKdfsfsfsf', status: 'ready' as const, email: 'kkk@example.com', is_friend: true },
  ];

  useEffect(() => {
    const init = async () => {
      try {
        // 현재 사용자 확인
        const { user, error: authError } = await getCurrentUser()
        
        if (authError || !user) {
          router.push('/')
          return
        }
        
        setCurrentUser(user)
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('textid', roomId)
          .single()
        
        if (roomError) throw roomError
        
        setRoom(roomData)
        setIsOwner(roomData.owner_id === user.id)
        
        // 멤버 정보 가져오기
        await fetchMembers()
        
        // 경로 정보 가져오기 (항상 호출)
        await fetchRoutes()
        
        // 초기 탭을 places로 설정하여 바로 경로 표시
        setActiveTab("places")
        
        // Supabase Realtime 연결
        joinRoomRealtime(roomId)
        
        // 투표 업데이트 이벤트 리스너
        subscribeToVoteUpdates(roomId, ({ routeId, userId, voteType }) => {
          setRoutes(prev => prev.map(route => {
            if (route.textid === routeId) {
              const newVotes = { ...route.votes, [userId]: voteType }
              return { ...route, votes: newVotes }
            }
            return route
          }))
        })
        
        // 경로 선택 이벤트 리스너
        subscribeToRouteSelection(roomId, ({ routeId }) => {
          setSelectedRouteId(routeId)
          
          // 선택된 경로가 있으면 결과 페이지로 이동
          if (routeId) {
            router.push(`/rooms/${roomId}/result`)
          }
        })
        
        setLoading(false)
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
    
    return () => {
      // 정리 함수
      leaveRoomRealtime(roomId)
    }
  }, [roomId, router])

  const fetchRoutes = async () => {
    try {
      // 경로 정보 가져오기
      const { data: routesData, error: routesError } = await supabase
        .from('routes')
        .select('*')
        .eq('room_id', roomId)
      
      if (routesError) throw routesError
      
      if (!routesData || routesData.length === 0) {
        // 경로가 없으면 더미 데이터 사용 (개발용)
        setRoutes(dummyRoutes);
        return;
      }
      
      // 투표 정보 가져오기
      const { data: votesData, error: votesError } = await supabase
        .from('route_votes')
        .select('*')
        .eq('room_id', roomId)
      
      if (votesError) throw votesError
      
      // 경로 정보와 투표 정보 합치기
      const routesWithVotes = routesData.map(route => {
        const routeVotes = votesData
          ? votesData
              .filter(vote => vote.route_id === route.textid)
              .reduce((acc, vote) => {
                acc[vote.user_id] = vote.vote_type
                return acc
              }, {} as Record<string, 'like' | 'dislike'>)
          : {};
        
        return {
          ...route,
          votes: routeVotes,
          is_selected: route.is_selected || false
        }
      })
      
      setRoutes(routesWithVotes)
      
      // 선택된 경로가 있는지 확인
      const selectedRoute = routesWithVotes.find(route => route.is_selected)
      if (selectedRoute) {
        setSelectedRouteId(selectedRoute.textid)
        
        // 선택된 경로가 있으면 결과 페이지로 이동
        router.push(`/rooms/${roomId}/result`)
      }
    } catch (err: any) {
      console.error('경로 정보 가져오기 오류:', err)
    }
  }

  const fetchMembers = async () => {
    try {
      // 멤버 정보 가져오기
      const { data: membersData, error: membersError } = await supabase
        .from('room_members')
        .select(`
          textid, 
          user_id, 
          nickname, 
          status,
          user:user_id (textid, email, nickname, avatar_url)
        `)
        .eq('room_id', roomId)
      
      if (membersError) throw membersError
      
      if (!membersData || membersData.length === 0) {
        // 멤버가 없으면 더미 데이터 사용 (개발용)
        setMembers(dummyMembers);
        // 모든 멤버가 준비되었는지 확인
        const allReady = dummyMembers.every(member => member.status === 'ready');
        setAllMembersReady(allReady);
        return;
      }
      
      // 이메일 정보와 친구 정보를 함께 처리
      const processedMembers = membersData.map(member => {
        // user 객체가 단일 객체가 아닌 배열 타입으로 인식되는 문제 해결
        const userObj = member.user as any;
        
        return {
          textid: member.textid,
          user_id: member.user_id,
          nickname: member.nickname || (userObj && userObj.nickname) || '익명',
          status: member.status || 'pending',
          email: userObj && userObj.email,
          is_friend: false // 기본값, 친구 기능 구현 시 업데이트
        }
      });
      
      setMembers(processedMembers);
      
      // 모든 멤버가 준비되었는지 확인
      const allReady = processedMembers.every(member => member.status === 'ready');
      setAllMembersReady(allReady);
      
    } catch (err: any) {
      console.error('멤버 정보 가져오기 오류:', err)
    }
  }

  const handleVote = (routeId: string, voteType: 'like' | 'dislike') => {
    if (!currentUser) return
    
    // 현재 투표 상태 확인
    const route = routes.find(r => r.textid === routeId)
    if (!route) return
    
    const currentVote = route.votes[currentUser.id]
    
    // 같은 투표 타입이면 투표 취소
    const newVoteType = currentVote === voteType ? null : voteType
    
    // 로컬 상태 업데이트
    setRoutes(prev => prev.map(route => {
      if (route.textid === routeId) {
        const newVotes = { ...route.votes }
        
        if (newVoteType === null) {
          delete newVotes[currentUser.id]
        } else {
          newVotes[currentUser.id] = newVoteType
        }
        
        return { ...route, votes: newVotes }
      }
      return route
    }))
    
    // 서버에 투표 업데이트
    if (newVoteType) {
      updateVoteRealtime(roomId, routeId, currentUser.id, newVoteType)
    } else {
      // 투표 취소 처리
      updateVoteRealtime(roomId, routeId, currentUser.id, null as any)
    }
  }

  // 장소별 투표 처리 함수
  const handlePlaceVote = (placeId: string, voteType: 'up' | 'down') => {
    // 'up'을 'like'로, 'down'을 'dislike'로 변환
    const convertedVoteType = voteType === 'up' ? 'like' : 'dislike';
    
    // 기존 함수 호출
    handleVote(placeId, convertedVoteType);
  }

  const handleSelectRoute = async (routeId: string) => {
    if (!currentUser || !isOwner) return
    
    setProcessingSelection(true)
    
    try {
      // 서버에 선택된 경로 업데이트
      await selectRouteRealtime(roomId, routeId)
      
      // 로컬 상태 업데이트
      setSelectedRouteId(routeId)
      
      // 결과 페이지로 이동
      router.push(`/rooms/${roomId}/result`)
    } catch (err: any) {
      console.error('경로 선택 오류:', err)
      setError(err.message || '경로 선택 중 오류가 발생했습니다')
    } finally {
      setProcessingSelection(false)
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

  const getVoteCount = (route: Route, type: 'like' | 'dislike') => {
    return Object.values(route.votes).filter(vote => vote === type).length
  }

  const getUserVote = (route: Route) => {
    if (!currentUser) return null
    return route.votes[currentUser.id] || null
  }

  // 경로 생성 시작 함수
  const handleStartGeneration = async () => {
    // 모든 멤버가 준비되었는지 확인
    const allReady = members.every(member => member.status === 'ready')
    
    if (!allReady && !showConfirmModal) {
      setShowConfirmModal(true)
      return
    }
    
    setGeneratingRoutes(true)
    setShowConfirmModal(false)
    
    try {
      // 실제 환경에서는 API 호출
      // 여기서는 더미 데이터 사용
      setTimeout(() => {
        // 방장이 강제로 시작한 경우에도 경로 추천 화면으로 넘어가도록 설정
        setAllMembersReady(true)
        setGeneratingRoutes(false)
        // 경로 정보 가져오기
        fetchRoutes()
      }, 2000)
      
      /* 실제 API 호출 코드
      // 경로 생성 API 호출
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await fetch(`/api/rooms/${roomId}/generate-routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token || ''}`
        }
      })
      
      if (!response.ok) {
        throw new Error('경로 생성 중 오류가 발생했습니다')
      }
      
      // 경로 정보 가져오기
      await fetchRoutes()
      setAllMembersReady(true)
      setGeneratingRoutes(false)
      */
    } catch (err: any) {
      console.error('경로 생성 오류:', err)
      setError(err.message || '경로 생성 중 오류가 발생했습니다')
      setGeneratingRoutes(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white">
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
      
      {/* 메인 컨텐츠 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 h-[calc(100vh-64px)]">
        {/* 왼쪽 패널 - 탭 구조 */}
        <div className="border-r border-gray-200 overflow-hidden flex flex-col">
          <Tabs defaultValue="members" className="w-full h-full flex flex-col" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-2 mx-4 my-2">
              <TabsTrigger value="places" className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                <span>추천 장소</span>
              </TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>참여 인원</span>
              </TabsTrigger>
            </TabsList>
            
            {/* 추천 장소 탭 */}
            <TabsContent value="places" className="flex-1 overflow-y-auto p-0 m-0">
              {routes.length > 0 && (
                <>
                  <div className="p-4 border-b border-gray-200">
                    <h2 className="font-bold text-lg">추천안 {selectedRouteIndex + 1}</h2>
                    <div className="flex items-center mt-2 space-x-2">
                      <Button 
                        variant={getUserVote(routes[selectedRouteIndex]) === 'like' ? "default" : "outline"} 
                        size="sm" 
                        className="h-7 px-2 text-xs"
                        onClick={() => handleVote(routes[selectedRouteIndex].textid, 'like')}
                      >
                        <ThumbsUp className="h-3 w-3 mr-1" />
                        찬성 {getVoteCount(routes[selectedRouteIndex], 'like')}
                      </Button>
                      <Button 
                        variant={getUserVote(routes[selectedRouteIndex]) === 'dislike' ? "default" : "outline"} 
                        size="sm" 
                        className="h-7 px-2 text-xs"
                        onClick={() => handleVote(routes[selectedRouteIndex].textid, 'dislike')}
                      >
                        <ThumbsDown className="h-3 w-3 mr-1" />
                        반대 {getVoteCount(routes[selectedRouteIndex], 'dislike')}
                      </Button>
                    </div>
                  </div>
                  
                  {routes[selectedRouteIndex]?.route_data.places.map((place, index) => (
                    <div key={place.textid} className="p-4 border-b border-gray-100">
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="font-medium">{index + 1}. {place.name}</h3>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{place.category}</span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{place.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{place.address}</p>
                      <div className="flex items-center mt-2 space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlaceVote(place.textid, 'up')}
                        >
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          찬성
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlaceVote(place.textid, 'down')}
                        >
                          <ThumbsDown className="h-3 w-3 mr-1" />
                          반대
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              
              {routes.length === 0 && (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-gray-500 mb-4">추천 경로를 불러오는 중입니다...</p>
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              )}
            </TabsContent>
            
            {/* 참여 인원 탭 */}
            <TabsContent value="members" className="flex-1 overflow-y-auto p-0 m-0">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-bold text-lg">참여 인원</h2>
              </div>
              
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
                    {member.status === 'ready' ? (
                      <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full mr-2">완료</span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-full mr-2">진행 중</span>
                    )}
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
            </TabsContent>
          </Tabs>
        </div>
        
        {/* 지도 영역 */}
        <div className="lg:col-span-3 relative">
          {routes.length > 0 ? (
            // 경로 추천 화면
            <>
              <KakaoMap
                height="100%"
                markers={routes[selectedRouteIndex].route_data.places.map((place, index) => ({
                  lat: place.location.lat,
                  lng: place.location.lng,
                  title: `${index + 1}. ${place.name}`,
                  category: place.category.toLowerCase() as any,
                  order: index
                }))}
                polyline={routes[selectedRouteIndex].route_data.places.map(place => ({
                  lat: place.location.lat,
                  lng: place.location.lng
                }))}
                polylineColor={selectedRouteIndex === 0 ? '#3B82F6' : '#06B6D4'}
                useStaticMap={false}
                level={7}
                mapTypeId="ROADMAP"
              />
              
              {/* 하단 버튼 영역 */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-white bg-opacity-90 border-t border-gray-200 flex justify-between z-10 shadow-md">
                <div className="grid grid-cols-3 gap-2 flex-1 mr-4">
                  {routes.map((route, index) => (
                    <Button
                      key={route.textid}
                      variant={selectedRouteIndex === index ? "default" : "outline"}
                      onClick={() => {
                        setSelectedRouteIndex(index);
                        setActiveTab("places"); // 경로 변경 시 자동으로 장소 탭으로 전환
                      }}
                      className="text-sm"
                    >
                      추천 {index + 1}안
                    </Button>
                  ))}
                </div>
                
                {isOwner && (
                  <Button
                    onClick={() => handleSelectRoute(routes[selectedRouteIndex].textid)}
                    disabled={processingSelection}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {processingSelection ? (
                      <div className="flex items-center">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        처리 중...
                      </div>
                    ) : '결정'}
                  </Button>
                )}
              </div>
            </>
          ) : (
            // 경로 생성 대기 화면
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-8">
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
                <h2 className="text-xl font-bold mb-2">경로 추천 준비 중</h2>
                <p className="text-gray-600 mb-6">
                  추천 경로를 불러오는 중입니다. 잠시만 기다려주세요.
                </p>
              </div>
            </div>
          )}
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