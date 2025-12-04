'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { StudyPattern } from './StudyPatternSelectionModal';
import StudyCompleteModal, { StudyContinuationOption } from './StudyCompleteModal';
import FlashcardGroupSelectionModal from './FlashcardGroupSelectionModal';

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
  studyPattern?: StudyPattern | null;
  continuationOption?: StudyContinuationOption | 'groupSelection' | null;
  selectedGroupId?: string | null;
  onContinue?: (option: StudyContinuationOption | 'groupSelection', groupId?: string | null) => void;
}

export default function WordPracticeModal({ 
  isOpen, 
  onClose, 
  studyPattern,
  continuationOption,
  selectedGroupId,
  onContinue
}: WordPracticeModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studyWords, setStudyWords] = useState<StudyWord[]>([]);
  const [originalWords, setOriginalWords] = useState<string[]>([]); // 원래 선택된 단어 저장
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // 버튼 중복 클릭 방지
  const [isStudyCompleteModalOpen, setIsStudyCompleteModalOpen] = useState(false);
  const [studiedWordsCount, setStudiedWordsCount] = useState(0);
  const [isGroupSelectionOpen, setIsGroupSelectionOpen] = useState(false);
  const [flashcardDifficulties, setFlashcardDifficulties] = useState<{ [word: string]: string }>({});

  useEffect(() => {
    if (isOpen && user && studyPattern) {
      loadAndPrepareWords();
    }
  }, [isOpen, user, studyPattern, continuationOption, selectedGroupId]);

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
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        setStudyWords([]);
        setLoading(false);
        return;
      }

      const userData = userDocSnap.data();
      const flashcards = (userData.flashcards || []) as any[];

      if (flashcards.length === 0) {
        setStudyWords([]);
        setLoading(false);
        return;
      }

      // 옵션에 따라 단어 선택
      let selectedFlashcards: any[] = [];

      if (continuationOption === 'groupSelection' && selectedGroupId) {
        // 그룹별 단어
        selectedFlashcards = flashcards
          .filter((card) => {
            const groups = card.groups || [];
            return groups.includes(selectedGroupId);
          })
          .sort((a, b) => {
            const viewCountA = a.viewCount || 0;
            const viewCountB = b.viewCount || 0;
            return viewCountA - viewCountB;
          })
          .slice(0, 10);
      } else if (continuationOption === StudyContinuationOption.lowFrequency) {
        // 공부 빈도 낮은 단어 (viewCount 낮은 순)
        selectedFlashcards = [...flashcards]
          .sort((a, b) => {
            const viewCountA = a.viewCount || 0;
            const viewCountB = b.viewCount || 0;
            return viewCountA - viewCountB;
          })
          .slice(0, 10);
      } else if (continuationOption === StudyContinuationOption.hardWords) {
        // 어려운 단어
        const hardFlashcards = flashcards
          .filter((card) => (card.difficulty || card.meaning?.difficulty) === 'hard')
          .sort((a, b) => {
            const viewCountA = a.viewCount || 0;
            const viewCountB = b.viewCount || 0;
            return viewCountA - viewCountB;
          });
        selectedFlashcards = hardFlashcards.slice(0, 10);
      } else if (continuationOption === StudyContinuationOption.mix) {
        // 1번과 2번 믹스
        const lowList = [...flashcards].sort((a, b) => {
          const viewCountA = a.viewCount || 0;
          const viewCountB = b.viewCount || 0;
          return viewCountA - viewCountB;
        });
        const hardList = flashcards
          .filter((card) => (card.difficulty || card.meaning?.difficulty) === 'hard')
          .sort((a, b) => {
            const viewCountA = a.viewCount || 0;
            const viewCountB = b.viewCount || 0;
            return viewCountA - viewCountB;
          });

        const combined: any[] = [];
        const seen = new Set<string>();

        const addCards = (source: any[]) => {
          for (const card of source) {
            const word = card.word || '';
            if (!word || seen.has(word)) continue;
            seen.add(word);
            combined.push(card);
            if (combined.length >= 10) break;
          }
        };

        addCards(lowList.slice(0, 5));
        if (combined.length < 10) {
          addCards(hardList.slice(0, 5));
        }
        if (combined.length < 10) {
          addCards(lowList.slice(5));
        }

        selectedFlashcards = combined;
      } else {
        // 기본: viewCount 낮은 순으로 10개
        selectedFlashcards = [...flashcards]
          .sort((a, b) => {
            const viewCountA = a.viewCount || 0;
            const viewCountB = b.viewCount || 0;
            return viewCountA - viewCountB;
          })
          .slice(0, 10);
      }

      // flashcards를 StudyWord 형식으로 변환
      const selectedWords: StudyWord[] = selectedFlashcards.map((flashcard) => {
        const meaning = flashcard.meaning || {};
        const examples = meaning.examples || [];
        const firstExample = Array.isArray(examples) ? (examples[0] || '') : (examples || '');
        
        // WordData 형식으로 변환
        const wordData: WordData = {
          meanings: [{
            definition: meaning.definition || '',
            examples: Array.isArray(examples) ? examples : [examples].filter(Boolean),
            frequency: 0,
            updatedAt: new Date().toISOString()
          }],
          updatedAt: new Date().toISOString()
        };

        const word = flashcard.word || '';
        const difficulty = flashcard.difficulty || flashcard.meaning?.difficulty || 'normal';
        
        // 난이도 상태 초기화
        setFlashcardDifficulties((prev) => ({
          ...prev,
          [word]: difficulty
        }));

        return {
          word,
          example: firstExample,
          frequency: 0,
          starCount: 0,
          showDefinition: false,
          wordData
        };
      });

      setStudyWords(selectedWords);
      setOriginalWords([]); // 공부 완료한 단어(별 2개)만 추가
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
    setFlashcardDifficulties({});
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

  const handleUpdateDifficulty = async (difficulty: string) => {
    if (!user || !currentWord) return;

    const word = currentWord.word;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        throw new Error('사용자 데이터를 찾을 수 없습니다.');
      }

      const userData = userDocSnap.data();
      const flashcards = (userData.flashcards || []) as any[];
      const updatedFlashcards = [...flashcards];

      // 해당 단어의 flashcard 찾아서 난이도 업데이트
      const flashcardIndex = updatedFlashcards.findIndex((card) => card.word === word);
      if (flashcardIndex >= 0) {
        updatedFlashcards[flashcardIndex] = {
          ...updatedFlashcards[flashcardIndex],
          difficulty: difficulty,
          updatedAt: new Date().toISOString()
        };

        // Firebase에 업데이트
        await setDoc(userDocRef, {
          flashcards: updatedFlashcards,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // 로컬 상태 업데이트
        setFlashcardDifficulties((prev) => ({
          ...prev,
          [word]: difficulty
        }));
      }
    } catch (err) {
      console.error('난이도 업데이트 오류:', err);
      alert('난이도 업데이트 중 오류가 발생했습니다.');
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

        // 별이 2개면 originalWords에 추가 (공부 완료한 단어)
        setOriginalWords((prev) => {
          if (!prev.includes(newStudyWords[wordIndex].word)) {
            return [...prev, newStudyWords[wordIndex].word];
          }
          return prev;
        });

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
    setStudiedWordsCount(originalWords.length);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        throw new Error('사용자 데이터를 찾을 수 없습니다.');
      }

      const userData = userDocSnap.data();
      const flashcards = (userData.flashcards || []) as any[];
      const updatedFlashcards = [...flashcards];

      // 공부한 단어들의 viewCount 업데이트
      for (const word of originalWords) {
        const flashcardIndex = updatedFlashcards.findIndex((card) => card.word === word);
        if (flashcardIndex >= 0) {
          const currentViewCount = updatedFlashcards[flashcardIndex].viewCount || 0;
          updatedFlashcards[flashcardIndex] = {
            ...updatedFlashcards[flashcardIndex],
            viewCount: currentViewCount + 1,
            updatedAt: new Date().toISOString()
          };
        }
      }

      // studyHistory에 세션 저장
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const studyHistory = (userData.studyHistory || {}) as { [key: string]: any };
      const dateData = studyHistory[dateStr] || {};
      const sessions = Array.isArray(dateData.sessions) ? [...dateData.sessions] : [];

      // 새 세션 추가
      sessions.push({
        time: timeStr,
        words: originalWords
      });

      // 날짜별 데이터 업데이트
      studyHistory[dateStr] = {
        sessions: sessions,
        count: sessions.length
      };

      // Firebase에 업데이트
      await setDoc(userDocRef, {
        flashcards: updatedFlashcards,
        studyHistory: studyHistory,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setIsUpdating(false);
      
      // 공부 완료 모달 표시
      setTimeout(() => {
        setIsStudyCompleteModalOpen(true);
      }, 600);
    } catch (err) {
      console.error('ViewCount 업데이트 오류:', err);
      setError(err instanceof Error ? err.message : 'ViewCount 업데이트 중 오류가 발생했습니다.');
      setIsUpdating(false);
    }
  };

  const handleStudyCompleteOption = (option: StudyContinuationOption | 'groupSelection') => {
    if (option === StudyContinuationOption.goHome) {
      setIsStudyCompleteModalOpen(false);
      handleClose();
      return;
    }
    
    if (option === 'groupSelection') {
      setIsGroupSelectionOpen(true);
      return;
    }
    
    // 다른 옵션들은 부모 컴포넌트에 알려서 새로운 옵션으로 다시 열기
    setIsStudyCompleteModalOpen(false);
    if (onContinue) {
      onContinue(option);
    } else {
      handleClose();
    }
  };

  const handleGroupSelect = (groupId: string | null, groupName: string | null) => {
    setIsGroupSelectionOpen(false);
    if (groupId && onContinue) {
      // 그룹 선택 시 부모 컴포넌트에 알려서 다시 열기
      setIsStudyCompleteModalOpen(false);
      onContinue('groupSelection', groupId);
    } else {
      handleClose();
    }
  };

  if (!isOpen || !studyPattern) return null;

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

                {/* 단어 - 패턴에 따라 표시 */}
                <div className="text-center mb-6">
                  <h3 className="text-4xl font-extrabold text-gray-900 mb-2">
                    {(() => {
                      const meaning = currentWord.wordData.meanings?.[0];
                      const definition = meaning?.definition || '';
                      
                      // definition에서 한글 부분만 추출 (예: "[명사] 확신" -> "확신")
                      const extractKorean = (def: string) => {
                        const match = def.match(/\]\s*(.+)$/);
                        return match ? match[1].trim() : def;
                      };
                      
                      if (studyPattern === StudyPattern.englishToKorean) {
                        // 영어 -> 한글: 영어 단어 표시
                        return (
                          <>
                            {currentWord.word}
                            {currentWord.showDefinition && definition && (
                              <span className="text-2xl text-gray-600 font-normal ml-2">
                                ({extractKorean(definition)})
                              </span>
                            )}
                          </>
                        );
                      } else if (studyPattern === StudyPattern.koreanToEnglish) {
                        // 한글 -> 영어: 한글 뜻 표시
                        return (
                          <>
                            {currentWord.showDefinition ? (
                              <>
                                {extractKorean(definition)}
                                <span className="text-2xl text-gray-600 font-normal ml-2">
                                  ({currentWord.word})
                                </span>
                              </>
                            ) : (
                              extractKorean(definition) || definition
                            )}
                          </>
                        );
                      } else {
                        // 한글 문장 -> 영어 문장: 예문의 한글 부분 표시
                        const example = currentWord.example || '';
                        const match = example.match(/\(([^)]+)\)/);
                        const koreanPart = match ? match[1].trim() : '';
                        
                        return (
                          <>
                            {currentWord.showDefinition ? (
                              <>
                                {koreanPart}
                                <span className="text-2xl text-gray-600 font-normal ml-2">
                                  ({example.replace(/\([^)]+\)/, '').trim()})
                                </span>
                              </>
                            ) : (
                              koreanPart || example
                            )}
                          </>
                        );
                      }
                    })()}
                  </h3>
                </div>

                {/* 난이도 선택 버튼 */}
                <div className="bg-white rounded-xl p-4 border border-cyan-200">
                  <div className="text-sm text-gray-500 mb-3 font-semibold text-center">난이도</div>
                  <div className="flex justify-center gap-2">
                    {[
                      { value: 'easy', label: '쉬움', color: 'bg-green-500 hover:bg-green-600', borderColor: 'border-green-600' },
                      { value: 'normal', label: '보통', color: 'bg-orange-500 hover:bg-orange-600', borderColor: 'border-orange-600' },
                      { value: 'hard', label: '어려움', color: 'bg-red-500 hover:bg-red-600', borderColor: 'border-red-600' }
                    ].map((difficulty) => {
                      const currentDifficulty = flashcardDifficulties[currentWord.word] || 'normal';
                      const isSelected = currentDifficulty === difficulty.value;
                      
                      return (
                        <button
                          key={difficulty.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateDifficulty(difficulty.value);
                          }}
                          className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                            isSelected
                              ? `${difficulty.color} text-white ${difficulty.borderColor}`
                              : 'bg-transparent text-gray-600 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {difficulty.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
          {isCompleted && !isStudyCompleteModalOpen && (
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
                ) : null}
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

      {/* 공부 완료 모달 */}
      <StudyCompleteModal
        isOpen={isStudyCompleteModalOpen}
        onClose={() => {
          setIsStudyCompleteModalOpen(false);
          handleClose();
        }}
        onSelect={handleStudyCompleteOption}
        studiedWordsCount={studiedWordsCount}
      />

      {/* 그룹 선택 모달 */}
      {isGroupSelectionOpen && (
        <FlashcardGroupSelectionModal
          isOpen={isGroupSelectionOpen}
          onClose={() => setIsGroupSelectionOpen(false)}
          onSelect={handleGroupSelect}
          user={user}
        />
      )}
    </div>
  );
}

