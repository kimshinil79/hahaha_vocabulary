'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import FlashcardGroupSelectionModal from './FlashcardGroupSelectionModal';
import WordEditModal from './WordEditModal';
import { updateWordInfo } from '@/utils/wordFirebase';

type SortType = 'frequency' | 'difficulty';

interface FlashcardListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FlashcardListModal({ isOpen, onClose }: FlashcardListModalProps) {
  const { user } = useAuth();
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [filteredFlashcards, setFilteredFlashcards] = useState<any[]>([]);
  const [sortType, setSortType] = useState<SortType>('frequency');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGroupSelectionOpen, setIsGroupSelectionOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 사용자의 flashcards 실시간 가져오기
  useEffect(() => {
    if (!isOpen || !user) {
      setFlashcards([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const userDocRef = doc(db, 'users', user.uid);
    
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          const flashcardsData = (userData.flashcards || []) as any[];
          setFlashcards(flashcardsData);
          
          // 그룹 이름 업데이트
          if (selectedGroupId) {
            const groups = (userData.groups || []) as any[];
            const selectedGroup = groups.find((g: any) => g.id === selectedGroupId);
            if (selectedGroup) {
              setSelectedGroupName(selectedGroup.name || null);
            }
          }
        } else {
          setFlashcards([]);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Flashcards 가져오기 오류:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, user, selectedGroupId]);

  // 필터링 및 정렬
  useEffect(() => {
    let filtered = [...flashcards];

    // 그룹 필터링
    if (selectedGroupId) {
      filtered = filtered.filter((flashcard) => {
        const groups = flashcard.groups || [];
        return groups.includes(selectedGroupId);
      });
    }

    // 정렬
    filtered.sort((a, b) => {
      if (sortType === 'frequency') {
        // 빈도: viewCount 오름차순 (적게 본 것부터)
        const viewCountA = a.viewCount || 0;
        const viewCountB = b.viewCount || 0;
        return viewCountA - viewCountB;
      } else {
        // 난이도: difficulty 필드 기준 (hard -> normal -> easy, 어려운 것부터)
        const difficultyA = getDifficultyValue(
          a.difficulty || a.meaning?.difficulty
        );
        const difficultyB = getDifficultyValue(
          b.difficulty || b.meaning?.difficulty
        );
        return difficultyB - difficultyA; // 내림차순
      }
    });

    setFilteredFlashcards(filtered);
  }, [flashcards, sortType, selectedGroupId]);

  const getDifficultyValue = (difficulty: string | undefined): number => {
    switch (difficulty?.toLowerCase()) {
      case 'hard':
        return 3;
      case 'normal':
        return 2;
      case 'easy':
        return 1;
      default:
        return 2; // 기본값: normal
    }
  };

  const getDifficultyColor = (difficulty: string | undefined) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy':
        return {
          gradientStart: 'bg-green-200',
          gradientEnd: 'bg-green-300',
          textColor: 'text-green-800',
          iconColor: 'text-green-700'
        };
      case 'normal':
        return {
          gradientStart: 'bg-yellow-200',
          gradientEnd: 'bg-yellow-300',
          textColor: 'text-yellow-800',
          iconColor: 'text-yellow-700'
        };
      case 'hard':
        return {
          gradientStart: 'bg-red-200',
          gradientEnd: 'bg-red-300',
          textColor: 'text-red-800',
          iconColor: 'text-red-700'
        };
      default:
        return {
          gradientStart: 'bg-yellow-200',
          gradientEnd: 'bg-yellow-300',
          textColor: 'text-yellow-800',
          iconColor: 'text-yellow-700'
        };
    }
  };

  const getFrequencyColor = (viewCount: number, maxViewCount: number) => {
    if (maxViewCount === 0) return 'bg-gray-200';
    const ratio = Math.min(viewCount / maxViewCount, 1);
    
    if (ratio === 0) return 'bg-gray-200';
    if (ratio <= 0.2) return 'bg-pink-100';
    if (ratio <= 0.4) return 'bg-pink-200';
    if (ratio <= 0.6) return 'bg-pink-300';
    if (ratio <= 0.8) return 'bg-pink-400';
    return 'bg-pink-500';
  };

  const extractKoreanFromDefinition = (definition: any): string => {
    if (!definition) return '';
    const defStr = Array.isArray(definition)
      ? (definition.length > 0 ? String(definition[0]) : '')
      : String(definition);
    if (!defStr) return '';
    
    // "[명사] 확신" 형식에서 "확신" 부분만 추출
    const match = defStr.match(/\]\s*(.+)$/);
    if (match) {
      return match[1]?.trim() || defStr;
    }
    return defStr;
  };

