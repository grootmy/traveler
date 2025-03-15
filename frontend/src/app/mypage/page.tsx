'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/supabase/client'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'

type Room = {
  id: string;
  title: string;
  created_at: string;
  status: 'active' | 'completed';
  expected_members: number;
  region: string;
}

export default function MyPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [createdRooms, setCreatedRooms] = useState<Room[]>([])
  const [participatingRooms, setParticipatingRooms] = useState<Room[]>([])
  const [completedRooms, setCompletedRooms] = useState<Room[]>([])
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const { user, error } = await getCurrentUser()
      
      if (error || !user) {
        router.push('/')
        return
      }
      
      setUser(user)
      await fetchRooms(user.id)
      setLoading(false)
    }
    
    checkAuth()
  }, [router])

  const fetchRooms = async (userId: string) => {
    // 내가 생성한 활성 방
    const { data: createdActiveRooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    
    // 내가 참여 중인 방 (내가 생성한 방 제외)
    const { data: participatingRoomsData } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId)
    
    const participatingRoomIds = participatingRoomsData?.map(r => r.room_id) || []
    
    if (participatingRoomIds.length > 0) {
      const { data: participatingRoomsInfo } = await supabase
        .from('rooms')
        .select('*')
        .in('id', participatingRoomIds)
        .eq('status', 'active')
        .neq('owner_id', userId)
        .order('created_at', { ascending: false })
      
      setParticipatingRooms(participatingRoomsInfo || [])
    }
    
    // 완료된 방
    const { data: completedRoomsData } = await supabase
      .from('rooms')
      .select('*')
      .eq('status', 'completed')
      .or(`owner_id.eq.${userId},id.in.(${participatingRoomIds.join(',')})`)
      .order('created_at', { ascending: false })
    
    setCreatedRooms(createdActiveRooms || [])
    setCompletedRooms(completedRoomsData || [])
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/')
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
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-600">마이페이지</h1>
            <p className="text-gray-600">{user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleLogout}>
              로그아웃
            </Button>
            <Button asChild>
              <Link href="/rooms/create">방 생성하기</Link>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="created" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="created">내가 생성한 방</TabsTrigger>
            <TabsTrigger value="participating">참여 중인 방</TabsTrigger>
            <TabsTrigger value="completed">완료된 방</TabsTrigger>
          </TabsList>
          
          <TabsContent value="created" className="mt-4">
            {createdRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {createdRooms.map(room => (
                  <Card key={room.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl">{room.title}</CardTitle>
                      <CardDescription>
                        {formatDate(new Date(room.created_at))}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <p className="text-sm">예상 인원: {room.expected_members}명</p>
                      <p className="text-sm">지역: {room.region}</p>
                    </CardContent>
                    <CardFooter>
                      <Button asChild className="w-full">
                        <Link href={`/rooms/${room.id}/waiting`}>
                          입장하기
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">생성한 방이 없습니다</p>
                <Button asChild>
                  <Link href="/rooms/create">방 생성하기</Link>
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="participating" className="mt-4">
            {participatingRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {participatingRooms.map(room => (
                  <Card key={room.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl">{room.title}</CardTitle>
                      <CardDescription>
                        {formatDate(new Date(room.created_at))}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <p className="text-sm">예상 인원: {room.expected_members}명</p>
                      <p className="text-sm">지역: {room.region}</p>
                    </CardContent>
                    <CardFooter>
                      <Button asChild className="w-full">
                        <Link href={`/rooms/${room.id}/waiting`}>
                          입장하기
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">참여 중인 방이 없습니다</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="completed" className="mt-4">
            {completedRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedRooms.map(room => (
                  <Card key={room.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl">{room.title}</CardTitle>
                      <CardDescription>
                        {formatDate(new Date(room.created_at))}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <p className="text-sm">예상 인원: {room.expected_members}명</p>
                      <p className="text-sm">지역: {room.region}</p>
                    </CardContent>
                    <CardFooter>
                      <Button asChild className="w-full">
                        <Link href={`/rooms/${room.id}/result`}>
                          결과 보기
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">완료된 방이 없습니다</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
} 