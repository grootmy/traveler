'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
}

type Room = {
  id: string;
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
          .eq('id', roomId)
          .single()
        
        if (roomError) throw roomError
        
        setRoom(roomData)
        
        // 선택된 경로 가져오기
        const { data: routeData, error: routeError } = await supabase
          .from('routes')
          .select('*')
          .eq('room_id', roomId)
          .eq('is_selected', true)
          .single()
        
        if (routeError) throw routeError
        
        setSelectedRoute(routeData)
        setLoading(false)
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
          <CardHeader>
            <CardTitle className="text-center text-red-500">오류</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">{error || '선택된 경로를 찾을 수 없습니다'}</p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild>
              <Link href="/">홈으로 돌아가기</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-blue-600 mb-2 text-center">{room.title}</h1>
        <p className="text-center text-gray-600 mb-6">최종 선택된 경로</p>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>경로 정보</CardTitle>
            <CardDescription>
              선택된 당일치기 여행 경로입니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="h-[300px] rounded-md overflow-hidden">
              <KakaoMap
                height="300px"
                markers={selectedRoute.route_data.places.map(place => ({
                  lat: place.location.lat,
                  lng: place.location.lng,
                  title: place.name
                }))}
                polyline={selectedRoute.route_data.places.map(place => ({
                  lat: place.location.lat,
                  lng: place.location.lng
                }))}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-md">
              <div>
                <p className="text-sm text-gray-500">지역</p>
                <p className="font-medium">{room.region}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">예상 소요 시간</p>
                <p className="font-medium">{Math.floor(selectedRoute.route_data.travel_time / 60)}시간 {selectedRoute.route_data.travel_time % 60}분</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">예상 비용</p>
                <p className="font-medium">{selectedRoute.route_data.total_cost.toLocaleString()}원</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-medium">방문 장소</h3>
              {selectedRoute.route_data.places.map((place, index) => (
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
          </CardContent>
          <CardFooter className="flex flex-col md:flex-row gap-2">
            <Button
              onClick={copyToClipboard}
              variant={copied ? "secondary" : "outline"}
              className="w-full md:w-auto"
            >
              {copied ? '복사됨' : '내용 복사하기'}
            </Button>
            <Button
              onClick={shareKakao}
              className="w-full md:w-auto bg-yellow-400 hover:bg-yellow-500 text-black"
            >
              카카오톡 공유
            </Button>
            <Button
              asChild
              className="w-full md:w-auto"
            >
              <Link href="/mypage">
                마이페이지로 이동
              </Link>
            </Button>
          </CardFooter>
        </Card>
        
        {isAnonymous && (
          <Card className="mt-6 p-4 bg-muted">
            <p className="text-center mb-2">이 결과를 저장하고 다음에도 볼 수 있게 하려면 회원가입하세요</p>
            <Button asChild className="w-full">
              <Link href={`/signup?redirect=/rooms/${roomId}/result&anonymous_id=${currentUser?.id}`}>
                회원가입하기
              </Link>
            </Button>
          </Card>
        )}
        
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-500 rounded-md text-center">
            {error}
          </div>
        )}
      </div>
    </main>
  )
} 