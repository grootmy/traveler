import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { validateInviteCode } from '@/app/actions/invitation'

// 유틸리티 함수 - 정규화
function normalizeCode(code: string): string {
  if (!code) return '';
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// 서버 컴포넌트
export default async function InviteCodePage({ params }: { params: { code: string } }) {
  // 코드 검증
  const { code } = params
  
  console.log('[Server] invite/[code]/page.tsx 렌더링:', code);
  
  // 코드가 없는 경우 404 처리
  if (!code) {
    console.log('[Server] 초대 코드가 없음 - 404 반환');
    return notFound();
  }
  
  try {
    // 코드 정규화
    const normalizedCode = normalizeCode(code);
    console.log('[Server] [code] 페이지에서 정규화된 코드:', normalizedCode);
    
    // 정규화된 코드가 다르면 정규화된 URL로 리다이렉트
    if (normalizedCode !== code) {
      console.log('[Server] 정규화 후 다른 코드, 리다이렉트 시도');
      redirect(`/invite/${normalizedCode}`);
    }
    
    // 코드 검증
    const result = await validateInviteCode(normalizedCode);
    console.log('[Server] 코드 검증 결과:', result);
    
    // 유효한 코드인 경우 /invite?code=XXX로 리다이렉트
    if (result.isValid) {
      console.log('[Server] 유효한 코드, 리다이렉트:', normalizedCode);
      redirect(`/invite?code=${normalizedCode}`);
    }
    
    // 유효하지 않은 코드인 경우 오류 메시지 표시
    console.log('[Server] 유효하지 않은 코드, 오류 표시:', result.error);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">오류 발생</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p>{result.error || '존재하지 않는 초대 코드입니다'}</p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild>
              <Link href="/">홈으로 돌아가기</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('[Server] 초대 코드 처리 중 예외 발생:', error);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">서버 오류</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p>초대 코드 처리 중 오류가 발생했습니다. 다시 시도해 주세요.</p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild>
              <Link href="/">홈으로 돌아가기</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
} 