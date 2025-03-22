'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, Check } from 'lucide-react'
import { toast } from 'sonner'

export default function UpdatePassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | null>(null)
  const router = useRouter()

  // 비밀번호 강도 확인
  const checkPasswordStrength = (password: string) => {
    if (password.length < 8) {
      return 'weak'
    }

    let strength = 0
    if (password.length >= 12) strength += 1
    if (/[A-Z]/.test(password)) strength += 1
    if (/[0-9]/.test(password)) strength += 1
    if (/[^A-Za-z0-9]/.test(password)) strength += 1

    if (strength >= 3) return 'strong'
    if (strength >= 1) return 'medium'
    return 'weak'
  }

  // 비밀번호 변경 시 강도 체크
  useEffect(() => {
    if (password) {
      setPasswordStrength(checkPasswordStrength(password))
    } else {
      setPasswordStrength(null)
    }
  }, [password])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // 비밀번호 확인
    if (password !== confirmPassword) {
      setError('비밀번호와 비밀번호 확인이 일치하지 않습니다')
      setLoading(false)
      return
    }

    // 비밀번호 강도 확인
    if (passwordStrength === 'weak') {
      setError('보안을 위해 더 강력한 비밀번호를 사용해주세요')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password
      })

      if (error) {
        throw error
      }

      setSuccess(true)
      toast.success('비밀번호가 성공적으로 업데이트되었습니다')

      // 3초 후 로그인 페이지로 리디렉션
      setTimeout(() => {
        router.push('/')
      }, 3000)
    } catch (err: any) {
      setError(err.message || '비밀번호 업데이트 중 오류가 발생했습니다')
      toast.error('비밀번호 업데이트 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const renderPasswordStrength = () => {
    if (!passwordStrength) return null

    const strengthConfig = {
      weak: {
        text: '약함',
        color: 'bg-red-500',
        width: 'w-1/3'
      },
      medium: {
        text: '보통',
        color: 'bg-yellow-500',
        width: 'w-2/3'
      },
      strong: {
        text: '강함',
        color: 'bg-green-500',
        width: 'w-full'
      }
    }

    const config = strengthConfig[passwordStrength]

    return (
      <div className="mt-1">
        <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${config.color} ${config.width}`}></div>
        </div>
        <p className={`text-xs mt-1 ${
          passwordStrength === 'weak' ? 'text-red-500' : 
          passwordStrength === 'medium' ? 'text-yellow-600' : 'text-green-600'
        }`}>
          비밀번호 강도: {config.text}
        </p>
      </div>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800">
            <ArrowLeft className="mr-2 h-4 w-4" />
            로그인 페이지로
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>새 비밀번호 설정</CardTitle>
            <CardDescription>
              안전한 새 비밀번호를 입력해주세요
            </CardDescription>
          </CardHeader>

          {success ? (
            <CardContent className="space-y-4">
              <div className="bg-green-50 p-4 rounded-md text-green-800 flex items-start">
                <Check className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">비밀번호가 성공적으로 변경되었습니다!</p>
                  <p className="text-sm mt-2">곧 로그인 페이지로 이동합니다...</p>
                </div>
              </div>
            </CardContent>
          ) : (
            <>
              <CardContent>
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium">
                      새 비밀번호
                    </label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="새 비밀번호를 입력하세요"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    {renderPasswordStrength()}
                    <p className="text-xs text-gray-500 mt-1">
                      8자 이상, 대문자, 숫자, 특수문자를 포함하면 더 안전합니다
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="text-sm font-medium">
                      비밀번호 확인
                    </label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="새 비밀번호를 다시 입력하세요"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
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
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        처리 중...
                      </>
                    ) : (
                      '비밀번호 변경하기'
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  )
} 