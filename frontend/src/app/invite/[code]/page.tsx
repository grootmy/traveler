'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { validateInviteCode, getCurrentUser, joinRoom } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

// 초대 코드 하이픈 형식으로 표시 (ABC123 -> ABC-123)
function formatInviteCode(code: string) {
  if (!code) return '';
  
  // 코드가 6자리 이상인 경우 3-3 형식으로 분할
  if (code.length >= 6) {
    return `${code.slice(0, 3)}-${code.slice(3, 6)}`;
  }
  
  return code;
}

type RoomInfo = {
  textid: string
  title: string
  owner_id: string
  purpose_category: string
  expected_members: number
  district: string
  status: string
  code: string
}

export default function InviteJoinPage() {
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null)
  const [user, setUser] = useState<any>(null)
  const [nickname, setNickname] = useState('')
  
  const router = useRouter()
  const params = useParams<{ code: string }>()
  const inviteCode = params?.code as string

  useEffect(() => {
    async function checkInviteCode() {
      if (!inviteCode) return
      
      try {
        setLoading(true)
        
        // 초대 코드 유효성 검사 및 방 정보 가져오기
        const { isValid, roomInfo, error } = await validateInviteCode(inviteCode)
        
        if (error || !isValid) {
          setError(error || '유효하지 않은 초대 코드입니다')
          return
        }
        
        setRoomInfo(roomInfo as RoomInfo)
        
        // 현재 로그인된 사용자 확인
        const { user: currentUser } = await getCurrentUser()
        if (currentUser) {
          setUser(currentUser)
        }
      } catch (err: any) {
        console.error('초대 코드 검증 오류:', err)
        setError('초대 코드를 확인하는 중 오류가 발생했습니다')
      } finally {
        setLoading(false)
      }
    }
    
    checkInviteCode()
  }, [inviteCode])

  const handleLogin = async () => {
    // 로그인 페이지로 리디렉션, 로그인 후 이 페이지로 돌아오도록 설정
    router.push(`/login?redirect=/invite/${inviteCode}`)
  }

  const handleJoinAnonymously = async () => {
    if (!nickname.trim()) {
      toast.error('닉네임을 입력해주세요')
      return
    }
    
    if (!roomInfo) {
      setError('방 정보를 찾을 수 없습니다')
      return
    }
    
    try {
      setJoining(true)
      
      // 익명으로 방 참여
      const { success, roomId, error } = await joinRoom({
        roomId: roomInfo.textid,
        userId: null, // 익명 사용자
        nickname: nickname
      })
      
      if (error) throw error
      
      if (success && roomId) {
        toast.success('방에 참여했습니다!')
        // 참여 이후 바로 방 페이지로 이동 (preferences 페이지 아닌 routes 페이지로 직접 이동)
        router.push(`/rooms/${roomId}/routes`)
      }
    } catch (err: any) {
      console.error('방 참여 오류:', err)
      setError(err.message || '방 참여 중 오류가 발생했습니다')
    } finally {
      setJoining(false)
    }
  }

  const handleJoinAsUser = async () => {
    if (!user || !roomInfo) {
      return
    }
    
    try {
      setJoining(true)
      
      // 최신 사용자 정보 다시 확인
      const { user: currentUser, error: userError } = await getCurrentUser()
      
      if (userError || !currentUser) {
        throw new Error('사용자 정보를 가져올 수 없습니다. 다시 로그인해 주세요.')
      }
      
      // 사용자 정보가 존재하는지 확인
      const { data: userExists, error: checkUserError } = await supabase
        .from('users')
        .select('textid')
        .eq('textid', currentUser.id)
        .maybeSingle()
        
      if (checkUserError) throw checkUserError
      
      if (!userExists) {
        // 사용자 정보가 없으면 users 테이블에 추가
        const { error: insertUserError } = await supabase
          .from('users')
          .insert({
            textid: currentUser.id,
            email: currentUser.email,
            nickname: currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || '사용자',
            created_at: new Date().toISOString()
          })
          
        if (insertUserError) throw insertUserError
      }
      
      // 로그인된 사용자로 방 참여
      const { success, roomId, error } = await joinRoom({
        roomId: roomInfo.textid,
        userId: currentUser.id
      })
      
      if (error) throw error
      
      if (success && roomId) {
        toast.success('방에 참여했습니다!')
        // 참여 이후 바로 방 페이지로 이동
        router.push(`/rooms/${roomId}/routes`)
      }
    } catch (err: any) {
      console.error('방 참여 오류:', err)
      setError(err.message || '방 참여 중 오류가 발생했습니다')
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>초대 코드 확인 중...</p>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">오류 발생</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p>{error}</p>
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

  if (!roomInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>방 정보를 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">여행 초대장</CardTitle>
          <CardDescription className="text-center">
            <span className="block text-xl font-semibold mt-2">{roomInfo.title}</span>
            <span className="block mt-2">초대 코드: <span className="font-mono font-bold">{formatInviteCode(inviteCode)}</span></span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <p>목적: {roomInfo.purpose_category}</p>
            <p>지역: {roomInfo.district}</p>
            <p>예상 인원: {roomInfo.expected_members}명</p>
          </div>
          
          {user ? (
            <div className="pt-4">
              <p className="text-center mb-4">
                <span className="font-semibold">{user.email}</span>님,<br />
                여행에 참여하시겠습니까?
              </p>
              <Button 
                className="w-full" 
                onClick={handleJoinAsUser}
                disabled={joining}
              >
                {joining ? '참여 중...' : '참여하기'}
              </Button>
            </div>
          ) : (
            <div className="pt-4 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">닉네임 (익명으로 참여)</p>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임을 입력하세요"
                  className="w-full p-2 border rounded-md"
                />
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <Button 
                  variant="default" 
                  onClick={handleJoinAnonymously}
                  disabled={joining || !nickname.trim()}
                >
                  {joining ? '참여 중...' : '익명으로 참여하기'}
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">또는</span>
                  </div>
                </div>
                <Button variant="outline" onClick={handleLogin}>
                  로그인 후 참여하기
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 