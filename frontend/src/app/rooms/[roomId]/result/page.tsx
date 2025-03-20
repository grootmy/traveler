'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import KakaoMap from '@/components/KakaoMap'
import { ArrowLeft, Copy, Share2 } from 'lucide-react'

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
}

type Room = {
  textid: string;
  title: string;
  owner_id: string;
  region: string;
}

export default function ResultPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('members')
  const router = useRouter()
  const { roomId } = params

  useEffect(() => {
    const init = async () => {
      try {
        // 현재 사용자 확인
        const { user, error: authError } = await getCurrentUser()
        
        if (authError) {
          router.push('/')
          return
        }
        
        setCurrentUser(user)
        setIsAnonymous(user?.app_metadata?.provider === 'anonymous')
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('textid', roomId)
          .single()
        
        if (roomError) throw roomError
        
        setRoom(roomData)
        
        // 'routes' 테이블 대신 'places' 테이블에서 선택된 장소 정보를 가져옵니다
        const { data: placesData, error: placesError } = await supabase
          .from('places')
          .select('*')
          .eq('room_id', roomId)
          .eq('is_recommended', true)
          .order('order_index', { ascending: true });
        
        if (placesError) throw placesError;
        
        if (!placesData || placesData.length === 0) {
          throw new Error('선택된 장소 정보를 찾을 수 없습니다');
        }
        
        // places 데이터를 route 형식으로 변환
        const routeData = {
          textid: roomId, // 경로 ID는 방 ID를 사용
          route_data: {
            places: placesData.map(place => ({
              textid: place.textid,
              name: place.name,
              description: place.description || '',
              category: place.category || '기타',
              location: {
                lat: place.lat,
                lng: place.lng,
              },
              address: place.address || '',
              image_url: place.image_url,
            })),
            travel_time: 180, // 임시 값
            total_cost: 30000, // 임시 값
          }
        };
        
        setSelectedRoute(routeData);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
  }, [roomId, router])

  const copyToClipboard = async () => {
    if (!selectedRoute || !room) return
    
    try {
      const places = selectedRoute.route_data.places
        .map((place, index) => `${index + 1}. ${place.name} - ${place.address}`)
        .join('\n')
      
      const text = `
[${room.title} - 당일치기 여행 계획]

지역: ${room.region}
예상 소요 시간: ${Math.floor(selectedRoute.route_data.travel_time / 60)}시간 ${selectedRoute.route_data.travel_time % 60}분
예상 비용: ${selectedRoute.route_data.total_cost.toLocaleString()}원

방문 장소:
${places}
      `.trim()
      
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('클립보드 복사 실패:', err)
    }
  }

  const shareKakao = () => {
    if (!selectedRoute || !room) return
    
    if (typeof window !== 'undefined' && (window as any).Kakao && (window as any).Kakao.Share) {
      (window as any).Kakao.Share.sendDefault({
        objectType: 'text',
        text: `${room.title} - 당일치기 여행 계획을 공유합니다!`,
        link: {
          mobileWebUrl: window.location.href,
          webUrl: window.location.href,
        },
      })
    } else {
      alert('카카오톡 공유 기능을 사용할 수 없습니다.')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  if (!selectedRoute || !room) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <h3 className="text-xl font-bold text-red-500 mb-2">오류</h3>
            <p className="text-center">{error || '선택된 경로를 찾을 수 없습니다'}</p>
            <div className="mt-4 flex justify-center">
              <Button asChild>
                <Link href="/">홈으로 돌아가기</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
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
          <h1 className="text-xl font-bold">{room.title || '방제목'}</h1>
        </div>
      </div>
      
      {/* 탭 메뉴 */}
      <Tabs defaultValue="routes" value={activeTab} onValueChange={setActiveTab} className="w-full">
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
        
        <TabsContent value="routes" className="p-0 m-0">
          <div className="grid grid-cols-1 lg:grid-cols-4 h-[calc(100vh-112px)]">
            {/* 왼쪽 패널 */}
            <div className="border-r border-gray-200 overflow-y-auto">
              {selectedRoute.route_data.places.map((place, index) => (
                <div key={place.textid} className="p-4 border-b border-gray-100">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-medium">{index + 1}. {place.name}</h3>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{place.category}</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{place.description}</p>
                  <p className="text-xs text-gray-500 mt-1">{place.address}</p>
                </div>
              ))}
              
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-md mb-4">
                  <div>
                    <p className="text-xs text-gray-500">예상 소요 시간</p>
                    <p className="font-medium">{Math.floor(selectedRoute.route_data.travel_time / 60)}시간 {selectedRoute.route_data.travel_time % 60}분</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">예상 비용</p>
                    <p className="font-medium">{selectedRoute.route_data.total_cost.toLocaleString()}원</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={copyToClipboard}
                    variant={copied ? "secondary" : "outline"}
                    className="w-full"
                    size="sm"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {copied ? '복사됨' : '내용 복사하기'}
                  </Button>
                  <Button
                    onClick={shareKakao}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-black"
                    size="sm"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    카카오톡 공유
                  </Button>
                  <Button
                    asChild
                    className="w-full"
                    size="sm"
                  >
                    <Link href="/mypage">
                      마이페이지로 이동
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
            
            {/* 지도 영역 */}
            <div className="lg:col-span-3 relative">
              <KakaoMap
                height="100%"
                markers={selectedRoute.route_data.places.map((place, index) => ({
                  lat: place.location.lat,
                  lng: place.location.lng,
                  title: `${index + 1}. ${place.name}`,
                  markerType: 'primary'
                }))}
                polyline={selectedRoute.route_data.places.map(place => ({
                  lat: place.location.lat,
                  lng: place.location.lng
                }))}
                polylineColor="#3B82F6"
                useStaticMap={false}
                level={9}
                mapTypeId="ROADMAP"
              />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="members" className="p-0 m-0">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <p className="text-lg font-medium">참여 인원 정보</p>
              <p className="text-sm text-gray-500 mt-2">
                이 탭에서는 참여자 목록을 확인할 수 있습니다
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {isAnonymous && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
          <p className="text-center mb-2 text-sm">이 결과를 저장하고 다음에도 볼 수 있게 하려면 회원가입하세요</p>
          <Button asChild className="w-full">
            <Link href={`/signup?redirect=/rooms/${roomId}/result&anonymous_id=${currentUser?.id}`}>
              회원가입하기
            </Link>
          </Button>
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-red-50 text-red-500 text-center">
          {error}
        </div>
      )}
    </main>
  )
} 