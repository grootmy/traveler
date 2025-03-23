'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatInviteCode, validateInviteCode as validateInviteCodeClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { validateInviteCode, joinRoomAnonymously, joinRoomAsUser } from '@/app/actions/invitation'
import { useSearchParams } from 'next/navigation'

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

// 실제 컨텐츠를 담당하는 컴포넌트
function InvitePageContent() {
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
          console.log('[Client] 쿼리 파라미터에서 찾은 초대 코드:', code);
          setInviteCode(code);
          
          // 디버깅을 위해 코드 정규화 로직 추가
          const normalizedClientCode = code.toUpperCase().replace(/[\s-]/g, '');
          console.log('[Client] 클라이언트에서 정규화한 코드:', normalizedClientCode);
          
          // 서버 액션 호출 (invitation.ts)
          console.log('[Client] Server Action으로 검증 시작');
          const result = await validateInviteCode(code);
          console.log('[Client] 초대 코드 검증 결과:', result);
          
          // 실패 시 클라이언트 측 검증으로 폴백 처리
          if (!result.isValid) {
            console.log('[Client] Server Action 검증 실패, 클라이언트 측 검증 시도');
            
            // 특정 오류 코드 확인 (DB 연결 실패 등)
            const isDbError = result.error === 'DB_CONNECTION_ERROR' || 
                             result.error === 'DB_QUERY_ERROR';
            
            // DB 오류거나 코드를 찾지 못한 경우만 클라이언트 폴백 수행
            if (isDbError || result.error === '존재하지 않는 초대 코드입니다') {
              const clientResult = await validateInviteCodeClient(code);
              console.log('[Client] 클라이언트 측 검증 결과:', clientResult);
              
              if (clientResult.isValid) {
                console.log('[Client] 클라이언트 측 검증 성공, 결과 사용');
                setRoomInfo(clientResult.roomInfo as RoomInfo);
                return;
              }
            }
          
            console.error('[Client] 초대 코드 오류:', result.error);
            setError(result.error || '유효하지 않은 초대 코드입니다');
            return;
          }
          
          setRoomInfo(result.roomInfo as RoomInfo);
        } 
        // 방 ID가 URL에 있는 경우 (직접 방으로 접근)
        else if (roomId) {
          try {
            const response = await fetch(`/api/rooms/${roomId}`);
            
            if (!response.ok) {
              throw new Error(`방 정보 로드 실패: ${response.status}`);
            }
            
            const roomData = await response.json();
            setRoomInfo(roomData);
            setInviteCode(roomData.code);
          } catch (err: any) {
            console.error('방 정보 로드 오류:', err);
            setError('방 정보를 찾을 수 없습니다');
            return;
          }
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

  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteCode.trim()) {
      toast.error('초대 코드를 입력해주세요');
      return;
    }
    
    setValidatingCode(true);
    setError(null);
    
    try {
      const result = await validateInviteCode(inviteCode);
      
      if (!result.isValid) {
        toast.error(result.error || '유효하지 않은 초대 코드입니다');
        return;
      }
      
      setRoomInfo(result.roomInfo as RoomInfo);
      toast.success('유효한 초대 코드입니다!');
    } catch (err: any) {
      console.error('초대 코드 검증 중 오류:', err);
      toast.error(err.message || '초대 코드 확인 중 오류가 발생했습니다');
      setError('초대 코드 확인 중 오류가 발생했습니다');
    } finally {
      setValidatingCode(false);
    }
  }

  // 익명 사용자 참여 시작 핸들러
  const handleAnonymousJoinStart = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nickname.trim()) {
      toast.error('닉네임을 입력해주세요');
      return;
    }
    
    if (!roomInfo) {
      setError('방 정보를 찾을 수 없습니다');
      return;
    }
    
    setJoining(true);
    console.log('[Client] 익명 참여 시작:', roomInfo.textid, nickname);
    
    try {
      // Server Action 직접 호출 (form submit 대신)
      const result = await joinRoomAnonymously(new FormData(e.target as HTMLFormElement));
      
      // 결과가 에러 객체인 경우 처리
      if (result && 'error' in result) {
        console.error('[Client] 익명 참여 오류:', result.error);
        setJoining(false);
        toast.error(result.error || '방 참여 중 오류가 발생했습니다');
        return;
      }
      
      // 서버 액션이 정상적으로 리다이렉트되어 이 부분은 실행되지 않음
      console.log('[Client] 참여 성공, 라우터로 페이지 이동');
      router.push(`/rooms/${roomInfo.textid}/routes`);
    } catch (error) {
      console.error('[Client] 익명 참여 예외 발생:', error);
      setJoining(false);
      toast.error('방 참여 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
    
    // 오류 처리 - Server Action이 리다이렉트하지 않은 경우 (오류)
    setTimeout(() => {
      if (joining) {
        setJoining(false);
        toast.error('서버 응답 시간 초과. 다시 시도해 주세요.');
      }
    }, 8000);
  };
  
  // 로그인 사용자 참여 시작 핸들러
  const handleUserJoinStart = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roomInfo) {
      setError('방 정보를 찾을 수 없습니다');
      return;
    }
    
    setJoining(true);
    console.log('[Client] 로그인 사용자 참여 시작:', roomInfo.textid);
    
    try {
      // Server Action 직접 호출 (form submit 대신)
      const result = await joinRoomAsUser(new FormData(e.target as HTMLFormElement));
      
      // 결과가 에러 객체인 경우 처리
      if (result && 'error' in result) {
        console.error('[Client] 로그인 사용자 참여 오류:', result.error);
        setJoining(false);
        toast.error(result.error || '방 참여 중 오류가 발생했습니다');
        return;
      }
      
      // 서버 액션이 정상적으로 리다이렉트되어 이 부분은 실행되지 않음
      console.log('[Client] 참여 성공, 라우터로 페이지 이동');
      router.push(`/rooms/${roomInfo.textid}/routes`);
    } catch (error) {
      console.error('[Client] 로그인 사용자 참여 예외 발생:', error);
      setJoining(false);
      toast.error('방 참여 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
    
    // 오류 처리 - Server Action이 리다이렉트하지 않은 경우 (오류)
    setTimeout(() => {
      if (joining) {
        setJoining(false);
        toast.error('서버 응답 시간 초과. 다시 시도해 주세요.');
      }
    }, 8000);
  };

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
  if (!roomInfo) {
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
                  placeholder="초대 코드 (예: ABC-123)"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="text-center text-lg tracking-widest"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={validatingCode || !inviteCode.trim()}
              >
                {validatingCode ? '확인 중...' : '확인'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 방 정보가 있는 경우 방 참여 화면
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">{roomInfo.title}</CardTitle>
          <CardDescription className="text-center">
            여행 계획 구성에 참여하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-center mb-2">초대 코드</p>
            <div className="text-center text-2xl font-bold tracking-widest bg-muted p-4 rounded-lg">
              {formatInviteCode(roomInfo.code)}
            </div>
          </div>
          
          {user ? (
            // 로그인 사용자 참여 폼
            <form action={joinRoomAsUser as any} onSubmit={handleUserJoinStart}>
              <input type="hidden" name="roomId" value={roomInfo.textid} />
              <Button type="submit" className="w-full" disabled={joining}>
                {joining ? '참여 중...' : '내 계정으로 참여하기'}
              </Button>
            </form>
          ) : (
            // 익명 사용자 참여 폼
            <form action={joinRoomAnonymously as any} onSubmit={handleAnonymousJoinStart} className="space-y-4">
              <input type="hidden" name="roomId" value={roomInfo.textid} />
              <div>
                <p className="text-sm font-medium mb-2">닉네임</p>
                <Input
                  name="nickname"
                  placeholder="닉네임을 입력하세요"
                  required
                  minLength={2}
                  maxLength={20}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={joining || !nickname.trim()}>
                {joining ? '참여 중...' : '익명으로 참여하기'}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground">
            또는
          </p>
          {user ? (
            <Button variant="outline" asChild className="w-full">
              <Link href="/mypage">내 여행 목록으로 돌아가기</Link>
            </Button>
          ) : (
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => router.push(`/?redirect=${encodeURIComponent(`/rooms/${roomInfo.textid}/routes`)}`)}
            >
              계정으로 로그인하기
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

// Suspense로 감싸는 메인 컴포넌트
export default function InvitePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">로딩 중...</div>}>
      <InvitePageContent />
    </Suspense>
  );
} 