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

interface WordStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WordStudyModal({ isOpen, onClose }: WordStudyModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meaningsData, setMeaningsData] = useState<MeaningsData | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadMeanings();
    }
  }, [isOpen, user]);

  const loadMeanings = async () => {
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

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const meanings = userData.meanings || {};
        setMeaningsData(meanings);
      } else {
        setMeaningsData({});
      }
    } catch (err) {
      console.error('단어 데이터 로드 오류:', err);
      setError(err instanceof Error ? err.message : '단어 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMeaningsData(null);
    setError(null);
    setSelectedWord(null);
    onClose();
  };

  const handleWordClick = (word: string) => {
    setSelectedWord(word);
  };

  const handleCloseDetail = () => {
    setSelectedWord(null);
  };

  // 단어의 총 frequency를 계산하는 함수
  const getTotalFrequency = (wordData: WordData): number => {
    return wordData.meanings?.reduce((sum, meaning) => sum + (meaning.frequency || 0), 0) || 0;
  };

  // 전체 단어 복사 함수
  const handleCopyAllWords = async () => {
    if (!meaningsData) return;
    
    const words = Object.keys(meaningsData);
    // 단어를 알파벳 순으로 정렬
    const sortedWords = words.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    
    // 'apple, book' 형식으로 변환 (전체를 하나의 따옴표로 감싸기)
    const wordsString = `'${sortedWords.join(', ')}'`;
    
    try {
      await navigator.clipboard.writeText(wordsString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('복사 실패:', err);
      setError('단어 복사에 실패했습니다.');
    }
  };

  // frequency에 따라 색상 클래스를 반환하는 함수
  const getColorClass = (wordData: WordData): string => {
    // 모든 meanings의 frequency 합산
    const totalFrequency = getTotalFrequency(wordData);
    
    // frequency에 따른 색상 단계 결정
    // 0-2: 매우 옅음, 3-5: 옅음, 6-10: 중간, 11-20: 진함, 21+: 매우 진함
    if (totalFrequency === 0) {
      return 'bg-gradient-to-r from-sky-100 to-cyan-100 text-gray-700 hover:from-sky-200 hover:to-cyan-200';
    } else if (totalFrequency <= 2) {
      return 'bg-gradient-to-r from-sky-200 to-cyan-200 text-gray-700 hover:from-sky-300 hover:to-cyan-300';
    } else if (totalFrequency <= 5) {
      return 'bg-gradient-to-r from-cyan-300 to-blue-400 text-white hover:from-cyan-400 hover:to-blue-500';
    } else if (totalFrequency <= 10) {
      return 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:from-cyan-500 hover:to-blue-600';
    } else if (totalFrequency <= 20) {
      return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700';
    } else {
      return 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800';
    }
  };

  if (!isOpen) return null;

  // 단어 목록을 frequency 낮은 순으로 정렬, 같으면 알파벳 순으로 정렬
  const words = meaningsData 
    ? Object.keys(meaningsData).sort((a, b) => {
        const freqA = getTotalFrequency(meaningsData[a]);
        const freqB = getTotalFrequency(meaningsData[b]);
        
        // frequency가 다르면 frequency 낮은 순으로 정렬
        if (freqA !== freqB) {
          return freqA - freqB;
        }
        
        // frequency가 같으면 알파벳 순으로 정렬
        return a.localeCompare(b, 'en', { sensitivity: 'base' });
      })
    : [];
  const totalWords = words.length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full h-[90vh] max-w-6xl flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
                단어 공부하기
              </h2>
              {!loading && !error && totalWords > 0 && (
                <button
                  onClick={handleCopyAllWords}
                  className="px-4 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 whitespace-nowrap"
                >
                  {copied ? '✓ 복사됨!' : '전체 단어 복사'}
                </button>
              )}
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            저장된 단어 목록을 확인하세요. 총 {loading ? '...' : totalWords}개의 단어가 있습니다.
          </p>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">{error}</div>
          )}

          {!loading && !error && totalWords === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-500 text-lg mb-2">저장된 단어가 없습니다.</p>
                <p className="text-gray-400 text-sm">JSON 입력 또는 직접 입력으로 단어를 추가해보세요!</p>
              </div>
            </div>
          )}

          {!loading && !error && totalWords > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {words.map((word) => {
                const wordData = meaningsData![word];
                return (
                  <button
                    key={word}
                    onClick={() => handleWordClick(word)}
                    className={`px-4 py-3 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all transform hover:scale-105 text-center ${getColorClass(wordData)}`}
                  >
                    <div className="text-base sm:text-lg font-bold">{word}</div>
                  </button>
                );
              })}
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

      {/* 단어 상세 정보 모달 */}
      {selectedWord && meaningsData && meaningsData[selectedWord] && (
        <WordDetailModal
          word={selectedWord}
          wordData={meaningsData[selectedWord]}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}

// 단어 상세 정보 모달 컴포넌트
interface WordDetailModalProps {
  word: string;
  wordData: WordData;
  onClose: () => void;
}

function WordDetailModal({ word, wordData, onClose }: WordDetailModalProps) {
  const { user } = useAuth();
  const [meanings, setMeanings] = useState<WordMeaning[]>(wordData.meanings || []);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSpeakWord = () => {
    if (typeof window === 'undefined' || !word) return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSpeakExample = (example: string) => {
    if (typeof window === 'undefined' || !example) return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(example);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // 병합 로직
    const newMeanings = [...meanings];
    const draggedMeaning = newMeanings[draggedIndex];
    const targetMeaning = newMeanings[targetIndex];

    // 뜻 병합 (구분자 추가)
    const mergedDefinition = `${targetMeaning.definition} / ${draggedMeaning.definition}`;
    
    // 예문 병합 (중복 제거)
    const mergedExamples = [
      ...(targetMeaning.examples || []),
      ...(draggedMeaning.examples || [])
    ].filter((example, index, self) => self.indexOf(example) === index);

    // frequency 합산
    const mergedFrequency = (targetMeaning.frequency || 0) + (draggedMeaning.frequency || 0);

    // 병합된 의미 생성
    const mergedMeaning: WordMeaning = {
      definition: mergedDefinition,
      examples: mergedExamples,
      frequency: mergedFrequency,
      updatedAt: new Date().toISOString()
    };

    // 병합된 의미로 교체하고 드래그된 의미 제거
    newMeanings[targetIndex] = mergedMeaning;
    newMeanings.splice(draggedIndex, 1);

    setMeanings(newMeanings);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Firestore에 저장
    await saveMeaningsToFirestore(newMeanings);
  };

  const saveMeaningsToFirestore = async (newMeanings: WordMeaning[]) => {
    if (!user) return;

    setIsSaving(true);
    try {
      const email = user.email;
      const uid = user.uid;
      
      if (!email) throw new Error('이메일 정보를 찾을 수 없습니다.');

      const username = email.split('@')[0];
      const userDocId = `${username}${uid}`;
      const userDocRef = doc(db, 'users', userDocId);

      // 기존 데이터 가져오기
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) return;

      const userData = userDocSnap.data();
      const meanings = userData.meanings || {};

      // 해당 단어의 meanings 업데이트
      meanings[word] = {
        meanings: newMeanings,
        updatedAt: new Date().toISOString()
      };

      // Firestore에 저장
      await setDoc(userDocRef, { meanings }, { merge: true });
    } catch (err) {
      console.error('의미 저장 오류:', err);
      alert('의미 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-extrabold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                {word}
              </h3>
              {/* 단어 읽기 아이콘 */}
              <button
                onClick={handleSpeakWord}
                className="p-2 rounded-full bg-cyan-50 hover:bg-cyan-100 shadow-md hover:shadow-lg transition-all active:scale-95"
                aria-label="단어 발음 듣기"
                title="단어 발음 듣기"
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
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
          {meanings && meanings.length > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {meanings.length}개의 의미 {meanings.length > 1 && '(드래그하여 병합 가능)'}
            </p>
          )}
          {isSaving && (
            <p className="text-xs text-blue-600 mt-1">저장 중...</p>
          )}
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {meanings && meanings.length > 0 ? (
            <div className="space-y-4">
              {meanings.map((meaning, index) => (
                <div 
                  key={index} 
                  draggable={meanings.length > 1}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`border rounded-xl p-5 transition-all ${
                    draggedIndex === index 
                      ? 'bg-cyan-100 border-cyan-400 opacity-50 cursor-move' 
                      : dragOverIndex === index
                      ? 'bg-blue-100 border-blue-400 scale-105'
                      : 'bg-gray-50 border-gray-200'
                  } ${meanings.length > 1 ? 'cursor-grab active:cursor-grabbing hover:shadow-lg' : ''}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-cyan-600 font-bold text-lg min-w-[40px]">
                      {index + 1}.
                    </span>
                    <div className="flex-1">
                      <div className="text-gray-700 text-lg font-medium mb-2">
                        {meaning.definition}
                      </div>
                      {meaning.examples && meaning.examples.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <span className="text-sm text-gray-500 font-semibold">예문:</span>
                          {meaning.examples.map((example, exIndex) => (
                            <div
                              key={exIndex}
                              className="text-sm text-gray-700 italic bg-white p-3 rounded-lg border border-gray-200 relative pr-10"
                            >
                              "{example}"
                              {/* 예문 읽기 아이콘 */}
                              <button
                                onClick={() => handleSpeakExample(example)}
                                className="absolute bottom-2 right-2 p-1.5 rounded-full bg-cyan-50 hover:bg-cyan-100 shadow-sm hover:shadow-md transition-all active:scale-95"
                                aria-label="예문 발음 듣기"
                                title="예문 발음 듣기"
                              >
                                <svg 
                                  xmlns="http://www.w3.org/2000/svg" 
                                  className="h-4 w-4 text-cyan-600" 
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
                          ))}
                        </div>
                      )}
                      {meaning.frequency && (
                        <div className="mt-3 text-xs text-gray-400">
                          사용 빈도: {meaning.frequency}회
                        </div>
                      )}
                      {meaning.updatedAt && (
                        <div className="mt-2 text-xs text-gray-400">
                          업데이트: {new Date(meaning.updatedAt).toLocaleString('ko-KR')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400 italic">의미 정보가 없습니다.</p>
            </div>
          )}

          {/* 단어 전체 업데이트 시간 */}
          {wordData.updatedAt && (
            <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
              최종 업데이트: {new Date(wordData.updatedAt).toLocaleString('ko-KR')}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-end">
            <button
              onClick={onClose}
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

