'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getCurrentUser, formatInviteCode } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Clipboard, RefreshCw, Copy, Share2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { regenerateInviteCodeAction } from '@/app/actions/invitation'

export default function InvitePage({ params }: { params: { roomId: string } }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [room, setRoom] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  
  const router = useRouter()
  const { roomId } = params

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        
        // 사용자 정보 가져오기
        const { user, error: userError } = await getCurrentUser()
        
        if (userError) throw userError
        
        setUser(user)
        
        // 방 정보 가져오기
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('textid', roomId)
          .single()
        
        if (roomError) throw roomError
        
        if (!roomData) {
          setError('방을 찾을 수 없습니다')
          return
        }
        
        setRoom(roomData)
        setIsOwner(roomData.owner_id === user?.id)
        
        // 방 멤버 목록 가져오기
        const { data: membersData, error: membersError } = await supabase
          .from('room_members')
          .select(`
            *,
            user:user_id (textid, nickname, email, avatar_url)
          `)
          .eq('room_id', roomId)
          .order('joined_at', { ascending: true })
        
        if (membersError) throw membersError
        
        setMembers(membersData || [])
      } catch (err: any) {
        console.error('초대 페이지 로딩 오류:', err)
        setError(err.message || '정보를 불러오는 중 오류가 발생했습니다')
      } finally {
        setLoading(false)
      }
    }
    
    init()
  }, [roomId])

  // 초대 링크 복사 함수
  const handleCopyInviteLink = () => {
    if (!room?.code) return;
    
    const inviteLink = `${window.location.origin}/invite?code=${room.code}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success('초대 링크가 클립보드에 복사되었습니다.');
    
    setTimeout(() => setCopied(false), 2000);
  };

  // 초대 코드 재생성 시작 함수
  const handleRegenerateCode = async (formData: FormData) => {
    if (!isOwner || !room) return;
    
    setRegenerating(true);
    
    try {
      const result = await regenerateInviteCodeAction(formData);
      
      if (result.success) {
        // 방 정보 업데이트
        setRoom((prev: any) => prev ? { ...prev, code: result.inviteCode } : null);
        toast.success('초대 코드가 재생성되었습니다.');
      } else {
        toast.error(result.error || '초대 코드 재생성 중 오류가 발생했습니다.');
      }
    } catch (error: any) {
      toast.error(error.message || '초대 코드 재생성 중 오류가 발생했습니다.');
    } finally {
      setRegenerating(false);
    }
  };

  // 공유하기 함수
  const handleShare = async () => {
    if (!room?.code) return;
    
    const inviteLink = `${window.location.origin}/invite?code=${room.code}`;
    const title = `${room.title} - 당일치기 여행에 초대합니다!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: '여행 계획에 참여해보세요!',
          url: inviteLink
        });
      } catch (err) {
        console.error('공유하기 오류:', err);
        // 공유가 취소되거나 실패하면 클립보드에 복사
        handleCopyInviteLink();
      }
    } else {
      // Web Share API를 지원하지 않는 브라우저는 클립보드 복사로 대체
      handleCopyInviteLink();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline">
          <Link href="/rooms">방 목록으로 돌아가기</Link>
        </Button>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto">
        {/* 뒤로 가기 버튼 */}
        <div className="mb-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/mypage">
              <ArrowLeft className="mr-2 h-4 w-4" />
              로비로 돌아가기
            </Link>
          </Button>
        </div>
        
        {/* 초대 코드 카드 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>초대 코드</CardTitle>
            <CardDescription>
              아래 코드나 링크를 공유하여 친구들을 초대하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {/* 초대 코드 표시 */}
              <div className="flex items-center justify-center">
                <div className="text-3xl font-bold tracking-widest bg-muted p-6 rounded-lg">
                  {formatInviteCode(room?.code || '')}
                </div>
              </div>
              
              {/* 버튼 그룹 */}
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={handleCopyInviteLink}
                  disabled={copied}
                >
                  {copied ? (
                    <>
                      <Clipboard className="mr-2 h-4 w-4" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      초대 링크 복사
                    </>
                  )}
                </Button>
                
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={handleShare}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  공유하기
                </Button>
                
                {isOwner && (
                  <form action={handleRegenerateCode}>
                    <input type="hidden" name="roomId" value={roomId} />
                    <Button 
                      type="submit"
                      variant="secondary" 
                      className="flex-1" 
                      disabled={regenerating}
                    >
                      {regenerating ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          재생성 중...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          코드 재생성
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* 입장하기 버튼 */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <Button asChild className="w-full">
              <Link href={`/rooms/${roomId}/routes`}>
                입장하기
              </Link>
            </Button>
          </CardContent>
        </Card>
        
        {/* 참여자 목록 카드 - 주석 처리 
        <Card>
          <CardHeader>
            <CardTitle>참여자 목록 ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">아직 참여자가 없습니다.</p>
            ) : (
              <ul className="space-y-4">
                {members.map((member) => (
                  <li key={member.textid} className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                      {member.user?.nickname?.charAt(0) || member.nickname?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {member.user?.nickname || member.nickname || '익명'}
                        {room?.owner_id === member.user_id && (
                          <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">방장</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(member.joined_at).toLocaleDateString()} 참여
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        */}
      </div>
    </main>
  )
} 