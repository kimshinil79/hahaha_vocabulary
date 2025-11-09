'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface StoryInputModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StoryInputModal({ isOpen, onClose }: StoryInputModalProps) {
  const { user } = useAuth();
  const [topic, setTopic] = useState('');
  const [storyResult, setStoryResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wordList, setWordList] = useState<string[]>([]);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      loadWordList();
      setTopic('');
      setStoryResult('');
      setError(null);
      setShowErrorModal(false);
      setErrorModalMessage('');
    }
  }, [isOpen, user]);

  const loadWordList = async () => {
    if (!user) return;

    try {
      const email = user.email;
      const uid = user.uid;
      
      if (!email) return;

      const username = email.split('@')[0];
      const userDocId = `${username}${uid}`;
      const userDocRef = doc(db, 'users', userDocId);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const meanings = userData.meanings || {};
        const words = Object.keys(meanings);
        setWordList(words);
      } else {
        setWordList([]);
      }
    } catch (err) {
      console.error('단어 목록 로드 오류:', err);
      setWordList([]);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('주제를 입력해주세요.');
      return;
    }

    if (wordList.length === 0) {
      setError('단어 목록이 없습니다. 먼저 단어를 추가해주세요.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStoryResult('');

    try {
      // 단어 목록을 문자열로 변환
      const wordsString = wordList.join(', ');

      console.log(`사용할 단어 개수: ${wordList.length}개`);

      // AI 요청 메시지 생성
      const prompt = `이 단어들을 주로 사용해서 "${topic}" 주제로 10개 이내 문장으로 초등학교 수준의 영어로 된 글 작성해줘. 문장 번호는 붙이지 말자. 생성된 이야기 처음과 끝에 ''' 표시를 붙여줘. 그리고 목록에서 사용된 단어 앞뒤에 ** 표시 붙여줘. 단어 목록: ${wordsString}`;

      console.log('프롬프트 길이:', prompt.length, '자');

      // Endpoint 결정 (page.tsx와 동일한 로직)
      const phpProxy = '/hahahaEnglish/llm-proxy.php';
      const apiRoute = '/api/llm';
      const endpoint = process.env.NEXT_PUBLIC_LLM_ENDPOINT || 
        ((typeof window !== 'undefined' && window.location.pathname.startsWith('/hahahaEnglish'))
          ? phpProxy 
          : apiRoute);

      // AI 서버에 요청 (LLM 테스트와 동일한 형식 사용)
      const body = JSON.stringify({ message: prompt });
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
        
        // AbortController를 사용하여 타임아웃 설정 (60초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        try {
          const res = await fetch(fullUrl, { 
            method: 'POST', 
            headers, 
            body,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          const text = await res.text();
          return { res, text };
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('서버가 작동하지 않습니다. 관리자에게 문의하세요');
          }
          throw error;
        }
      };

      // LLM 테스트와 완전히 동일한 로직
      let { res, text } = await tryFetch(endpoint);
      console.log('First request result:', endpoint, res.status, 'Response length:', text.length);

      // Fallback: if using API route and it fails, try PHP proxy
      // OR if endpoint is already PHP but failed, it means server issue
      if (!res.ok && (res.status === 404 || res.status === 405 || res.status === 502)) {
        if (endpoint === apiRoute) {
          console.log('API route failed, trying PHP proxy:', phpProxy);
          try {
            const second = await tryFetch(phpProxy);
            res = second.res;
            text = second.text;
            console.log('PHP proxy result:', phpProxy, res.status, 'Response length:', text.length);
          } catch (e) {
            console.error('PHP proxy also failed:', e);
            // ignore, will be handled below
          }
        } else {
          console.error('PHP proxy request failed directly:', endpoint, res.status, text.substring(0, 200));
          // PHP proxy에서 JSON 에러 응답이 올 수 있음
          try {
            const errorData = JSON.parse(text);
            if (errorData.error && errorData.message) {
              throw new Error(`프록시 에러: ${errorData.message}`);
            }
          } catch (parseErr) {
            // JSON이 아니면 그대로 사용
          }
        }
      }

      if (!res.ok) {
        // 서버 오류 발생 시 간단한 메시지만 표시
        const errorMessage = '서버가 작동하지 않습니다. 관리자에게 문의하세요';
        setError(errorMessage);
        setErrorModalMessage(errorMessage);
        setShowErrorModal(true);
        setStoryResult('');
      } else {
        // 응답에서 ``` 마크다운 코드 블록 내용만 추출
        let cleanedText = text.trim();
        
        // ``` 로 시작하고 끝나는 코드 블록 추출
        const codeBlockMatch = cleanedText.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          cleanedText = codeBlockMatch[1].trim();
        }
        
        // 남아있는 ``` 표시 모두 제거
        cleanedText = cleanedText.replace(/'''/g, '');
        
        // 문장 번호 제거 (예: "1. ", "2. ", "1) ", "2) " 등)
        cleanedText = cleanedText.replace(/^\d+[\.\)]\s*/gm, '');
        
        // 여러 줄의 공백을 하나로 정리
        cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
        
        // 앞뒤 공백 제거
        cleanedText = cleanedText.trim();
        
        setStoryResult(cleanedText || '(빈 응답)');
      }
    } catch (err) {
      console.error('AI 생성 오류:', err);
      // 서버 오류 발생 시 간단한 메시지만 표시
      const errorMessage = '서버가 작동하지 않습니다. 관리자에게 문의하세요';
      setError(errorMessage);
      setErrorModalMessage(errorMessage);
      setShowErrorModal(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setTopic('');
    setStoryResult('');
    setError(null);
    setWordList([]);
    setShowErrorModal(false);
    setErrorModalMessage('');
    onClose();
  };

  const handleCloseErrorModal = () => {
    setShowErrorModal(false);
    setErrorModalMessage('');
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-extrabold bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              이야기 입력
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
          {/* 주제 입력 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              주제
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="예: 동물, 여행, 가족 등"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-black"
                disabled={isGenerating}
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !topic.trim()}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isGenerating ? '생성 중...' : 'AI 만들기'}
              </button>
            </div>
            {wordList.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                사용 가능한 단어: {wordList.length}개
              </p>
            )}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">
              {error}
            </div>
          )}

          {/* 결과 표시 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              생성된 이야기
            </label>
            <div className="w-full h-96 px-4 py-3 border border-gray-300 rounded-lg bg-white overflow-y-auto font-mono text-sm leading-relaxed">
              {storyResult ? (
                <div className="text-black whitespace-pre-wrap">
                  {storyResult.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
                    // ** 단어 ** 패턴 감지 (정규식으로 더 정확하게)
                    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
                    if (boldMatch) {
                      const word = boldMatch[1];
                      return (
                        <span key={index} className="font-bold text-blue-600">
                          {word}
                        </span>
                      );
                    }
                    return <span key={index}>{part}</span>;
                  })}
                </div>
              ) : (
                <div className="text-gray-400">
                  {isGenerating ? '이야기를 생성하고 있습니다...' : 'AI 만들기 버튼을 눌러 이야기를 생성해주세요.'}
                </div>
              )}
            </div>
            {storyResult && (
              <p className="text-xs text-gray-500 mt-2">
                생성 완료! 위 이야기를 복사하여 사용할 수 있습니다.
              </p>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
      
      {/* 에러 팝업 모달 */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-red-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-red-600 flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                서버 오류
              </h3>
              <button
                onClick={handleCloseErrorModal}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="mb-4">
              <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                {errorModalMessage}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCloseErrorModal}
                className="px-6 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

