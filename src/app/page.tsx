'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/Header';
import LoginForm from '@/components/LoginForm';
import PasteImageModal from '@/components/PasteImageModal';
import OCRResultModal from '@/components/OCRResultModal';
import StatisticsView from '@/components/StatisticsView';
import WordSearchModal from '@/components/WordSearchModal';
import FlashcardListModal from '@/components/FlashcardListModal';
import { isMobileDevice } from '@/utils/deviceDetection';

type ViewMode = 'main' | 'statistics';

export default function Home() {
  const { user, loading } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [isOCROpen, setIsOCROpen] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isPasteImageOpen, setIsPasteImageOpen] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null); // 임시 저장된 이미지
  const [isWordSearchOpen, setIsWordSearchOpen] = useState(false);
  const [isFlashcardListOpen, setIsFlashcardListOpen] = useState(false);
  const [currentView, setCurrentView] = useState<ViewMode>('main');

  // 모바일 디바이스 감지 (클라이언트 사이드에서만 실행)
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  // OCR 처리 함수
  const handleOCR = async (imageDataUrl: string) => {
    setIsOCROpen(true);
    setIsProcessingOCR(true);
    setOcrText('');

    try {
      // Tesseract.js 동적 import (클라이언트 사이드에서만 로드)
      const Tesseract = await import('tesseract.js');
      
      // Worker 생성 및 언어 설정 (영어 + 한국어)
      const worker = await Tesseract.createWorker('eng+kor');
      
      // 이미지에서 텍스트 추출
      const { data: { text } } = await worker.recognize(imageDataUrl);
      
      // Worker 종료
      await worker.terminate();

      // 추출된 텍스트 설정
      setOcrText(text.trim() || '텍스트를 찾을 수 없습니다.');
    } catch (error) {
      console.error('OCR 처리 오류:', error);
      setOcrText(`텍스트 추출 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsProcessingOCR(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <Header />
        <div className="max-w-6xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-6">
            <div className="text-center">
              <div className="h-10 bg-gray-200 rounded-lg w-64 mx-auto mb-3"></div>
              <div className="h-4 bg-gray-200 rounded w-48 mx-auto"></div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 p-6 sm:p-8">
              <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="h-16 bg-gray-200 rounded-xl"></div>
                <div className="h-16 bg-gray-200 rounded-xl"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Header />
      <div className="flex h-[calc(100vh-64px)]">
        {/* 좌측 패널 */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800">메뉴</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <button
              onClick={() => setCurrentView('main')}
              className={`w-full px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-200 shadow-md hover:shadow-lg ${
                currentView === 'main'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📝 단어 입력
            </button>
            
            <button
              onClick={() => {
                setCurrentView('main');
                setIsWordSearchOpen(true);
              }}
              className="w-full px-4 py-3 rounded-lg text-white bg-gradient-to-r from-slate-500 to-gray-700 hover:from-slate-600 hover:to-gray-800 transition-all duration-200 shadow-md hover:shadow-lg font-semibold text-sm"
            >
              🔍 단어 검색
            </button>
            
            <button
              onClick={() => setIsFlashcardListOpen(true)}
              className="w-full px-4 py-3 rounded-lg text-white bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg font-semibold text-sm"
            >
              📚 단어장
            </button>
            
            <button
              onClick={() => setCurrentView('statistics')}
              className={`w-full px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-200 shadow-md hover:shadow-lg ${
                currentView === 'statistics'
                  ? 'bg-gradient-to-r from-green-500 to-teal-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📊 통계
            </button>
          </div>
        </div>

        {/* 우측 메인 페이지 */}
        <div className="flex-1 overflow-hidden">
          {currentView === 'main' ? (
            <PasteImageModal
              isOpen={true}
              onClose={() => {}}
              embedded={true}
              initialImage={tempImage}
              onImagePasted={(imageDataUrl) => {
                console.log('붙여넣은 이미지:', imageDataUrl.substring(0, 50) + '...');
                // OCR 처리 시작
                handleOCR(imageDataUrl);
                setTempImage(null);
              }}
            />
          ) : (
            <StatisticsView />
          )}
        </div>
      </div>
      
      <WordSearchModal
        isOpen={isWordSearchOpen}
        onClose={() => setIsWordSearchOpen(false)}
        user={user}
      />

      <FlashcardListModal
        isOpen={isFlashcardListOpen}
        onClose={() => setIsFlashcardListOpen(false)}
      />

      <OCRResultModal
        isOpen={isOCROpen}
        onClose={() => setIsOCROpen(false)}
        extractedText={ocrText}
        isProcessing={isProcessingOCR}
      />
    </div>
  );
}