'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function InviteCodeRedirect() {
  const router = useRouter()
  const params = useParams<{ code: string }>()
  const code = params?.code as string

  useEffect(() => {
    // 새 통합 경로로 리다이렉션
    if (code) {
      router.replace(`/invite?code=${code}`)
    } else {
      router.replace('/invite')
    }
  }, [code, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p>리다이렉션 중...</p>
    </div>
  )
} 