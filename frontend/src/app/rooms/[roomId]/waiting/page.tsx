'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getSocket, joinRoom } from '@/lib/socket'

type Member = {
  id: string;
  user_id: string;
  nickname?: string;
  status: 'pending' | 'ready';
  email?: string;
}

type Room = {
  id: string;
  title: string;
  owner_id: string;
  expected_members: number;
}

export default function WaitingPage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
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
        
        // 멤버 정보 가져오기
        await fetchMembers()
        
        // 소켓 연결
        const socket = getSocket()
        joinRoom(roomId)
        
        // 사용자 준비 상태 업데이트 이벤트 리스너
        socket.on('user-ready', ({ userId, nickname }) => {
          setMembers(prev => prev.map(member => 
            member.user_id === userId 
              ? { ...member, status: 'ready' } 
              : member
          ))
        })
        
        setLoading(false)
        
        return () => {
          socket.off('user-ready')
        }
      } catch (err: any) {
        setError(err.message || '정보를 가져오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
  }, [roomId, router])

  const fetchMembers = async () => {
    try {
      // 멤버 정보 가져오기
      const { data: membersData, error: membersError } = await supabase
        .from('room_members')
        .select('id, user_id, nickname, status')
        .eq('room_id', roomId)
      
      if (membersError) throw membersError
      
      // 사용자 이메일 정보 가져오기
      const userIds = membersData.map(m => m.user_id)
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email')
        .in('id', userIds)
      
      if (usersError) throw usersError
      
      // 멤버 정보와 사용자 정보 합치기
      const membersWithEmail = membersData.map(member => {
        const user = usersData?.find(u => u.id === member.user_id)
        return {
          ...member,
          email: user?.email
        }
      })
      
      setMembers(membersWithEmail)
    } catch (err: any) {
      console.error('멤버 정보 가져오기 오류:', err)
    }
  }

  const handleStartGeneration = async () => {
    // 모든 멤버가 준비되었는지 확인
    const allReady = members.every(member => member.status === 'ready')
    
    if (!allReady && !showWarning) {
      setShowWarning(true)
      return
    }
    
    setGenerating(true)
    setShowWarning(false)
    
    try {
      // 백엔드 API 호출하여 경로 생성 시작
      const response = await fetch(`/api/rooms/${roomId}/generate-routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '경로 생성 중 오류가 발생했습니다')
      }
      
      // 경로 추천 화면으로 이동
      router.push(`/rooms/${roomId}/routes`)
    } catch (err: any) {
      setError(err.message || '경로 생성 중 오류가 발생했습니다')
      setGenerating(false)
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
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-blue-600 mb-2 text-center">{room?.title}</h1>
        <p className="text-center text-gray-600 mb-6">참여자 대기 중</p>
        
        <Card>
          <CardHeader>
            <CardTitle>참여자 목록</CardTitle>
            <CardDescription>
              모든 참여자가 준비되면 경로 생성을 시작할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 font-medium text-sm py-2 border-b">
                <div>이름</div>
                <div>상태</div>
                <div>역할</div>
              </div>
              
              {members.map(member => (
                <div key={member.id} className="grid grid-cols-3 text-sm py-2 border-b border-gray-100">
                  <div className="truncate">
                    {member.nickname || member.email || '익명 사용자'}
                    {member.user_id === currentUser?.id && ' (나)'}
                  </div>
                  <div>
                    {member.status === 'ready' ? (
                      <span className="text-green-500 font-medium">준비 완료</span>
                    ) : (
                      <span className="text-amber-500">대기 중</span>
                    )}
                  </div>
                  <div>
                    {member.user_id === room?.owner_id ? '방장' : '참여자'}
                  </div>
                </div>
              ))}
              
              <div className="text-sm text-gray-500 mt-4">
                <p>현재 {members.length}명 참여 중 (예상 인원: {room?.expected_members}명)</p>
                <p>준비 완료: {members.filter(m => m.status === 'ready').length}명</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            {isOwner ? (
              <Button
                onClick={handleStartGeneration}
                disabled={generating}
                className="w-full"
              >
                {generating ? '경로 생성 중...' : '경로 생성 시작'}
              </Button>
            ) : (
              <p className="text-center text-gray-500">
                방장이 경로 생성을 시작하기를 기다리는 중입니다
              </p>
            )}
          </CardFooter>
        </Card>
        
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-500 rounded-md text-center">
            {error}
          </div>
        )}
        
        {showWarning && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>주의</CardTitle>
                <CardDescription>
                  아직 모든 참여자가 준비되지 않았습니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p>일부 참여자가 아직 성향 테스트를 완료하지 않았습니다. 계속 진행하시겠습니까?</p>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowWarning(false)}
                >
                  취소
                </Button>
                <Button
                  onClick={handleStartGeneration}
                >
                  계속 진행
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </main>
  )
} 