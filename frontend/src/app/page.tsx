'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signInWithEmail, validateInviteCode } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from "sonner"
import { Loader2 } from 'lucide-react'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [validatingCode, setValidatingCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await signInWithEmail(email, password)
      
      if (error) {
        throw error
      }
      
      if (data) {
        router.push('/mypage')
      }
    } catch (err: any) {
      setError(err.message || '로그인 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidatingCode(true)
    
    try {
      // 초대 코드 검증
      const result = await validateInviteCode(inviteCode)
      
      if (!result.isValid) {
        throw new Error(result.error || '유효하지 않은 초대 코드입니다')
      }
      
      // 유효한 코드면 초대 페이지로 이동
      router.push(`/invite/${inviteCode}`)
    } catch (err: any) {
      toast.error(err.message || '유효하지 않은 초대 코드입니다')
    } finally {
      setValidatingCode(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-600 mb-2">당일치기</h1>
          <p className="text-lg text-gray-600">
            당신의 완벽한 당일치기 여행을 계획해보세요
          </p>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">로그인</TabsTrigger>
            <TabsTrigger value="invite">초대 코드</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>로그인</CardTitle>
                <CardDescription>
                  계정에 로그인하여 당일치기 여행을 계획해보세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      이메일
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="이메일을 입력하세요"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="text-sm font-medium">
                        비밀번호
                      </label>
                      <Link
                        href="/reset-password"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        비밀번호 찾기
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="비밀번호를 입력하세요"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {error && (
                    <div className="text-sm text-red-500 mt-2">{error}</div>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading ? '로그인 중...' : '로그인'}
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="flex justify-center">
                <p className="text-sm text-gray-600">
                  계정이 없으신가요?{' '}
                  <Link
                    href="/signup"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    회원가입
                  </Link>
                </p>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="invite">
            <Card>
              <CardHeader>
                <CardTitle>초대 코드로 참여</CardTitle>
                <CardDescription>
                  초대 코드를 입력하여 여행 계획에 참여하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleJoinWithCode} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="inviteCode" className="text-sm font-medium">
                      초대 코드
                    </label>
                    <Input
                      id="inviteCode"
                      placeholder="초대 코드를 입력하세요 (예: ABCD-1234)"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={validatingCode}
                  >
                    {validatingCode ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        확인 중...
                      </>
                    ) : (
                      '참여하기'
                    )}
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="flex justify-center">
                <p className="text-sm text-gray-600">
                  또는 <Link href="/rooms/create" className="text-blue-600 hover:underline font-medium">새 여행 계획 만들기</Link>
                </p>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
