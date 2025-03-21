'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatInviteCode } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

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

export default function InvitePage() {
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null)
  const [user, setUser] = useState<any>(null)
  const [nickname, setNickname] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [validatingCode, setValidatingCode] = useState(false)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = searchParams.get('roomId')
  const code = searchParams.get('code')

  useEffect(() => {
    async function checkInvite() {
      try {
        setLoading(true)
        
        // 현재 로그인된 사용자 상태 확인 (쿠키 기반)
        const userResponse = await fetch('/api/auth/me');
        const userData = await userResponse.json();
        
        if (userData.user) {
          setUser(userData.user);
        }
        
        // 초대 코드가 URL에 있는 경우
        if (code) {
          setInviteCode(code);
          const isValid = await validateServerInviteCode(code);
          if (!isValid) {
            return;
          }
        } 
        // 방 ID가 URL에 있는 경우 (직접 방으로 접근)
        else if (roomId) {
          const response = await fetch(`/api/rooms/${roomId}`);
          
          if (!response.ok) {
            setError('방 정보를 찾을 수 없습니다');
            return;
          }
          
          const roomData = await response.json();
          setRoomInfo(roomData);
          setInviteCode(roomData.code);
        }
      } catch (err: any) {
        console.error('초대 코드 검증 오류:', err);
        setError('초대 코드를 확인하는 중 오류가 발생했습니다');
      } finally {
        setLoading(false);
      }
    }
    
    checkInvite();
  }, [code, roomId]);

  async function validateServerInviteCode(codeToValidate: string) {
    try {
      // 서버 API를 통한 초대 코드 검증
      const response = await fetch(`/api/invite/validate?code=${encodeURIComponent(codeToValidate)}`);
      const data = await response.json();
      
      if (!response.ok || !data.isValid) {
        setError(data.error || '유효하지 않은 초대 코드입니다');
        return false;
      }
      
      setRoomInfo(data.roomInfo as RoomInfo);
      return true;
    } catch (err: any) {
      console.error('초대 코드 검증 오류:', err);
      setError('초대 코드를 확인하는 중 오류가 발생했습니다');
      return false;
    }
  }

  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidatingCode(true);
    
    try {
      const isValid = await validateServerInviteCode(inviteCode);
      if (!isValid) {
        toast.error('유효하지 않은 초대 코드입니다');
      }
    } catch (err: any) {
      toast.error(err.message || '초대 코드 확인 중 오류가 발생했습니다');
    } finally {
      setValidatingCode(false);
    }
  }

  const handleLogin = async () => {
    // 로그인 페이지로 리디렉션, 로그인 후 이 페이지로 돌아오도록 설정
    const redirectParam = roomInfo 
      ? `/invite?roomId=${roomInfo.textid}` 
      : (code ? `/invite?code=${code}` : '/invite');
    
    router.push(`/login?redirect=${encodeURIComponent(redirectParam)}`);
  }

  const handleJoinAnonymously = async () => {
    if (!nickname.trim()) {
      toast.error('닉네임을 입력해주세요');
      return;
    }
    
    if (!roomInfo) {
      setError('방 정보를 찾을 수 없습니다');
      return;
    }
    
    try {
      setJoining(true);
      
      // 서버 API를 통한 익명 방 참여
      const response = await fetch('/api/invite/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId: roomInfo.textid,
          nickname: nickname
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '방 참여 중 오류가 발생했습니다');
      }
      
      if (data.success) {
        toast.success('방에 참여했습니다!');
        // 참여 이후 바로 방 페이지로 이동
        router.push(`/rooms/${data.roomId}/routes`);
      }
    } catch (err: any) {
      console.error('방 참여 오류:', err);
      setError(err.message || '방 참여 중 오류가 발생했습니다');
    } finally {
      setJoining(false);
    }
  }

  const handleJoinAsUser = async () => {
    if (!user || !roomInfo) {
      return;
    }
    
    try {
      setJoining(true);
      
      // 서버 API를 통한 로그인 사용자 방 참여
      const response = await fetch('/api/invite/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId: roomInfo.textid,
          nickname: user.user_metadata?.name || user.email?.split('@')[0] || '사용자'
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '방 참여 중 오류가 발생했습니다');
      }
      
      if (data.success) {
        toast.success('방에 참여했습니다!');
        // 참여 이후 바로 방 페이지로 이동
        router.push(`/rooms/${data.roomId}/routes`);
      }
    } catch (err: any) {
      console.error('방 참여 오류:', err);
      setError(err.message || '방 참여 중 오류가 발생했습니다');
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>초대 정보 확인 중...</p>
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

  // 방 정보가 없고 코드도 없는 경우 코드 입력 화면
  if (!roomInfo && !roomId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-2xl">여행에 참여하기</CardTitle>
            <CardDescription className="text-center">
              초대 코드를 입력하여 여행에 참여하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleValidateCode} className="space-y-4">
              <div>
                <Input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="초대 코드 입력 (예: ABC-123)"
                  className="text-center text-lg tracking-wider"
                  maxLength={8}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={validatingCode || !inviteCode.trim()}
              >
                {validatingCode ? '확인 중...' : '참여하기'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild variant="ghost">
              <Link href="/">홈으로</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">여행 초대장</CardTitle>
          <CardDescription className="text-center">
            <span className="block text-xl font-semibold mt-2">{roomInfo?.title}</span>
            {roomInfo?.code && (
              <span className="block mt-2">초대 코드: <span className="font-mono font-bold">{formatInviteCode(roomInfo.code)}</span></span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <p>목적: {roomInfo?.purpose_category}</p>
            <p>지역: {roomInfo?.district}</p>
            <p>예상 인원: {roomInfo?.expected_members}명</p>
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
                <Input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임을 입력하세요"
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
        <CardFooter className="flex justify-center">
          <Button asChild variant="ghost">
            <Link href="/">홈으로</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
} 