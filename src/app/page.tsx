'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/Header';
import LoginForm from '@/components/LoginForm';
import WordDataInputModal from '@/components/WordDataInputModal';
import DirectWordInputModal from '@/components/DirectWordInputModal';
import LLMResponseModal from '@/components/LLMResponseModal';
import WordStudyModal from '@/components/WordStudyModal';
import WordPracticeModal from '@/components/WordPracticeModal';
import StoryListModal from '@/components/StoryListModal';
import StoryInputModal from '@/components/StoryInputModal';
import CameraModal from '@/components/CameraModal';
import PasteImageModal from '@/components/PasteImageModal';
import OCRResultModal from '@/components/OCRResultModal';
import { isMobileDevice } from '@/utils/deviceDetection';

export default function Home() {
  const { user, loading } = useAuth();
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [llmMsg, setLlmMsg] = useState('');
  const [isWordStudyOpen, setIsWordStudyOpen] = useState(false);
  const [isWordPracticeOpen, setIsWordPracticeOpen] = useState(false);
  const [isStoryInputOpen, setIsStoryInputOpen] = useState(false);
  const [isStoryListOpen, setIsStoryListOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isOCROpen, setIsOCROpen] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isPasteImageOpen, setIsPasteImageOpen] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null); // 임시 저장된 이미지

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

  // For static exports (dothome), use PHP proxy directly
  // For Next.js dev server, use API route
  const phpProxy = '/hahahaEnglish/llm-proxy.php';
  const apiRoute = '/api/llm';
  const endpoint = process.env.NEXT_PUBLIC_LLM_ENDPOINT || 
    ((typeof window !== 'undefined' && window.location.pathname.startsWith('/hahahaEnglish'))
      ? phpProxy 
      : apiRoute);

  const handleCopyTemplate = async () => {
    const template = `지금까지 공부한 내용에 나왔던 단어를 아래 형식으로 정리해줘. 대명사, 관사, be동사, do/does/did, 전치사는 필요없어. 뜻은 오늘 공부한 내용에 나왔던 뜻을 적어줘. 예문(해석)도 새롭게 너가 작성해줘

{
  "meanings": {
    "big": {
      "meanings": [
        {
          "definition": "큰",
          "examples": ["The umbrella is big."],
          "frequency": 1,
          "updatedAt": "2025-10-24T15:00:00Z"
        }
      ],
      "updatedAt": "2025-10-24T15:00:00Z"
    },
    "blue": {
      "meanings": [
        {
          "definition": "파란",
          "examples": ["The umbrella is blue."],
          "frequency": 1,
          "updatedAt": "2025-10-24T15:00:00Z"
        }
      ],
      "updatedAt": "2025-10-24T15:00:00Z"
    }
  }
}`;

    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      setCopied(false);
    }
  };

  const sendHelloToLLM = async () => {
    setLlmMsg('요청 중...');
    setLlmOpen(true);

    const body = JSON.stringify({ message: '안녕' });
    const headers = { 'Content-Type': 'application/json' } as const;

    // Build absolute URL if needed
    const buildUrl = (path: string) => {
      if (path.startsWith('http')) return path;
      if (typeof window !== 'undefined') {
        return window.location.origin + path;
      }
      return path;
    };

    const tryFetch = async (url: string) => {
      const fullUrl = buildUrl(url);
      console.log('Requesting:', fullUrl, 'Method: POST');
      const res = await fetch(fullUrl, { method: 'POST', headers, body });
      const text = await res.text();
      return { res, text };
    };

    try {
      let { res, text } = await tryFetch(endpoint);
      console.log('First request result:', endpoint, res.status);

      // Fallback: if using API route and it fails, try PHP proxy
      // OR if endpoint is already PHP but failed, it means server issue
      if (!res.ok && (res.status === 404 || res.status === 405)) {
        if (endpoint === apiRoute) {
          console.log('API route failed, trying PHP proxy:', phpProxy);
          try {
            const second = await tryFetch(phpProxy);
            res = second.res; text = second.text;
            console.log('PHP proxy result:', phpProxy, res.status);
          } catch (e) {
            console.error('PHP proxy also failed:', e);
            // ignore, will be handled below
          }
        } else {
          console.error('PHP proxy request failed directly:', endpoint, res.status, text.substring(0, 200));
        }
      }

      if (!res.ok) {
        setLlmMsg(`요청 실패 (HTTP ${res.status}):\n${text}`);
      } else {
        setLlmMsg(text || '(빈 응답)');
      }
    } catch (e) {
      const errMsg = (e as Error).message;
      setLlmMsg(`연결 실패:\n${errMsg}\n\n참고: 로컬 개발 서버(npm run dev)에서는 /api/llm, 정적 배포(dothome)에서는 /hahahaEnglish/llm-proxy.php를 사용합니다.`);
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
      <div className="max-w-6xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        {/* 메인 타이틀 */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent mb-3">
            영어 학습 관리
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            단어와 이야기를 체계적으로 학습하세요
          </p>
        </div>

        <div className="space-y-6">
          {/* 단어 데이터 입력 섹션 */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 p-6 sm:p-8">
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <span className="text-2xl">📝</span>
                단어 데이터 입력
              </h3>
              <p className="text-sm text-gray-600">단어 데이터를 추가하거나 형식을 확인하세요</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setIsJsonModalOpen(true)}
                className="group flex-1 min-w-[140px] px-5 py-3 rounded-xl text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-sm sm:text-base"
              >
                JSON 입력
              </button>
              <button
                onClick={() => setIsDirectModalOpen(true)}
                className="group flex-1 min-w-[140px] px-5 py-3 rounded-xl text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-sm sm:text-base"
              >
                직접 입력
              </button>
              <button
                onClick={handleCopyTemplate}
                className="group flex-1 min-w-[160px] px-5 py-3 rounded-xl text-white bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-sm sm:text-base"
              >
                {copied ? '✓ 복사됨!' : '📋 데이터 형식'}
              </button>
              <button
                onClick={() => setIsCameraOpen(true)}
                className="group flex-1 min-w-[140px] px-5 py-3 rounded-xl text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-sm sm:text-base"
              >
                📷 사진 찍기
              </button>
              <button
                onClick={() => setIsPasteImageOpen(true)}
                className="group flex-1 min-w-[140px] px-5 py-3 rounded-xl text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-sm sm:text-base"
              >
                📋 이미지 붙이기
              </button>
            </div>
          </div>

          {/* 단어 학습 섹션 */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 p-6 sm:p-8">
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <span className="text-2xl">📚</span>
                단어 학습
              </h3>
              <p className="text-sm text-gray-600">단어를 공부하고 전체 목록을 확인하세요</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setIsWordPracticeOpen(true)}
                className="group px-6 py-4 rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-base"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xl">🎯</span>
                  단어 공부하기
                </span>
              </button>
              <button
                onClick={() => setIsWordStudyOpen(true)}
                className="group px-6 py-4 rounded-xl text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-base"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xl">📖</span>
                  단어 전체 보기
                </span>
              </button>
            </div>
          </div>

          {/* 이야기 섹션 */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 p-6 sm:p-8">
            <div className="mb-6">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <span className="text-2xl">📖</span>
                이야기 학습
              </h3>
              <p className="text-sm text-gray-600">AI로 이야기를 생성하거나 저장된 이야기를 학습하세요</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setIsStoryInputOpen(true)}
                className="group px-6 py-4 rounded-xl text-white bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-base"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xl">✨</span>
                  이야기 입력
                </span>
              </button>
              <button
                onClick={() => setIsStoryListOpen(true)}
                className="group px-6 py-4 rounded-xl text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-base"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xl">📚</span>
                  이야기 목록
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <WordDataInputModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
      />
      
      <DirectWordInputModal
        isOpen={isDirectModalOpen}
        onClose={() => setIsDirectModalOpen(false)}
      />

      <LLMResponseModal isOpen={llmOpen} onClose={() => setLlmOpen(false)} message={llmMsg} />
      
      <WordPracticeModal isOpen={isWordPracticeOpen} onClose={() => setIsWordPracticeOpen(false)} />
      
      <WordStudyModal isOpen={isWordStudyOpen} onClose={() => setIsWordStudyOpen(false)} />
      
      <StoryListModal isOpen={isStoryListOpen} onClose={() => setIsStoryListOpen(false)} />
      
      <StoryInputModal isOpen={isStoryInputOpen} onClose={() => setIsStoryInputOpen(false)} />
      
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(imageDataUrl) => {
          console.log('크롭된 이미지:', imageDataUrl.substring(0, 50) + '...');
          // 임시 이미지로 저장
          setTempImage(imageDataUrl);
          // 사진 찍기 모달 닫기
          setIsCameraOpen(false);
          // 이미지 붙이기 모달 자동으로 열기
          setIsPasteImageOpen(true);
        }}
      />
      
      <PasteImageModal
        isOpen={isPasteImageOpen}
        onClose={() => {
          setIsPasteImageOpen(false);
          setTempImage(null); // 모달 닫을 때 임시 이미지 초기화
        }}
        initialImage={tempImage}
        onImagePasted={(imageDataUrl) => {
          console.log('붙여넣은 이미지:', imageDataUrl.substring(0, 50) + '...');
          // OCR 처리 시작
          handleOCR(imageDataUrl);
          setTempImage(null); // 사용 후 임시 이미지 초기화
        }}
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