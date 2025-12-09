// Service Worker를 동적으로 등록하는 유틸리티

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    // 기존 Service Worker가 있으면 먼저 해제
    const existingRegistrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of existingRegistrations) {
      if (registration.scope.includes('firebase-messaging')) {
        await registration.unregister();
      }
    }

    // 정적 파일 사용 (더 안정적)
    // basePath를 동적으로 감지
    let basePath = '';
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      // /hahahaEnglish로 시작하는지 확인
      if (pathname.startsWith('/hahahaEnglish')) {
        basePath = '/hahahaEnglish';
      }
      // 또는 환경 변수에서 가져오기 (프로덕션 빌드 시)
      if (!basePath && process.env.NEXT_PUBLIC_BASE_PATH) {
        basePath = process.env.NEXT_PUBLIC_BASE_PATH;
      }
    }
    
    const swPath = `${basePath}/firebase-messaging-sw.js`.replace(/\/+/g, '/');
    // scope는 반드시 trailing slash를 포함해야 함
    const swScope = basePath ? `${basePath}/` : '/';
    
    console.log('[ServiceWorker] Service Worker 경로:', swPath, '스코프:', swScope);
    
    try {
      const registration = await navigator.serviceWorker.register(swPath, {
        scope: swScope,
      });
      
      // Service Worker가 활성화될 때까지 대기
      await navigator.serviceWorker.ready;
      
      // Service Worker가 활성화될 때까지 대기
      let activeWorker = registration.active;
      if (!activeWorker) {
        // installing 또는 waiting 상태일 수 있음
        if (registration.installing) {
          activeWorker = registration.installing;
          await new Promise((resolve) => {
            activeWorker!.addEventListener('statechange', () => {
              if (activeWorker!.state === 'activated') {
                resolve(undefined);
              }
            });
          });
        } else if (registration.waiting) {
          activeWorker = registration.waiting;
          // waiting 상태의 Service Worker를 활성화
          activeWorker.postMessage({ type: 'SKIP_WAITING' });
          await new Promise((resolve) => {
            activeWorker!.addEventListener('statechange', () => {
              if (activeWorker!.state === 'activated') {
                resolve(undefined);
              }
            });
          });
        }
      }

      // Firebase 설정을 Service Worker에 전달
      if (activeWorker) {
        // 약간의 지연 후 메시지 전송 (Service Worker가 완전히 준비될 때까지)
        setTimeout(() => {
          activeWorker!.postMessage({
            type: 'FIREBASE_CONFIG',
            config: {
              apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
              authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
              projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
              storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
              messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
              appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
            },
          });
        }, 100);
      }
      
      console.log('[ServiceWorker] 정적 파일 등록 성공:', registration.scope);
      return registration;
    } catch (staticError) {
      console.error('[ServiceWorker] 정적 파일 등록 실패:', staticError);
      
      // 정적 파일이 없을 경우, 인라인 Service Worker 코드를 사용
      // 하지만 Service Worker는 외부 스크립트만 지원하므로, 
      // 정적 파일이 반드시 필요합니다. 여기서는 경고만 표시합니다.
      console.warn('[ServiceWorker] 정적 파일을 찾을 수 없습니다. /firebase-messaging-sw.js 파일이 서버에 업로드되었는지 확인해주세요.');
      return null;
    }
  } catch (error) {
    console.error('[ServiceWorker] Service Worker 등록 실패:', error);
    return null;
  }
};

