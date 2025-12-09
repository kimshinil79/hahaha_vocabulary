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
import StudyPatternSelectionModal, { StudyPattern } from '@/components/StudyPatternSelectionModal';
import WordPracticeModal from '@/components/WordPracticeModal';
import StudyCompleteModal, { StudyContinuationOption } from '@/components/StudyCompleteModal';
import FlashcardGroupSelectionModal from '@/components/FlashcardGroupSelectionModal';
import SettingsModal from '@/components/SettingsModal';
import { isMobileDevice } from '@/utils/deviceDetection';
import { useStudySession } from '@/contexts/StudySessionContext';
import { initializeFCM, setupForegroundMessageHandler, subscribeToPendingRequests } from '@/utils/fcmService';

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
  const [isStudyPatternSelectionOpen, setIsStudyPatternSelectionOpen] = useState(false);
  const [isWordPracticeOpen, setIsWordPracticeOpen] = useState(false);
  const [isStudyCompleteModalOpen, setIsStudyCompleteModalOpen] = useState(false);
  const [isGroupSelectionModalOpen, setIsGroupSelectionModalOpen] = useState(false);
  const [selectedStudyPattern, setSelectedStudyPattern] = useState<StudyPattern | null>(null);
  const [continuationOption, setContinuationOption] = useState<StudyContinuationOption | 'groupSelection' | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [studiedWordsCount, setStudiedWordsCount] = useState(0);
  const [currentView, setCurrentView] = useState<ViewMode>('main');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const { setStudyPattern: setContextStudyPattern, setContinuationOption: setContextContinuationOption, setSelectedGroupId: setContextSelectedGroupId } = useStudySession();

  // 모바일 디바이스 감지 (클라이언트 사이드에서만 실행)
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  // FCM 초기화 및 전역 리스너 설정
  useEffect(() => {
    if (!user) return;

    const setupFCM = async () => {
      try {
        // FCM 초기화
        await initializeFCM();

        // 포그라운드 메시지 처리
        setupForegroundMessageHandler((payload) => {
          console.log('[전역] 포그라운드 메시지 수신:', payload);
          
          // 요청 수락 알림 (실시간 리스너가 자동으로 업데이트하므로 알림만 표시)
          if (payload.data?.type === 'request_accepted') {
            const nickname = payload.data.toUserNickname || '사용자';
            const requestType = payload.data.requestType || '요청';
            const typeLabel = requestType === 'friend' ? '친구' : requestType === 'student' ? '학생' : '자녀';
            alert(`${nickname}님이 ${typeLabel} 요청을 수락했습니다.`);
            // 프로필은 실시간 리스너가 자동으로 업데이트합니다
          }

          // 관계 요청 알림
          if (payload.data?.requestId) {
            // 설정 모달이 열려있으면 요청 표시
            window.dispatchEvent(new CustomEvent('relationshipRequest', {
              detail: {
                id: payload.data.requestId,
                fromUserNickname: payload.data.fromUserNickname,
                fromUserEmail: payload.data.fromUserEmail || '',
                requestType: payload.data.requestType,
              }
            }));
          }
        });

        // Service Worker 메시지 리스너 (백그라운드 알림 클릭)
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('[전역] Service Worker 메시지 수신:', event.data);
            
            if (event.data?.type === 'NOTIFICATION_CLICK') {
              const data = event.data.data;
              
              // 요청 수락 알림 (실시간 리스너가 자동으로 업데이트)
              if (data?.type === 'request_accepted') {
                const nickname = data.toUserNickname || '사용자';
                const requestType = data.requestType || '요청';
                const typeLabel = requestType === 'friend' ? '친구' : requestType === 'student' ? '학생' : '자녀';
                alert(`${nickname}님이 ${typeLabel} 요청을 수락했습니다.`);
                // 프로필은 실시간 리스너가 자동으로 업데이트합니다
              }

              // 관계 요청 알림
              if (data?.requestId) {
                window.dispatchEvent(new CustomEvent('relationshipRequest', {
                  detail: {
                    id: data.requestId,
                    fromUserNickname: data.fromUserNickname,
                    fromUserEmail: data.fromUserEmail || '',
                    requestType: data.requestType,
                  }
                }));
              }
            }
          });
        }

        // 대기 중인 요청 구독 (실시간 업데이트)
        const unsubscribe = subscribeToPendingRequests((requests) => {
          if (requests.length > 0) {
            const latestRequest = requests[0];
            window.dispatchEvent(new CustomEvent('relationshipRequest', {
              detail: {
                id: latestRequest.id,
                fromUserNickname: latestRequest.fromUserNickname,
                fromUserEmail: latestRequest.fromUserEmail || '',
                requestType: latestRequest.requestType,
              }
            }));
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('[전역] FCM 초기화 실패:', error);
        return () => {};
      }
    };

    let unsubscribeFn: (() => void) | null = null;
    setupFCM().then((unsubscribe) => {
      unsubscribeFn = unsubscribe;
    });

    return () => {
      if (unsubscribeFn) unsubscribeFn();
    };
  }, [user]);

  // 설정 모달 열기 이벤트 리스너
  useEffect(() => {
    const handleOpenSettings = () => {
      setIsSettingsModalOpen(true);
    };

    window.addEventListener('openSettings', handleOpenSettings);
    return () => {
      window.removeEventListener('openSettings', handleOpenSettings);
    };
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
              className={`w-full px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                currentView === 'main'
                  ? 'bg-gradient-to-r from-sky-200 to-blue-200 text-slate-700 shadow-sm border border-sky-300/50'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              단어 입력
            </button>
            
            <button
              onClick={() => {
                setCurrentView('main');
                setIsWordSearchOpen(true);
              }}
              className="w-full px-4 py-3 rounded-lg font-medium text-sm bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all duration-200"
            >
              단어 검색
            </button>
            
            <button
              onClick={() => setIsFlashcardListOpen(true)}
              className="w-full px-4 py-3 rounded-lg font-medium text-sm bg-gradient-to-r from-pink-100 to-rose-100 text-rose-700 hover:from-pink-200 hover:to-rose-200 border border-pink-200 transition-all duration-200"
            >
              단어장
            </button>
            
            <button
              onClick={() => setIsStudyPatternSelectionOpen(true)}
              className="w-full px-4 py-3 rounded-lg font-medium text-sm bg-gradient-to-r from-violet-100 to-purple-100 text-purple-700 hover:from-violet-200 hover:to-purple-200 border border-violet-200 transition-all duration-200"
            >
              공부 시작
            </button>
            
            <button
              onClick={() => setCurrentView('statistics')}
              className={`w-full px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                currentView === 'statistics'
                  ? 'bg-gradient-to-r from-emerald-200 to-teal-200 text-slate-700 shadow-sm border border-emerald-300/50'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              통계
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

      <StudyPatternSelectionModal
        isOpen={isStudyPatternSelectionOpen}
        onClose={() => setIsStudyPatternSelectionOpen(false)}
        onSelect={(pattern) => {
          setSelectedStudyPattern(pattern);
          setIsStudyPatternSelectionOpen(false);
          setIsWordPracticeOpen(true);
        }}
      />

      <WordPracticeModal
        isOpen={isWordPracticeOpen}
        onClose={() => {
          setIsWordPracticeOpen(false);
          setSelectedStudyPattern(null);
          setContinuationOption(null);
          setSelectedGroupId(null);
        }}
        studyPattern={selectedStudyPattern}
        continuationOption={continuationOption}
        selectedGroupId={selectedGroupId}
        onStudyComplete={(count) => {
          // 공부 완료 시 WordPracticeModal 닫고 StudyCompleteModal 열기
          setIsWordPracticeOpen(false);
          setStudiedWordsCount(count);
          setTimeout(() => {
            setIsStudyCompleteModalOpen(true);
          }, 100);
        }}
      />

      <StudyCompleteModal
        isOpen={isStudyCompleteModalOpen}
        onClose={() => {
          setIsStudyCompleteModalOpen(false);
        }}
        studiedWordsCount={studiedWordsCount}
        onSelect={async (option) => {
          setIsStudyCompleteModalOpen(false);
          
          if (option === StudyContinuationOption.goHome) {
            // 홈으로 가기
            setSelectedStudyPattern(null);
            setContinuationOption(null);
            setSelectedGroupId(null);
            return;
          }
          
          if (option === 'groupSelection') {
            // 그룹 선택 모달 열기
            setContinuationOption(option);
            setIsGroupSelectionModalOpen(true);
            return; // 그룹 선택 모달이 닫힐 때까지 WordPracticeModal을 열지 않음
          } else {
            setContinuationOption(option);
            setSelectedGroupId(null);
            
            // 새로운 단어 세트 로드 후 WordPracticeModal 열기
            // 단어 로드는 WordPracticeModal 내부에서 처리하도록 함
            setTimeout(() => {
              setIsWordPracticeOpen(true);
            }, 100);
          }
        }}
      />

      <FlashcardGroupSelectionModal
        isOpen={isGroupSelectionModalOpen}
        onClose={() => {
          setIsGroupSelectionModalOpen(false);
        }}
        onSelect={(groupId, groupName) => {
          setIsGroupSelectionModalOpen(false);
          setSelectedGroupId(groupId);
          
          // 그룹 선택 후 WordPracticeModal 열기
          setTimeout(() => {
            setIsWordPracticeOpen(true);
          }, 100);
        }}
        user={user}
      />

      <OCRResultModal
        isOpen={isOCROpen}
        onClose={() => setIsOCROpen(false)}
        extractedText={ocrText}
        isProcessing={isProcessingOCR}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </div>
  );
}