// OCR 관련 유틸리티 함수들

// 파일을 이미지로 읽는 함수
export const processImageFile = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('이미지를 읽는 중 오류가 발생했습니다.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('이미지를 읽는 중 오류가 발생했습니다.'));
    };
    reader.readAsDataURL(file);
  });
};

// OCR 처리 함수
export const performOCR = async (imageDataUrl: string): Promise<string> => {
  try {
    // Tesseract.js 동적 import (클라이언트 사이드에서만 로드)
    const Tesseract = await import('tesseract.js');
    
    // Worker 생성 및 언어 설정 (영어 + 한국어)
    const worker = await Tesseract.createWorker('eng+kor');
    
    // 이미지에서 텍스트 추출
    const { data: { text } } = await worker.recognize(imageDataUrl);
    
    // Worker 종료
    await worker.terminate();

    // 추출된 텍스트 반환
    return text.trim() || '텍스트를 찾을 수 없습니다.';
  } catch (error) {
    console.error('OCR 처리 오류:', error);
    throw new Error(`텍스트 추출 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
};

