'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface WordMeaning {
  definition: string;
  examples: string[];
  frequency: number;
  updatedAt: string;
}

interface WordData {
  meanings: WordMeaning[];
  updatedAt: string;
}

interface MeaningsData {
  [word: string]: WordData;
}

interface StudyWord {
  word: string;
  example: string;
  frequency: number;
  starCount: number;
  showDefinition: boolean; // 뜻 표시 여부
  wordData: WordData; // frequency 업데이트를 위해 저장
}

interface WordPracticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WordPracticeModal({ isOpen, onClose }: WordPracticeModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studyWords, setStudyWords] = useState<StudyWord[]>([]);
  const [originalWords, setOriginalWords] = useState<string[]>([]); // 원래 선택된 30개 단어 저장
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // 버튼 중복 클릭 방지

  useEffect(() => {
    if (isOpen && user) {
      loadAndPrepareWords();
    }
  }, [isOpen, user]);

  // 단어가 변경될 때 뜻 표시 초기화
  useEffect(() => {
    if (studyWords.length > 0 && currentIndex >= 0 && currentIndex < studyWords.length) {
      setStudyWords(prevWords => {
        const current = prevWords[currentIndex];
        // 현재 카드의 뜻 표시가 true면 false로 초기화
        if (current && current.showDefinition) {
          const newStudyWords = [...prevWords];
          newStudyWords[currentIndex] = {
            ...newStudyWords[currentIndex],
            showDefinition: false
          };
          return newStudyWords;
        }
        return prevWords;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]); // currentIndex가 변경될 때만 실행

  const loadAndPrepareWords = async () => {
    if (!user) {
      setError('로그인이 필요합니다');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const email = user.email;
      const uid = user.uid;
      
      if (!email) {
        throw new Error('이메일 정보를 찾을 수 없습니다.');
      }

      const username = email.split('@')[0];
      const userDocId = `${username}${uid}`;

      const userDocRef = doc(db, 'users', userDocId);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        setStudyWords([]);
        setLoading(false);
        return;
      }

      const userData = userDocSnap.data();
      const meanings: MeaningsData = userData.meanings || {};

      // 각 단어의 총 frequency 계산 및 예문 추출
      const wordsWithFrequency: Array<{ word: string; frequency: number; wordData: WordData }> = [];
      
      Object.entries(meanings).forEach(([word, wordData]) => {
        const totalFrequency = wordData.meanings?.reduce((sum, meaning) => sum + (meaning.frequency || 0), 0) || 0;
        wordsWithFrequency.push({ word, frequency: totalFrequency, wordData });
      });

      // frequency 낮은 순으로 정렬, 같으면 알파벳 순
      wordsWithFrequency.sort((a, b) => {
        if (a.frequency !== b.frequency) {
          return a.frequency - b.frequency;
        }
        return a.word.localeCompare(b.word, 'en', { sensitivity: 'base' });
      });

      // frequency별로 그룹화
      const frequencyGroups: { [freq: number]: Array<{ word: string; frequency: number; wordData: WordData }> } = {};
      wordsWithFrequency.forEach(item => {
        if (!frequencyGroups[item.frequency]) {
          frequencyGroups[item.frequency] = [];
        }
        frequencyGroups[item.frequency].push(item);
      });

      // 각 frequency 그룹 내에서 랜덤 셔플, 상위 2개 선택
      const selectedWords: StudyWord[] = [];
      const frequencies = Object.keys(frequencyGroups).map(Number).sort((a, b) => a - b);

      for (const freq of frequencies) {
        if (selectedWords.length >= 2) break;
        
        const group = frequencyGroups[freq];
        // 그룹 내에서 랜덤 셔플
        const shuffled = [...group].sort(() => Math.random() - 0.5);
        
        for (const item of shuffled) {
          if (selectedWords.length >= 2) break;
          
          // 첫 번째 의미의 첫 번째 예문 사용, 없으면 빈 문자열
          const firstExample = item.wordData.meanings?.[0]?.examples?.[0] || '';
          selectedWords.push({
            word: item.word,
            example: firstExample,
            frequency: item.frequency,
            starCount: 0,
            showDefinition: false,
            wordData: item.wordData
          });
        }
      }

      setStudyWords(selectedWords);
      setOriginalWords(selectedWords.map(w => w.word)); // 원래 단어 목록 저장
      setCurrentIndex(0);
      setIsCompleted(false);
    } catch (err) {
      console.error('단어 데이터 로드 오류:', err);
      setError(err instanceof Error ? err.message : '단어 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStudyWords([]);
    setOriginalWords([]);
    setCurrentIndex(0);
    setError(null);
    setIsCompleted(false);
    setIsUpdating(false);
    setIsProcessing(false);
    onClose();
  };

  const handleStudyMore = async () => {
    // 상태 초기화하고 새로운 단어 추출
    setIsCompleted(false);
    setIsUpdating(false);
    setIsProcessing(false);
    setCurrentIndex(0);
    setError(null);
    await loadAndPrepareWords();
  };

  const handlePrevious = () => {
    if (studyWords.length === 0) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : studyWords.length - 1));
  };

  const handleNext = () => {
    if (studyWords.length === 0) return;
    setCurrentIndex((prev) => (prev < studyWords.length - 1 ? prev + 1 : 0));
  };

  const handleCardClick = () => {
    if (studyWords.length === 0 || !currentWord) return;
    
    const newStudyWords = [...studyWords];
    newStudyWords[currentIndex] = {
      ...newStudyWords[currentIndex],
      showDefinition: !newStudyWords[currentIndex].showDefinition
    };
    setStudyWords(newStudyWords);
  };

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
    if (!currentWord || typeof window === 'undefined') return;
    
    // Web Speech API 사용
    if ('speechSynthesis' in window) {
      // 이전 음성이 있다면 취소
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(currentWord.word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9; // 속도 조절 (0.1 ~ 10)
      utterance.pitch = 1; // 높이 조절 (0 ~ 2)
      utterance.volume = 1; // 볼륨 (0 ~ 1)
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSpeakExample = (e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
    if (!currentWord?.example || typeof window === 'undefined') return;
    
    // 예문에서 영어 부분만 추출 (한국어 해석 제거)
    let englishExample = currentWord.example;
    const match = englishExample.match(/^(.+?)\(([^)]+)\)$/);
    if (match) {
      englishExample = match[1].trim();
    }
    
    // Web Speech API 사용
    if ('speechSynthesis' in window) {
      // 이전 음성이 있다면 취소
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(englishExample);
      utterance.lang = 'en-US';
      utterance.rate = 0.85; // 예문은 조금 느리게
      utterance.pitch = 1;
      utterance.volume = 1;
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleGoodJob = () => {
    if (studyWords.length === 0 || !currentWord || isProcessing) return;
    
    setIsProcessing(true); // 처리 중 플래그 설정
    
    const newStudyWords = [...studyWords];
    const wordIndex = currentIndex;
    const updatedStarCount = newStudyWords[wordIndex].starCount + 1;
    
    // 별 추가
    newStudyWords[wordIndex] = {
      ...newStudyWords[wordIndex],
      starCount: updatedStarCount
    };

    // 상태 업데이트 (별이 표시되도록)
    setStudyWords(newStudyWords);

    // 딜레이 후 다음 카드로 이동 (별을 볼 수 있도록)
    setTimeout(() => {
      if (updatedStarCount >= 2) {
        // 별이 2개면 카드 삭제
        const updatedWords = [...newStudyWords];
        updatedWords.splice(wordIndex, 1);
        
        // 인덱스 조정
        let newIndex = wordIndex;
        if (newIndex >= updatedWords.length && updatedWords.length > 0) {
          newIndex = updatedWords.length - 1;
        } else if (updatedWords.length === 0) {
          newIndex = 0;
        }
        
        setStudyWords(updatedWords);
        setCurrentIndex(newIndex);

        // 모든 카드가 삭제되면 완료 처리
        if (updatedWords.length === 0) {
          handleComplete();
          setIsProcessing(false);
        } else {
          setIsProcessing(false); // 처리 완료
        }
      } else {
        // 별이 1개면 다음 카드로 이동 (카드는 유지)
        if (wordIndex < newStudyWords.length - 1) {
          setCurrentIndex(wordIndex + 1);
        } else {
          setCurrentIndex(0);
        }
        setIsProcessing(false); // 처리 완료
      }
    }, 500); // 0.5초 후 이동
  };

  const handleComplete = async () => {
    if (!user || originalWords.length === 0) return;

    setIsCompleted(true);
    setIsUpdating(true);

    try {
      const email = user.email;
      const uid = user.uid;
      
      if (!email) {
        throw new Error('이메일 정보를 찾을 수 없습니다.');
      }

      const username = email.split('@')[0];
      const userDocId = `${username}${uid}`;

      // Firebase에서 현재 meanings 데이터 가져오기
      const userDocRef = doc(db, 'users', userDocId);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        throw new Error('사용자 데이터를 찾을 수 없습니다.');
      }

      const userData = userDocSnap.data();
      const meanings: MeaningsData = userData.meanings || {};
      const updatedMeanings = { ...meanings };

      // 원래 30개 단어의 frequency를 1씩 증가
      for (const word of originalWords) {
        if (updatedMeanings[word]) {
          const wordData = updatedMeanings[word];
          const updatedMeaningsArray = wordData.meanings?.map(meaning => ({
            ...meaning,
            frequency: (meaning.frequency || 0) + 1
          })) || [];

          updatedMeanings[word] = {
            ...wordData,
            meanings: updatedMeaningsArray,
            updatedAt: new Date().toISOString()
          };
        }
      }

      // Firebase에 업데이트
      await setDoc(userDocRef, {
        meanings: updatedMeanings,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setIsUpdating(false);
    } catch (err) {
      console.error('Frequency 업데이트 오류:', err);
      setError(err instanceof Error ? err.message : 'Frequency 업데이트 중 오류가 발생했습니다.');
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  const currentWord = studyWords[currentIndex];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-2xl flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              단어 공부하기
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {loading ? '단어를 불러오는 중...' : isCompleted 
              ? '공부 완료!' 
              : studyWords.length > 0 
                ? `${currentIndex + 1} / ${studyWords.length}` 
                : '저장된 단어가 없습니다.'}
          </p>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 flex items-center justify-center p-6 bg-white min-h-[400px]">
          {loading && (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">{error}</div>
          )}

          {!loading && !error && !isCompleted && studyWords.length === 0 && (
            <div className="text-center">
              <p className="text-gray-500 text-lg mb-2">저장된 단어가 없습니다.</p>
              <p className="text-gray-400 text-sm">JSON 입력 또는 직접 입력으로 단어를 추가해보세요!</p>
            </div>
          )}

          {!loading && !error && !isCompleted && currentWord && (
            <div className="w-full max-w-lg">
              {/* 단어 카드 */}
              <div 
                onClick={handleCardClick}
                className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-8 shadow-lg border-2 border-cyan-200 relative cursor-pointer hover:shadow-xl transition-shadow"
              >
                {/* 별 표시 (좌측 위) */}
                {currentWord.starCount > 0 && (
                  <div className="absolute top-4 left-4 flex gap-1">
                    {[...Array(currentWord.starCount)].map((_, i) => (
                      <span key={i} className="text-2xl text-yellow-400">⭐</span>
                    ))}
                  </div>
                )}

                {/* 스피커 아이콘 (우측 위) */}
                <button
                  onClick={handleSpeak}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/80 hover:bg-white shadow-md hover:shadow-lg transition-all active:scale-95"
                  aria-label="발음 듣기"
                  title="발음 듣기"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-6 w-6 text-cyan-600" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
                    />
                  </svg>
                </button>

                {/* 단어 */}
                <div className="text-center mb-6">
                  <h3 className="text-4xl font-extrabold text-gray-900 mb-2">
                    {currentWord.word}
                    {currentWord.showDefinition && currentWord.wordData.meanings?.[0]?.definition && (
                      <span className="text-2xl text-gray-600 font-normal ml-2">
                        ({currentWord.wordData.meanings[0].definition})
                      </span>
                    )}
                  </h3>
                </div>

                {/* 예문 */}
                {currentWord.example && (
                  <div className="bg-white rounded-xl p-6 border border-cyan-200 relative">
                    <div className="text-sm text-gray-500 mb-2 font-semibold">예문:</div>
                    <div className="text-lg text-gray-700 italic pr-10">
                      {(() => {
                        // 예문에서 영어 부분과 한국어 해석 부분 분리
                        const exampleText = currentWord.example;
                        const match = exampleText.match(/^(.+?)\(([^)]+)\)$/);
                        
                        if (match) {
                          const englishPart = match[1].trim();
                          const koreanPart = match[2].trim();
                          
                          // showDefinition이 true면 해석도 보여주기, false면 영어만
                          if (currentWord.showDefinition) {
                            return `"${englishPart} (${koreanPart})"`;
                          } else {
                            return `"${englishPart}"`;
                          }
                        } else {
                          // 해석이 없는 경우 그대로 표시
                          return `"${exampleText}"`;
                        }
                      })()}
                    </div>
                    {/* 예문 스피커 아이콘 */}
                    <button
                      onClick={handleSpeakExample}
                      className="absolute bottom-4 right-4 p-2 rounded-full bg-cyan-50/80 hover:bg-cyan-100 shadow-md hover:shadow-lg transition-all active:scale-95"
                      aria-label="예문 발음 듣기"
                      title="예문 발음 듣기"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-5 w-5 text-cyan-600" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* 네비게이션 버튼 */}
              <div className="flex justify-center items-center mt-8 gap-3 sm:gap-4 md:gap-6">
                <button
                  onClick={handlePrevious}
                  disabled={studyWords.length === 0}
                  className="px-3 py-2 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-full bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600 text-white text-xs sm:text-sm md:text-base font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <span className="text-sm sm:text-base md:text-lg">←</span>
                  <span className="hidden sm:inline">이전</span>
                </button>

                <button
                  onClick={handleGoodJob}
                  disabled={studyWords.length === 0 || isProcessing}
                  className="px-4 py-2 sm:px-5 sm:py-2 md:px-6 md:py-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-xs sm:text-sm md:text-base font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Good Job ✨
                </button>

                <button
                  onClick={handleNext}
                  disabled={studyWords.length === 0}
                  className="px-3 py-2 sm:px-4 sm:py-2 md:px-6 md:py-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white text-xs sm:text-sm md:text-base font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <span className="hidden sm:inline">다음</span>
                  <span className="text-sm sm:text-base md:text-lg">→</span>
                </button>
              </div>
            </div>
          )}

          {/* 공부 완료 화면 */}
          {isCompleted && (
            <div className="w-full max-w-lg text-center px-4">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 sm:p-6 md:p-8 shadow-lg border-2 border-green-200">
                <div className="text-4xl sm:text-5xl md:text-6xl mb-3 sm:mb-4">🎉</div>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 sm:mb-4">
                  공부 완료!
                </h3>
                {isUpdating ? (
                  <div className="mt-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500 mx-auto mb-2"></div>
                    <p className="text-sm sm:text-base text-gray-600">Frequency 업데이트 중...</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm sm:text-base md:text-lg text-gray-600 mb-4">
                      모든 단어를 완료했습니다!<br />
                      2개 단어의 frequency가 1씩 증가했습니다.
                    </p>
                    <div className="flex justify-center gap-3 sm:gap-4">
                      <button
                        onClick={handleClose}
                        className="px-4 py-2 sm:px-5 sm:py-2 md:px-6 md:py-3 rounded-full bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600 text-white text-sm sm:text-base md:text-lg font-semibold shadow-md hover:shadow-lg transition-all"
                      >
                        닫기
                      </button>
                      <button
                        onClick={handleStudyMore}
                        className="px-4 py-2 sm:px-5 sm:py-2 md:px-6 md:py-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-sm sm:text-base md:text-lg font-semibold shadow-md hover:shadow-lg transition-all"
                      >
                        다른 단어 공부하기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
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
    </div>
  );
}

