'use client';

import { useState, useEffect, FormEvent } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/Header';
import LoginForm from '@/components/LoginForm';
import CameraModal from '@/components/CameraModal';
import PasteImageModal from '@/components/PasteImageModal';
import OCRResultModal from '@/components/OCRResultModal';
import StatisticsView from '@/components/StatisticsView';
import { isMobileDevice } from '@/utils/deviceDetection';

type ViewMode = 'main' | 'statistics';

export default function Home() {
  const { user, loading } = useAuth();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isOCROpen, setIsOCROpen] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isPasteImageOpen, setIsPasteImageOpen] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null); // 임시 저장된 이미지
  const [isWordSearchOpen, setIsWordSearchOpen] = useState(false);
  const [wordSearchTerm, setWordSearchTerm] = useState('');
  const [wordSearchResult, setWordSearchResult] = useState<any | null>(null);
  const [isWordSearchLoading, setIsWordSearchLoading] = useState(false);
  const [wordSearchError, setWordSearchError] = useState<string | null>(null);
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

  const closeWordSearchModal = () => {
    setIsWordSearchOpen(false);
    setWordSearchTerm('');
    setWordSearchResult(null);
    setWordSearchError(null);
    setIsWordSearchLoading(false);
  };

  const handleWordSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTerm = wordSearchTerm.trim();
    if (!trimmedTerm) {
      setWordSearchError('단어를 입력하세요.');
      setWordSearchResult(null);
      return;
    }

    setIsWordSearchLoading(true);
    setWordSearchError(null);
    setWordSearchResult(null);

    try {
      const targetWord = trimmedTerm.toLowerCase();
      const wordDocRef = doc(db, 'words', targetWord);
      const wordDocSnap = await getDoc(wordDocRef);

      if (wordDocSnap.exists()) {
        const data = wordDocSnap.data();
        setWordSearchResult({ word: targetWord, ...data });
      } else {
        setWordSearchError('해당 단어를 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('단어 검색 오류:', error);
      setWordSearchError(error instanceof Error ? error.message : '단어 검색 중 오류가 발생했습니다.');
    } finally {
      setIsWordSearchLoading(false);
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
                setWordSearchTerm('');
                setWordSearchResult(null);
                setWordSearchError(null);
                setIsWordSearchLoading(false);
              }}
              className="w-full px-4 py-3 rounded-lg text-white bg-gradient-to-r from-slate-500 to-gray-700 hover:from-slate-600 hover:to-gray-800 transition-all duration-200 shadow-md hover:shadow-lg font-semibold text-sm"
            >
              🔍 단어 검색
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
      
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(imageDataUrl) => {
          console.log('크롭된 이미지:', imageDataUrl.substring(0, 50) + '...');
          // 임시 이미지로 저장
          setTempImage(imageDataUrl);
          // 사진 찍기 모달 닫기
          setIsCameraOpen(false);
        }}
      />
      
      {isWordSearchOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeWordSearchModal();
            }
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-extrabold bg-gradient-to-r from-slate-600 to-gray-800 bg-clip-text text-transparent">
                단어 검색
              </h3>
              <button
                onClick={closeWordSearchModal}
                className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-6 border-b border-gray-100">
              <form onSubmit={handleWordSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={wordSearchTerm}
                  onChange={(e) => setWordSearchTerm(e.target.value)}
                  placeholder="검색할 단어를 입력하세요"
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm sm:text-base"
                />
                <button
                  type="submit"
                  disabled={isWordSearchLoading}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-slate-600 to-gray-800 text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  {isWordSearchLoading ? '검색 중...' : '검색'}
                </button>
              </form>
              {wordSearchError && (
                <p className="mt-2 text-sm text-red-500">{wordSearchError}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-white">
              {isWordSearchLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-600">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-slate-500"></div>
                  <p className="text-sm font-semibold">단어 정보를 가져오는 중...</p>
                </div>
              ) : wordSearchResult ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
                      {wordSearchResult.word || wordSearchTerm.trim().toLowerCase()}
                    </h4>
                    {wordSearchResult.pronunciation && (
                      <p className="text-sm text-gray-500 mt-1 italic">
                        {wordSearchResult.pronunciation}
                      </p>
                    )}
                    {Array.isArray(wordSearchResult.pos) && wordSearchResult.pos.length > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        품사: {wordSearchResult.pos.join(', ')}
                      </p>
                    )}
                  </div>
                  {Array.isArray(wordSearchResult.meanings) && wordSearchResult.meanings.length > 0 ? (
                    <div className="space-y-4">
                      {wordSearchResult.meanings.map((meaning: any, idx: number) => {
                        // definition 처리: List 또는 String 모두 지원
                        const renderDefinition = () => {
                          if (!meaning.definition) return '(정의 없음)';
                          if (Array.isArray(meaning.definition)) {
                            return meaning.definition.map((def: any, defIdx: number) => {
                              const defText = typeof def === 'object' && def?.text ? def.text : String(def);
                              return (
                                <div key={defIdx} className={defIdx > 0 ? 'mt-2' : ''}>
                                  {defText}
                                </div>
                              );
                            });
                          }
                          const defText = typeof meaning.definition === 'object' && meaning.definition?.text 
                            ? meaning.definition.text 
                            : String(meaning.definition);
                          return defText;
                        };

                        // examples 처리: List 또는 String 모두 지원, bold 처리 지원
                        const renderExample = (example: any) => {
                          const exampleText = typeof example === 'object' && example?.text 
                            ? example.text 
                            : String(example);
                          
                          // **text** 형식의 bold 처리
                          const parts = exampleText.split(/(\*\*.*?\*\*)/g);
                          return (
                            <p className="text-sm text-gray-700 italic">
                              {parts.map((part: string, partIdx: number) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  const boldText = part.slice(2, -2);
                                  return (
                                    <strong key={partIdx} className="font-semibold text-slate-700">
                                      {boldText}
                                    </strong>
                                  );
                                }
                                return <span key={partIdx}>{part}</span>;
                              })}
                            </p>
                          );
                        };

                        return (
                          <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-slate-50 shadow-sm">
                            <div className="text-gray-800 font-semibold text-base sm:text-lg">
                              {renderDefinition()}
                            </div>
                            {meaning.examples && (
                              <div className="mt-3 space-y-2">
                                <p className="text-xs font-semibold text-gray-500">예문</p>
                                {Array.isArray(meaning.examples) ? (
                                  meaning.examples.map((example: any, exIdx: number) => (
                                    <div key={exIdx}>
                                      {renderExample(example)}
                                    </div>
                                  ))
                                ) : (
                                  renderExample(meaning.examples)
                                )}
                              </div>
                            )}
                            {meaning.frequency !== undefined && (
                              <p className="mt-3 text-xs text-gray-400">
                                빈도: {meaning.frequency}
                              </p>
                            )}
                            {meaning.updatedAt && (
                              <p className="text-xs text-gray-400">
                                업데이트: {new Date(meaning.updatedAt).toLocaleString('ko-KR')}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">의미 정보를 찾을 수 없습니다.</p>
                  )}
                </div>
              ) : (
                <div className="text-center text-sm text-gray-500 py-10">
                  검색할 단어를 입력하고 결과를 확인해 보세요.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <OCRResultModal
        isOpen={isOCROpen}
        onClose={() => setIsOCROpen(false)}
        extractedText={ocrText}
        isProcessing={isProcessingOCR}
      />
    </div>
  );
}