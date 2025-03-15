'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, signInAnonymously } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type RoomInfo = {
  id: string;
  title: string;
  owner_id: string;
  expected_members: number;
  region: string;
}

export default function InviteJoinPage({ params }: { params: { code: string } }) {
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null)
  const [nickname, setNickname] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const router = useRouter()
  const { code } = params

  useEffect(() => {
    const init = async () => {
      try {
        // 초대 코드로 방 정보 가져오기
        const { data: inviteData, error: inviteError } = await supabase
          .from('room_invites')
          .select('room_id')
          .eq('invite_code', code)
          .single()
        
        if (inviteError) throw new Error('유효하지 않은 초대 코드입니다')
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', inviteData.room_id)
          .single()
        
        if (roomError) throw roomError
        
        setRoomInfo(roomData)
        
        // 현재 사용자 확인
        const { user } = await getCurrentUser()
        setCurrentUser(user)
        
        setLoading(false)
      } catch (err: any) {
        setError(err.message || '초대 정보를 가져오는 중 오류가 발생했습니다')
        setLoading(false)
      }
    }
    
    init()
  }, [code])

  const handleLoginJoin = async () => {
    if (!roomInfo || !currentUser) return
    
    setJoining(true)
    setError(null)
    
    try {
      // 이미 참여 중인지 확인
      const { data: existingMember, error: checkError } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomInfo.id)
        .eq('user_id', currentUser.id)
        .maybeSingle()
      
      if (checkError) throw checkError
      
      // 이미 참여 중이면 바로 이동
      if (existingMember) {
        router.push(`/rooms/${roomInfo.id}/preferences`)
        return
      }
      
      // 방 멤버로 추가
      const { error: joinError } = await supabase
        .from('room_members')
        .insert({
          room_id: roomInfo.id,
          user_id: currentUser.id,
          status: 'pending'
        })
      
      if (joinError) throw joinError
      
      router.push(`/rooms/${roomInfo.id}/preferences`)
    } catch (err: any) {
      setError(err.message || '참여 중 오류가 발생했습니다')
      setJoining(false)
    }
  }

  const handleAnonymousJoin = async () => {
    if (!roomInfo || !nickname.trim()) return
    
    setJoining(true)
    setError(null)
    
    try {
      // 익명 인증
      const { data, error } = await signInAnonymously()
      
      if (error) throw error
      
      // 방 멤버로 추가
      await supabase.from('room_members').insert({
        room_id: roomInfo.id,
        user_id: data.user.id,
        nickname: nickname,
        status: 'pending'
      })
      
      // 닉네임 로컬 스토리지에 저장
      localStorage.setItem(`nickname_${roomInfo.id}`, nickname)
      
      router.push(`/rooms/${roomInfo.id}/preferences`)
    } catch (err: any) {
      setError(err.message || '익명 참여 중 오류가 발생했습니다')
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  if (!roomInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-500">오류</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">{error || '유효하지 않은 초대 코드입니다'}</p>
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
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-blue-600 mb-6 text-center">초대 참여</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>{roomInfo.title}</CardTitle>
            <CardDescription>
              당일치기 여행에 참여해보세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-md">
              <p className="text-sm mb-2">방 정보:</p>
              <p className="text-sm">예상 인원: {roomInfo.expected_members}명</p>
              <p className="text-sm">지역: {roomInfo.region}</p>
            </div>
            
            {currentUser ? (
              <div className="space-y-4">
                <p className="text-center">
                  <span className="font-medium">{currentUser.email}</span> 계정으로 참여합니다
                </p>
                <Button
                  onClick={handleLoginJoin}
                  className="w-full"
                  disabled={joining}
                >
                  {joining ? '참여 중...' : '로그인 계정으로 참여하기'}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="nickname" className="text-sm font-medium">
                    닉네임
                  </label>
                  <Input
                    id="nickname"
                    placeholder="사용할 닉네임을 입력하세요"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    required
                  />
                </div>
                <Button
                  onClick={handleAnonymousJoin}
                  className="w-full"
                  disabled={joining || !nickname.trim()}
                >
                  {joining ? '참여 중...' : '익명으로 참여하기'}
                </Button>
                <div className="text-center">
                  <p className="text-sm text-gray-500 mb-2">또는</p>
                  <Link
                    href="/"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    로그인 후 참여하기
                  </Link>
                </div>
              </div>
            )}
            
            {error && (
              <div className="text-sm text-red-500 mt-2">{error}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
} 