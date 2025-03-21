import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 초대 코드 정규화 (공백 및 하이픈 제거, 대문자 변환)
function normalizeInviteCode(code: string): string {
  if (!code) return '';
  
  // 모든 공백, 하이픈 등 제거하고 대문자로 변환
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// 미들웨어 함수 - 요청이 처리되기 전에 실행됩니다
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  console.log('[Middleware] 요청 경로:', pathname, search ? `?${search}` : '');

  // /invite/[code] 패턴 처리 - 새로운 /invite?code= 형식으로 리다이렉트
  if (pathname.startsWith('/invite/')) {
    try {
      const code = pathname.split('/').pop()
      console.log('[Middleware] 추출된 초대 코드:', code);
      
      if (!code) {
        console.log('[Middleware] 초대 코드가 없음, 기본 초대 페이지로 리다이렉트');
        const url = request.nextUrl.clone()
        url.pathname = '/invite'
        return NextResponse.redirect(url)
      }
      
      const normalizedCode = normalizeInviteCode(code)
      console.log('[Middleware] 정규화된 초대 코드:', normalizedCode, '(원본:', code, ')');
      
      if (!normalizedCode) {
        console.log('[Middleware] 유효하지 않은 초대 코드 형식, 기본 초대 페이지로 리다이렉트');
        const url = request.nextUrl.clone()
        url.pathname = '/invite'
        return NextResponse.redirect(url)
      }
      
      const url = request.nextUrl.clone()
      url.pathname = '/invite'
      url.searchParams.set('code', normalizedCode)
      
      console.log(`[Middleware] 초대 코드 URL 변환: ${pathname} -> ${url.pathname}?code=${normalizedCode}`);
      return NextResponse.redirect(url)
    } catch (error) {
      console.error('[Middleware] 초대 코드 처리 중 오류:', error);
      
      // 오류 발생 시 기본 invite 페이지로 리다이렉트
      const url = request.nextUrl.clone()
      url.pathname = '/invite'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

// 미들웨어가 실행될 경로를 지정합니다
export const config = {
  matcher: [
    '/invite/:path*',
  ],
} 