'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getSocket, joinRoom, updateVote, selectRoute } from '@/lib/socket'
import KakaoMap from '@/components/KakaoMap'

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
  const [chatMessage, setChatMessage] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    sender: string;
    message: string;
    timestamp: string;
  }>>([])
  const [sendingMessage, setSendingMessage] = useState(false)
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
        
        // 소켓 연결
        const socket = getSocket()
        joinRoom(roomId)
        
        // 투표 업데이트 이벤트 리스너
        socket.on('vote-updated', ({ routeId, userId, voteType }) => {
          setRoutes(prev => prev.map(route => {
            if (route.id === routeId) {
              const newVotes = { ...route.votes, [userId]: voteType }
              return { ...route, votes: newVotes }
            }
            return route
          }))
        })
        
        // 최종 경로 선택 이벤트 리스너
        socket.on('final-route', ({ routeId }) => {
          setSelectedRouteId(routeId)
          router.push(`/rooms/${roomId}/result`)
        })
        
        setLoading(false)
        
        return () => {
          socket.off('vote-updated')
          socket.off('final-route')
        }
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
  }, [roomId, router])

  const fetchRoutes = async () => {
    try {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
      
      if (error) throw error
      
      setRoutes(data || [])
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
    
    // 같은 투표 타입이면 취소, 다른 타입이면 변경
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
    
    // 소켓으로 투표 업데이트 전송
    if (newVoteType) {
      updateVote(roomId, routeId, currentUser.id, newVoteType)
    }
    
    // 서버에 투표 정보 저장
    supabase
      .from('routes')
      .update({
        votes: routes.find(r => r.id === routeId)?.votes || {}
      })
      .eq('id', routeId)
      .then(({ error }) => {
        if (error) console.error('투표 저장 오류:', error)
      })
  }

  const handleSelectRoute = async (routeId: string) => {
    try {
      // 선택된 경로 업데이트
      const { error } = await supabase
        .from('routes')
        .update({ is_selected: true })
        .eq('id', routeId)
      
      if (error) throw error
      
      // 방 상태 업데이트
      await supabase
        .from('rooms')
        .update({ status: 'completed' })
        .eq('id', roomId)
      
      // 소켓으로 선택 알림
      selectRoute(roomId, routeId)
      
      // 결과 페이지로 이동
      router.push(`/rooms/${roomId}/result`)
    } catch (err: any) {
      setError(err.message || '경로 선택 중 오류가 발생했습니다')
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!chatMessage.trim() || !currentUser) return
    
    setSendingMessage(true)
    
    try {
      // 챗봇 API 호출
      const response = await fetch(`/api/rooms/${roomId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: chatMessage })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '메시지 전송 중 오류가 발생했습니다')
      }
      
      const data = await response.json()
      
      // 사용자 메시지 추가
      const userMessage = {
        id: Date.now().toString(),
        sender: currentUser.email || '사용자',
        message: chatMessage,
        timestamp: new Date().toISOString()
      }
      
      // 챗봇 응답 추가
      const botMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'AI 어시스턴트',
        message: data.reply,
        timestamp: new Date().toISOString()
      }
      
      setChatMessages(prev => [...prev, userMessage, botMessage])
      setChatMessage('')
    } catch (err: any) {
      setError(err.message || '메시지 전송 중 오류가 발생했습니다')
    } finally {
      setSendingMessage(false)
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
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-blue-600 mb-2 text-center">{room?.title}</h1>
        <p className="text-center text-gray-600 mb-6">추천 경로</p>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>추천 경로</CardTitle>
                <CardDescription>
                  AI가 추천한 경로 중 마음에 드는 것을 선택해주세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                {routes.length > 0 ? (
                  <Tabs defaultValue={routes[0].id} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      {routes.map((route, index) => (
                        <TabsTrigger key={route.id} value={route.id}>
                          추천 {index + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    
                    {routes.map(route => (
                      <TabsContent key={route.id} value={route.id} className="mt-4">
                        <div className="space-y-6">
                          <div className="h-[300px] rounded-md overflow-hidden">
                            <KakaoMap
                              height="300px"
                              markers={route.route_data.places.map(place => ({
                                lat: place.location.lat,
                                lng: place.location.lng,
                                title: place.name
                              }))}
                              polyline={route.route_data.places.map(place => ({
                                lat: place.location.lat,
                                lng: place.location.lng
                              }))}
                            />
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm font-medium">예상 소요 시간: {Math.floor(route.route_data.travel_time / 60)}시간 {route.route_data.travel_time % 60}분</p>
                              <p className="text-sm font-medium">예상 비용: {route.route_data.total_cost.toLocaleString()}원</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant={getUserVote(route) === 'like' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleVote(route.id, 'like')}
                              >
                                👍 {getVoteCount(route, 'like')}
                              </Button>
                              <Button
                                variant={getUserVote(route) === 'dislike' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleVote(route.id, 'dislike')}
                              >
                                👎 {getVoteCount(route, 'dislike')}
                              </Button>
                              {isOwner && (
                                <Button
                                  size="sm"
                                  onClick={() => handleSelectRoute(route.id)}
                                >
                                  선택하기
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <h3 className="text-lg font-medium">방문 장소</h3>
                            {route.route_data.places.map((place, index) => (
                              <Card key={place.id}>
                                <CardHeader className="pb-2">
                                  <div className="flex justify-between items-center">
                                    <CardTitle className="text-base">{index + 1}. {place.name}</CardTitle>
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{place.category}</span>
                                  </div>
                                </CardHeader>
                                <CardContent className="pb-2">
                                  <p className="text-sm text-gray-600">{place.description}</p>
                                  <p className="text-xs text-gray-500 mt-1">{place.address}</p>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">추천 경로가 없습니다</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <div>
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle>AI 어시스턴트</CardTitle>
                <CardDescription>
                  추가 추천이나 질문이 있으면 물어보세요
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto">
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  {chatMessages.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">
                      AI 어시스턴트에게 질문해보세요
                    </p>
                  ) : (
                    chatMessages.map(msg => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg ${
                          msg.sender === 'AI 어시스턴트'
                            ? 'bg-blue-50 ml-4'
                            : 'bg-gray-100 mr-4'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs font-medium">{msg.sender}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
              <CardFooter className="border-t p-4">
                <form onSubmit={handleSendMessage} className="w-full flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="메시지를 입력하세요..."
                    className="flex-grow p-2 border rounded-md"
                    disabled={sendingMessage}
                  />
                  <Button type="submit" disabled={sendingMessage || !chatMessage.trim()}>
                    {sendingMessage ? '전송 중...' : '전송'}
                  </Button>
                </form>
              </CardFooter>
            </Card>
          </div>
        </div>
        
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-500 rounded-md text-center">
            {error}
          </div>
        )}
      </div>
    </main>
  )
} 