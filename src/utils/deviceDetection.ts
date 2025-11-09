/**
 * 디바이스가 모바일인지 확인하는 유틸리티 함수
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // User Agent로 모바일 기기 감지
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  
  // 터치 이벤트 지원 여부 확인
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // 화면 크기 확인 (768px 이하는 모바일로 간주)
  const isSmallScreen = window.innerWidth <= 768;
  
  return mobileRegex.test(userAgent) || (hasTouchScreen && isSmallScreen);
};

/**
 * 카메라 접근 가능 여부 확인
 */
export const isCameraAvailable = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !navigator.mediaDevices) return false;
  
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('카메라 확인 오류:', error);
    return false;
  }
};

