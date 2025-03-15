'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signUpWithEmail, saveUserPreferences } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type PreferenceOption = {
  id: string;
  label: string;
}

const travelPreferences: PreferenceOption[] = [
  { id: 'nature', label: '자연/풍경' },
  { id: 'culture', label: '문화/역사' },
  { id: 'food', label: '맛집/카페' },
  { id: 'shopping', label: '쇼핑' },
  { id: 'activity', label: '액티비티' },
]

const foodPreferences: PreferenceOption[] = [
  { id: 'korean', label: '한식' },
  { id: 'western', label: '양식' },
  { id: 'chinese', label: '중식' },
  { id: 'japanese', label: '일식' },
  { id: 'cafe', label: '카페/디저트' },
]

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTravelPrefs, setSelectedTravelPrefs] = useState<string[]>([])
  const [selectedFoodPrefs, setSelectedFoodPrefs] = useState<string[]>([])
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다')
      setLoading(false)
      return
    }

    try {
      const { data, error } = await signUpWithEmail(email, password)
      
      if (error) {
        throw error
      }
      
      if (data.user) {
        setStep(2)
      }
    } catch (err: any) {
      setError(err.message || '회원가입 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handlePreferenceToggle = (prefType: 'travel' | 'food', id: string) => {
    if (prefType === 'travel') {
      if (selectedTravelPrefs.includes(id)) {
        setSelectedTravelPrefs(selectedTravelPrefs.filter(p => p !== id))
      } else {
        setSelectedTravelPrefs([...selectedTravelPrefs, id])
      }
    } else {
      if (selectedFoodPrefs.includes(id)) {
        setSelectedFoodPrefs(selectedFoodPrefs.filter(p => p !== id))
      } else {
        setSelectedFoodPrefs([...selectedFoodPrefs, id])
      }
    }
  }

  const handlePreferenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { user } = await signUpWithEmail(email, password)
      
      if (user) {
        await saveUserPreferences(user.id, {
          travel: selectedTravelPrefs,
          food: selectedFoodPrefs
        })
        
        router.push('/login?registered=true')
      }
    } catch (err: any) {
      setError(err.message || '성향 정보 저장 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
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

        <Card>
          <CardHeader>
            <CardTitle>회원가입</CardTitle>
            <CardDescription>
              {step === 1 
                ? '계정 정보를 입력해주세요' 
                : '여행 성향을 알려주세요'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 ? (
              <form onSubmit={handleSignUp} className="space-y-4">
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
                  <label htmlFor="password" className="text-sm font-medium">
                    비밀번호
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="비밀번호를 입력하세요"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium">
                    비밀번호 확인
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="비밀번호를 다시 입력하세요"
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
                  {loading ? '처리 중...' : '다음'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handlePreferenceSubmit} className="space-y-6">
                <Tabs defaultValue="travel" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="travel">여행 취향</TabsTrigger>
                    <TabsTrigger value="food">음식 취향</TabsTrigger>
                  </TabsList>
                  <TabsContent value="travel" className="mt-4">
                    <div className="text-sm mb-2">선호하는 여행 스타일을 선택해주세요 (여러 개 선택 가능)</div>
                    <div className="flex flex-wrap gap-2">
                      {travelPreferences.map(pref => (
                        <Button
                          key={pref.id}
                          type="button"
                          variant={selectedTravelPrefs.includes(pref.id) ? "default" : "outline"}
                          onClick={() => handlePreferenceToggle('travel', pref.id)}
                          className="flex-grow"
                        >
                          {pref.label}
                        </Button>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="food" className="mt-4">
                    <div className="text-sm mb-2">선호하는 음식 종류를 선택해주세요 (여러 개 선택 가능)</div>
                    <div className="flex flex-wrap gap-2">
                      {foodPreferences.map(pref => (
                        <Button
                          key={pref.id}
                          type="button"
                          variant={selectedFoodPrefs.includes(pref.id) ? "default" : "outline"}
                          onClick={() => handlePreferenceToggle('food', pref.id)}
                          className="flex-grow"
                        >
                          {pref.label}
                        </Button>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
                {error && (
                  <div className="text-sm text-red-500 mt-2">{error}</div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(1)}
                    disabled={loading}
                  >
                    이전
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading}
                  >
                    {loading ? '처리 중...' : '회원가입 완료'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
          {step === 1 && (
            <CardFooter className="flex justify-center">
              <p className="text-sm text-gray-600">
                이미 계정이 있으신가요?{' '}
                <Link
                  href="/"
                  className="text-blue-600 hover:underline font-medium"
                >
                  로그인
                </Link>
              </p>
            </CardFooter>
          )}
        </Card>
      </div>
    </main>
  )
} 