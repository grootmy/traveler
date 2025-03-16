'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { joinRoomRealtime, leaveRoomRealtime, subscribeToVoteUpdates, updateVoteRealtime, subscribeToRouteSelection, selectRouteRealtime } from '@/lib/supabase/realtime'
import KakaoMap from '@/components/KakaoMap'
import { ArrowLeft, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react'

type Route = {
  id: string;
  route_data: {
    places: Array<{
      id: string;
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
  id: string;
  title: string;
  owner_id: string;
}

export default function RoutesPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('members')
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
  const [processingSelection, setProcessingSelection] = useState(false)
  const router = useRouter()
  const { roomId } = params

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
          .eq('id', roomId)
          .single()
        
        if (roomError) throw roomError
        
        setRoom(roomData)
        setIsOwner(roomData.owner_id === user.id)
        
        // 경로 정보 가져오기
        await fetchRoutes()
        
        // Supabase Realtime 연결
        joinRoomRealtime(roomId)
        
        // 투표 업데이트 이벤트 리스너
        subscribeToVoteUpdates(roomId, ({ routeId, userId, voteType }) => {
          setRoutes(prev => prev.map(route => {
            if (route.id === routeId) {
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
      
      // 투표 정보 가져오기
      const { data: votesData, error: votesError } = await supabase
        .from('route_votes')
        .select('*')
        .eq('room_id', roomId)
      
      if (votesError) throw votesError
      
      // 경로 정보와 투표 정보 합치기
      const routesWithVotes = routesData.map(route => {
        const routeVotes = votesData
          .filter(vote => vote.route_id === route.id)
          .reduce((acc, vote) => {
            acc[vote.user_id] = vote.vote_type
            return acc
          }, {} as Record<string, 'like' | 'dislike'>)
        
        return {
          ...route,
          votes: routeVotes
        }
      })
      
      setRoutes(routesWithVotes)
      
      // 선택된 경로가 있는지 확인
      const selectedRoute = routesWithVotes.find(route => route.is_selected)
      if (selectedRoute) {
        setSelectedRouteId(selectedRoute.id)
        
        // 선택된 경로가 있으면 결과 페이지로 이동
        router.push(`/rooms/${roomId}/result`)
      }
    } catch (err: any) {
      console.error('경로 정보 가져오기 오류:', err)
    }
  }

  const handleVote = (routeId: string, voteType: 'like' | 'dislike') => {
    if (!currentUser) return
    
    // 현재 투표 상태 확인
    const route = routes.find(r => r.id === routeId)
    if (!route) return
    
    const currentVote = route.votes[currentUser.id]
    
    // 같은 투표 타입이면 투표 취소
    const newVoteType = currentVote === voteType ? null : voteType
    
    // 로컬 상태 업데이트
    setRoutes(prev => prev.map(route => {
      if (route.id === routeId) {
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

  const getVoteCount = (route: Route, type: 'like' | 'dislike') => {
    return Object.values(route.votes).filter(vote => vote === type).length
  }

  const getUserVote = (route: Route) => {
    if (!currentUser) return null
    return route.votes[currentUser.id] || null
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
          <Link href="/" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{room?.title || '방제목'}</h1>
        </div>
      </div>
      
      {/* 탭 메뉴 */}
      <Tabs defaultValue="members" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-gray-200">
          <TabsList className="w-full grid grid-cols-2 bg-transparent h-auto p-0">
            <TabsTrigger 
              value="members" 
              className="py-3 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
            >
              참여 인원
            </TabsTrigger>
            <TabsTrigger 
              value="routes" 
              className="py-3 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none"
            >
              경로추천안
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="members" className="p-0 m-0">
          <div className="grid grid-cols-1 lg:grid-cols-4 h-[calc(100vh-112px)]">
            {/* 왼쪽 패널 */}
            <div className="border-r border-gray-200 overflow-y-auto">
              {routes.length > 0 && routes[selectedRouteIndex]?.route_data.places.map((place, index) => (
                <div key={place.id} className="p-4 border-b border-gray-100">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-medium">{index + 1}. {place.name}</h3>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{place.category}</span>
                  </div>
                  <p className="text-xs text-gray-500">{place.address}</p>
                  <div className="flex items-center mt-2 space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 px-2 text-xs"
                      onClick={() => handleVote(routes[selectedRouteIndex].id, 'like')}
                    >
                      <ThumbsUp className="h-3 w-3 mr-1" />
                      찬성
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 px-2 text-xs"
                      onClick={() => handleVote(routes[selectedRouteIndex].id, 'dislike')}
                    >
                      <ThumbsDown className="h-3 w-3 mr-1" />
                      반대
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* 지도 영역 */}
            <div className="lg:col-span-3 relative">
              {routes.length > 0 && (
                <KakaoMap
                  height="100%"
                  markers={routes[selectedRouteIndex].route_data.places.map((place, index) => ({
                    lat: place.location.lat,
                    lng: place.location.lng,
                    title: `${index + 1}. ${place.name}`,
                    markerType: selectedRouteIndex === 0 ? 'primary' : 'secondary'
                  }))}
                  polyline={routes[selectedRouteIndex].route_data.places.map(place => ({
                    lat: place.location.lat,
                    lng: place.location.lng
                  }))}
                  polylineColor={selectedRouteIndex === 0 ? '#3B82F6' : '#06B6D4'}
                  useStaticMap={false}
                  level={9}
                  mapTypeId="ROADMAP"
                />
              )}
              
              {/* 하단 버튼 영역 */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex justify-between">
                <div className="grid grid-cols-3 gap-2 flex-1 mr-4">
                  {routes.map((route, index) => (
                    <Button
                      key={route.id}
                      variant={selectedRouteIndex === index ? "default" : "outline"}
                      onClick={() => setSelectedRouteIndex(index)}
                      className="text-sm"
                    >
                      추천 {index + 1}안
                    </Button>
                  ))}
                </div>
                
                {isOwner && (
                  <Button
                    onClick={() => handleSelectRoute(routes[selectedRouteIndex].id)}
                    disabled={processingSelection}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {processingSelection ? (
                      <div className="flex items-center">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        처리 중...
                      </div>
                    ) : '다음'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="routes" className="p-0 m-0">
          <div className="grid grid-cols-1 lg:grid-cols-4 h-[calc(100vh-112px)]">
            {/* 왼쪽 패널 */}
            <div className="border-r border-gray-200 overflow-y-auto">
              {routes.length > 0 && routes[selectedRouteIndex]?.route_data.places.map((place, index) => (
                <div key={place.id} className="p-4 border-b border-gray-100">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-medium">{index + 1}. {place.name}</h3>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{place.category}</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{place.description}</p>
                  <p className="text-xs text-gray-500 mt-1">{place.address}</p>
                  <div className="flex items-center mt-2 space-x-2">
                    <Button 
                      variant={getUserVote(routes[selectedRouteIndex]) === 'like' ? 'default' : 'outline'} 
                      size="sm" 
                      className="h-7 px-2 text-xs"
                      onClick={() => handleVote(routes[selectedRouteIndex].id, 'like')}
                    >
                      <ThumbsUp className="h-3 w-3 mr-1" />
                      {getVoteCount(routes[selectedRouteIndex], 'like')}
                    </Button>
                    <Button 
                      variant={getUserVote(routes[selectedRouteIndex]) === 'dislike' ? 'default' : 'outline'} 
                      size="sm" 
                      className="h-7 px-2 text-xs"
                      onClick={() => handleVote(routes[selectedRouteIndex].id, 'dislike')}
                    >
                      <ThumbsDown className="h-3 w-3 mr-1" />
                      {getVoteCount(routes[selectedRouteIndex], 'dislike')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* 지도 영역 */}
            <div className="lg:col-span-3 relative">
              {routes.length > 0 && (
                <KakaoMap
                  height="100%"
                  markers={routes[selectedRouteIndex].route_data.places.map((place, index) => ({
                    lat: place.location.lat,
                    lng: place.location.lng,
                    title: `${index + 1}. ${place.name}`,
                    markerType: selectedRouteIndex === 0 ? 'primary' : 'secondary'
                  }))}
                  polyline={routes[selectedRouteIndex].route_data.places.map(place => ({
                    lat: place.location.lat,
                    lng: place.location.lng
                  }))}
                  polylineColor={selectedRouteIndex === 0 ? '#3B82F6' : '#06B6D4'}
                  useStaticMap={false}
                  level={9}
                  mapTypeId="ROADMAP"
                />
              )}
              
              {/* 하단 버튼 영역 */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex justify-between">
                <div className="grid grid-cols-3 gap-2 flex-1 mr-4">
                  {routes.map((route, index) => (
                    <Button
                      key={route.id}
                      variant={selectedRouteIndex === index ? "default" : "outline"}
                      onClick={() => setSelectedRouteIndex(index)}
                      className="text-sm"
                    >
                      추천 {index + 1}안
                    </Button>
                  ))}
                </div>
                
                {isOwner && (
                  <Button
                    onClick={() => handleSelectRoute(routes[selectedRouteIndex].id)}
                    disabled={processingSelection}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {processingSelection ? (
                      <div className="flex items-center">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        처리 중...
                      </div>
                    ) : '다음'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-500 text-center">
          {error}
        </div>
      )}
    </main>
  )
} 