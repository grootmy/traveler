'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

export default function ResetPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      })

      if (error) {
        throw error
      }

      setSuccess(true)
      toast.success('비밀번호 재설정 이메일이 발송되었습니다.')
    } catch (err: any) {
      toast.error(err.message || '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800">
            <ArrowLeft className="mr-2 h-4 w-4" />
            돌아가기
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>비밀번호 찾기</CardTitle>
            <CardDescription>
              계정에 등록된 이메일로 비밀번호 재설정 링크를 보내드립니다
            </CardDescription>
          </CardHeader>

          {success ? (
            <CardContent className="space-y-4">
              <div className="bg-green-50 p-4 rounded-md text-green-800">
                <p className="font-medium">비밀번호 재설정 이메일이 발송되었습니다.</p>
                <p className="text-sm mt-2">
                  {email} 주소로 보낸 이메일을 확인하고 비밀번호 재설정 링크를 클릭해주세요.
                </p>
              </div>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => router.push('/')}
              >
                로그인 페이지로 돌아가기
              </Button>
            </CardContent>
          ) : (
            <>
              <CardContent>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      이메일
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="가입한 이메일을 입력하세요"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        처리 중...
                      </>
                    ) : (
                      '비밀번호 재설정 이메일 받기'
                    )}
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="flex justify-center">
                <p className="text-sm text-gray-600">
                  계정이 기억나셨나요?{' '}
                  <Link
                    href="/"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    로그인 하기
                  </Link>
                </p>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </main>
  )
} 