  const handleGroupSelect = (groupId: string | null, groupName: string | null) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setIsGroupSelectionOpen(false);
  };

  const handleWordClick = async (flashcard: any) => {
    if (!user) return;

    try {
      // words 컬렉션에서 단어 정보 가져오기
      const wordDocRef = doc(db, 'words', flashcard.word.toLowerCase());
      const wordDocSnap = await getDoc(wordDocRef);

      if (wordDocSnap.exists()) {
        const wordData = wordDocSnap.data();
        setSelectedWord({
          word: wordData.word || flashcard.word,
          pronunciation: wordData.pronunciation || flashcard.pronunciation || '',
          meanings: wordData.meanings || [],
          ...wordData
        });
      } else {
        // words 컬렉션에 없으면 flashcard의 meaning을 사용
        const meaning = flashcard.meaning || {};
        setSelectedWord({
          word: flashcard.word,
          pronunciation: flashcard.pronunciation || '',
          meanings: [meaning],
          pos: meaning.pos || []
        });
      }
    } catch (error) {
      console.error('단어 정보 가져오기 오류:', error);
      // 에러 발생 시 flashcard 데이터 사용
      const meaning = flashcard.meaning || {};
      setSelectedWord({
        word: flashcard.word,
        pronunciation: flashcard.pronunciation || '',
        meanings: [meaning],
        pos: meaning.pos || []
      });
    }
  };

  const handleSaveWord = async (updatedWordData: any) => {
    if (!user) return;

    try {
      setIsSaving(true);
      await updateWordInfo(user, updatedWordData.word.toLowerCase(), updatedWordData);
      setSelectedWord(null);
    } catch (error) {
      console.error('단어 저장 오류:', error);
      alert('단어 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const maxViewCount = filteredFlashcards.reduce(
    (max, card) => Math.max(max, card.viewCount || 0),
    0
  );

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-pink-600">단어장</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
              >
                ×
              </button>
            </div>

            {/* 정렬 버튼들 */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSortType('frequency')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  sortType === 'frequency'
                    ? 'bg-pink-100 text-pink-700 border-2 border-pink-500'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                }`}
              >
                빈도
              </button>
              <button
                onClick={() => setSortType('difficulty')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  sortType === 'difficulty'
                    ? 'bg-pink-100 text-pink-700 border-2 border-pink-500'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                }`}
              >
                난이도
              </button>
              <button
                onClick={() => setIsGroupSelectionOpen(true)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                  selectedGroupId
                    ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                }`}
              >
                <span className="max-w-[120px] truncate">
                  {selectedGroupId ? (selectedGroupName || '그룹 선택됨') : '모든 그룹'}
                </span>
                {selectedGroupId ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* 단어 목록 */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500"></div>
              </div>
            ) : filteredFlashcards.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 text-lg">
                  {selectedGroupId ? '선택한 그룹에 단어가 없습니다.' : '저장된 단어가 없습니다.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredFlashcards.map((flashcard, index) => {
                  const word = flashcard.word || '';
                  const viewCount = flashcard.viewCount || 0;
                  const difficulty = flashcard.difficulty || flashcard.meaning?.difficulty || 'normal';
                  const koreanDefinition = extractKoreanFromDefinition(
                    flashcard.meaning?.definition
                  );

                  // 색상 결정
                  let cardClassName = '';
                  let textColor = '';
                  let iconColor = '';

                  if (sortType === 'frequency') {
                    cardClassName = getFrequencyColor(viewCount, maxViewCount);
                    const ratio = maxViewCount > 0 ? Math.min(viewCount / maxViewCount, 1) : 0;
                    textColor = ratio > 0.4 ? 'text-white' : 'text-pink-800';
                    iconColor = ratio > 0.4 ? 'text-white' : 'text-pink-700';
                  } else {
                    const colors = getDifficultyColor(difficulty);
                    cardClassName = colors.gradientStart;
                    textColor = colors.textColor;
                    iconColor = colors.iconColor;
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => handleWordClick(flashcard)}
                      className={`${cardClassName} rounded-xl p-4 shadow-md hover:shadow-lg transition-all text-left min-h-[120px] flex flex-col justify-between`}
                    >
                      <div>
                        <div className={`font-bold text-sm mb-1 ${textColor} line-clamp-2`}>
                          {word}
                        </div>
                        {koreanDefinition && (
                          <div className={`text-xs ${textColor} opacity-85 line-clamp-2 mt-1`}>
                            {koreanDefinition}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        <svg
                          className={`w-3 h-3 ${iconColor}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path
                            fillRule="evenodd"
                            d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className={`text-xs font-semibold ${iconColor}`}>
                          {viewCount}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 그룹 선택 모달 */}
      {isGroupSelectionOpen && (
        <FlashcardGroupSelectionModal
          isOpen={isGroupSelectionOpen}
          onClose={() => setIsGroupSelectionOpen(false)}
          onSelect={handleGroupSelect}
          user={user}
        />
      )}

      {/* 단어 상세 정보 모달 */}
      {selectedWord && (
        <WordEditModal
          wordData={selectedWord}
          source="list"
          onClose={() => setSelectedWord(null)}
          onSave={handleSaveWord}
          isSaving={isSaving}
        />
      )}
    </>
  );
}

