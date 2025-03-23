'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut, deleteRoom, updateUserNickname, regenerateInviteCode, validateInviteCode } from '@/lib/supabase/client'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from "sonner"
import { Input } from '@/components/ui/input'
import { RefreshCw, Loader2, Copy, Link2 } from 'lucide-react'

type Room = {
  textid: string;
  title: string;
  created_at: string;
  status: 'active' | 'completed';
  expected_members: number;
  district: string;
  owner_id: string;
  code?: string;
}

export default function MyPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [createdRooms, setCreatedRooms] = useState<Room[]>([])
  const [participatingRooms, setParticipatingRooms] = useState<Room[]>([])
  const [completedRooms, setCompletedRooms] = useState<Room[]>([])
  const [deletingRoom, setDeletingRoom] = useState(false)
  const [regeneratingCode, setRegeneratingCode] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [updatingNickname, setUpdatingNickname] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [validatingCode, setValidatingCode] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const { user, error } = await getCurrentUser()
      
      if (error || !user) {
        router.push('/')
        return
      }
      
      setUser(user)
      
      // 사용자 프로필 정보 가져오기
      const { data: profileData } = await supabase
        .from('users')
        .select('textid, email, nickname, avatar_url')
        .eq('textid', user.id)
        .single()
      
      if (profileData?.nickname) {
        setNickname(profileData.nickname)
      }
      
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
      .in('status', ['active', 'routes_generated'])
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
        .in('textid', participatingRoomIds)
        .in('status', ['active', 'routes_generated'])
        .neq('owner_id', userId)  // 내가 만든 방은 제외 (이미 생성한 방에 표시됨)
        .order('created_at', { ascending: false })
      
      setParticipatingRooms(participatingRoomsInfo || [])
    } else {
      setParticipatingRooms([])
    }
    
    // 완료된 방 (내가 만든 방 + 내가 참여한 방)
    let query = supabase
      .from('rooms')
      .select('*')
      .eq('status', 'completed')
      
    if (participatingRoomIds.length > 0) {
      // 참여 중인 방이 있는 경우: 내가 만든 방 OR 내가 참여한 방
      query = query.or(`owner_id.eq.${userId},textid.in.(${participatingRoomIds.join(',')})`)
    } else {
      // 참여 중인 방이 없는 경우: 내가 만든 방만
      query = query.eq('owner_id', userId)
    }
    
    const { data: completedRoomsData } = await query.order('created_at', { ascending: false })
    
    setCreatedRooms(createdActiveRooms || [])
    setCompletedRooms(completedRoomsData || [])
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/')
  }

  const handleDeleteRoom = async (roomId: string) => {
    if (!user) return
    
    setDeletingRoom(true)
    
    try {
      const { success, error } = await deleteRoom(roomId, user.id)
      
      if (success) {
        // 방 목록 다시 불러오기
        await fetchRooms(user.id)
        toast.success("방이 성공적으로 삭제되었습니다.")
      } else {
        toast.error(error?.message || "방 삭제 중 오류가 발생했습니다.")
      }
    } catch (err: any) {
      toast.error(err.message || "방 삭제 중 오류가 발생했습니다.")
    } finally {
      setDeletingRoom(false)
    }
  }

  const handleUpdateNickname = async () => {
    if (!user || !nickname.trim()) return
    
    setUpdatingNickname(true)
    
    try {
      const { success, error } = await updateUserNickname(user.id, nickname)
      
      if (success) {
        toast.success("닉네임이 성공적으로 업데이트되었습니다.")
      } else {
        toast.error(error?.message || "닉네임 업데이트 중 오류가 발생했습니다.")
      }
    } catch (err: any) {
      toast.error(err.message || "닉네임 업데이트 중 오류가 발생했습니다.")
    } finally {
      setUpdatingNickname(false)
    }
  }

  // 초대 코드 재생성 핸들러
  const handleRegenerateInviteCode = async (roomId: string) => {
    if (!user) return;
    
    setRegeneratingCode(roomId);
    
    try {
      const result = await regenerateInviteCode(roomId, user.id);
      
      if (result.success) {
        // 방 목록 새로고침
        await fetchRooms(user.id);
        toast.success(`새 초대 코드: ${result.inviteCode}`);
      } else {
        toast.error(result.error?.message || "오류가 발생했습니다.");
      }
    } catch (error: any) {
      toast.error(error.message || "오류가 발생했습니다.");
    } finally {
      setRegeneratingCode(null);
    }
  };

  // 초대 코드로 방 참여 핸들러
  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      toast.error('초대 코드를 입력해주세요');
      return;
    }
    
    setValidatingCode(true);
    
    try {
      // 초대 코드 검증
      const result = await validateInviteCode(inviteCode);
      
      if (!result.isValid) {
        throw new Error(result.error || '유효하지 않은 초대 코드입니다');
      }
      
      // 로그인 사용자는 닉네임 페이지 없이 바로 방에 참여
      // 서버 사이드에서 방 참여 로직을 직접 처리
      const roomId = result.roomInfo?.textid;
      if (!roomId) {
        throw new Error('방 정보를 찾을 수 없습니다');
      }
      
      toast.success('유효한 초대 코드입니다. 방에 참여합니다.');
      
      try {
        // 사용자 ID가 유효한지 확인
        if (!user?.id) {
          throw new Error('로그인이 필요합니다');
        }
        
        // Supabase 클라이언트를 사용하여 직접 참여 처리
        console.log('방 참여 처리 시작:', roomId, user.id);
        
        // 이미 참여 중인지 먼저 확인
        const { data: existingMember } = await supabase
          .from('room_members')
          .select('*')
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (existingMember) {
          console.log('이미 방에 참여 중입니다');
          // 이미 참여 중이면 바로 해당 방으로 이동
          router.push(`/rooms/${roomId}/routes`);
          return;
        }
        const nickname = user?.nickname || '익명 사용자';
        // 새 멤버로 추가
        const { error: joinError } = await supabase
          .from('room_members')
          .insert({
            room_id: roomId,
            user_id: user.id,
            nickname: nickname,
            joined_at: new Date().toISOString(),
            is_anonymous: false
          });
        
        if (joinError) {
          console.error('방 참여 중 오류:', joinError);
          throw new Error(`방 참여 중 오류가 발생했습니다: ${joinError.message}`);
        }
        
        // 참여 성공 후 해당 방의 routes 페이지로 이동
        router.push(`/rooms/${roomId}/routes`);
      } catch (apiError: any) {
        console.error('방 참여 API 오류:', apiError);
        throw new Error(apiError.message || '방 참여 중 오류가 발생했습니다');
      }
    } catch (err: any) {
      console.error('방 참여 오류:', err);
      toast.error(err.message || '유효하지 않은 초대 코드입니다');
    } finally {
      setValidatingCode(false);
    }
  };

  // 초대 링크 복사 핸들러 추가
  const handleCopyInviteLink = (roomId: string, code: string) => {
    const inviteLink = `${window.location.origin}/invite?code=${code}`;
    navigator.clipboard.writeText(inviteLink);
    toast.success("초대 링크가 클립보드에 복사되었습니다.");
  };

  // 초대 코드 복사 핸들러 추가
  const handleCopyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("초대 코드가 클립보드에 복사되었습니다.");
  };

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

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>프로필 설정</CardTitle>
            <CardDescription>
              닉네임을 설정하면 모든 방에서 동일한 닉네임으로 표시됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="닉네임을 입력하세요"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="max-w-xs"
              />
              <Button 
                onClick={handleUpdateNickname} 
                disabled={updatingNickname || !nickname.trim()}
              >
                {updatingNickname ? '저장 중...' : '저장'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>초대 코드로 참여</CardTitle>
            <CardDescription>
              초대 코드를 입력하여 다른 사람의 여행 계획에 참여하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinWithCode} className="flex gap-2">
              <Input
                placeholder="초대 코드를 입력하세요 (예: ABC-123)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="max-w-xs"
              />
              <Button 
                type="submit"
                disabled={validatingCode || !inviteCode.trim()}
              >
                {validatingCode ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    확인 중...
                  </>
                ) : '참여하기'}
              </Button>
            </form>
          </CardContent>
        </Card>

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
                  <Card key={room.textid}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl">{room.title}</CardTitle>
                      <CardDescription>
                        {formatDate(new Date(room.created_at))}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <p className="text-sm">예상 인원: {room.expected_members}명</p>
                      <p className="text-sm">지역: {room.district}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-medium">초대 코드:</span>
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-2 py-1 text-sm">
                            {room.code}
                          </code>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleCopyInviteCode(room.code || '')}
                            title="초대 코드 복사"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleCopyInviteLink(room.textid, room.code || '')}
                            title="초대 링크 복사"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleRegenerateInviteCode(room.textid)}
                            disabled={regeneratingCode === room.textid}
                            title="초대 코드 재생성"
                          >
                            {regeneratingCode === room.textid ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex gap-2">
                      <Button asChild className="flex-1">
                        <Link href={`/rooms/${room.textid}/routes`}>
                          입장하기
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            삭제
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>방 삭제</AlertDialogTitle>
                            <AlertDialogDescription>
                              정말로 이 방을 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 모든 관련 데이터가 삭제됩니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteRoom(room.textid)}
                              disabled={deletingRoom}
                            >
                              {deletingRoom ? '삭제 중...' : '삭제'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
                  <Card key={room.textid}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl">{room.title}</CardTitle>
                      <CardDescription>
                        {formatDate(new Date(room.created_at))}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <p className="text-sm">예상 인원: {room.expected_members}명</p>
                      <p className="text-sm">지역: {room.district}</p>
                      {room.code && (
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-medium">초대 코드:</span>
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-muted px-2 py-1 text-sm">
                              {room.code}
                            </code>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleCopyInviteCode(room.code || '')}
                              title="초대 코드 복사"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleCopyInviteLink(room.textid, room.code || '')}
                              title="초대 링크 복사"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button asChild className="w-full">
                        <Link href={`/rooms/${room.textid}/routes`}>
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
                  <Card key={room.textid}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl">{room.title}</CardTitle>
                      <CardDescription>
                        {formatDate(new Date(room.created_at))}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <p className="text-sm">예상 인원: {room.expected_members}명</p>
                      <p className="text-sm">지역: {room.district}</p>
                    </CardContent>
                    <CardFooter className="flex gap-2">
                      <Button asChild className="flex-1">
                        <Link href={`/rooms/${room.textid}/result`}>
                          결과 보기
                        </Link>
                      </Button>
                      {room.owner_id === user?.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              삭제
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>방 삭제</AlertDialogTitle>
                              <AlertDialogDescription>
                                정말로 이 방을 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 모든 관련 데이터가 삭제됩니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteRoom(room.textid)}
                                disabled={deletingRoom}
                              >
                                {deletingRoom ? '삭제 중...' : '삭제'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
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