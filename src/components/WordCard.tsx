'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { getExamplesByLevel, getExamplesByStudyFields, getStudyFieldName } from '@/utils/wordUtils';

interface WordCardProps {
  isLoadingClickedWord: boolean;
  clickedWordData: any | null;
  clickedWordNotFound: boolean;
  isLoadingWordData: boolean;
  wordDataList: any[];
  currentWordIndex: number;
  batchProgress: { current: number; total: number };
  highlightedMeaningIndex: number | null;
  isSavingMeaning: boolean;
  selectedWords: Array<{word: string; meaning: any; wordData: any}>;
  lastDoubleClickedWord: string | null;
  userFlashcards: any[];
  onClose: () => void;
  onCloseNotFound: () => void;
  onDirectInput?: (word: string) => void;
  onEditWord: (wordData: any, source: 'clicked' | 'list') => void;
  onAddToFlashcard: (word: string, meaning: any, pronunciation?: string) => void;
  onSaveNewWordToWords: () => void;
  onPreviousWord: () => void;
  onNextWord: () => void;
}

export default function WordCard({
  isLoadingClickedWord,
  clickedWordData,
  clickedWordNotFound,
  isLoadingWordData,
  wordDataList,
  currentWordIndex,
  batchProgress,
  highlightedMeaningIndex,
  isSavingMeaning,
  selectedWords,
  lastDoubleClickedWord,
  userFlashcards,
  onClose,
  onCloseNotFound,
  onDirectInput,
  onEditWord,
  onAddToFlashcard,
  onSaveNewWordToWords,
  onPreviousWord,
  onNextWord
}: WordCardProps) {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<{ englishLevel?: string; studyFields?: string[] }>({});

  // 사용자 프로필 정보 로드
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user) return;
      
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const fields = userData.studyFields || userData.studyField || [];
          const studyFields = Array.isArray(fields) 
            ? fields.filter((f: string) => ['KSAT', 'Toeic', 'Toefl'].includes(f))
            : [];
          
          setUserProfile({
            englishLevel: userData.englishLevel as string | undefined,
            studyFields,
          });
        }
      } catch (error) {
        console.error('사용자 프로필 로드 실패:', error);
      }
    };
    
    if (user) {
      loadUserProfile();
    }
  }, [user]);
  
  // 특정 단어와 뜻이 이미 flashcards에 있는지 확인
  const isMeaningInFlashcard = (word: string, meaning: any): boolean => {
    return userFlashcards.some((card: any) => {
      // card.definition 또는 card.meaning?.definition 둘 다 확인
      const cardDefinition = card.definition || card.meaning?.definition;
      return card.word === word && cardDefinition === meaning.definition;
    });
  };
  if (!isLoadingClickedWord && !clickedWordData && !clickedWordNotFound && !isLoadingWordData && wordDataList.length === 0) {
    return null;
  }

  return (
    <div className="w-96 flex-shrink-0">
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6 sticky top-6">
        {/* 클릭한 단어 정보 표시 */}
        {isLoadingClickedWord ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600 font-semibold">단어 정보를 가져오는 중...</p>
          </div>
        ) : clickedWordNotFound ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                단어 정보 없음
              </h3>
              <button
                onClick={onCloseNotFound}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">
                Firebase에 해당 단어 정보가 없습니다.
              </p>
              <p className="text-sm text-gray-400 mb-6">
                직접 입력하여 단어장에 추가할 수 있습니다.
              </p>
              <button
                onClick={() => {
                  const wordToInput = lastDoubleClickedWord || clickedWordData?.word || selectedWords[selectedWords.length - 1]?.word || '';
                  if (wordToInput && onDirectInput) {
                    onDirectInput(wordToInput);
                  }
                }}
                className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                직접 입력하기
              </button>
            </div>
          </>
        ) : clickedWordData ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEditWord(clickedWordData, 'clicked')}
                  className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
                  title="단어 수정"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4 text-gray-600" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
                    />
                  </svg>
                </button>
                <h3 className="text-lg font-bold text-gray-800">
                  {clickedWordData.word}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            {clickedWordData.pos && clickedWordData.pos.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-gray-500">
                  {clickedWordData.pos.join(', ')}
                </span>
              </div>
            )}
            {clickedWordData.meanings && clickedWordData.meanings.length > 0 ? (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto overscroll-contain">
                {(() => {
                  // 유사도가 계산된 경우 가장 유사한 뜻을 맨 위로 정렬
                  let sortedMeanings = [...clickedWordData.meanings];
                  if (highlightedMeaningIndex !== null && highlightedMeaningIndex >= 0) {
                    const mostSimilar = sortedMeanings[highlightedMeaningIndex];
                    sortedMeanings = [
                      mostSimilar,
                      ...sortedMeanings.filter((_, idx) => idx !== highlightedMeaningIndex)
                    ];
                  }
                  
                  return sortedMeanings.map((meaning: any, displayIdx: number) => {
                    // 원본 인덱스 찾기
                    const originalIdx = clickedWordData.meanings.indexOf(meaning);
                    const isHighlighted = originalIdx === highlightedMeaningIndex;
                    
                    return (
                      <div 
                        key={meaning.id || originalIdx} 
                        className={`border-b border-gray-100 pb-4 last:border-b-0 last:pb-0 rounded-lg p-3 transition-all relative ${
                          isHighlighted 
                            ? 'bg-yellow-100 border-yellow-300 shadow-md' 
                            : ''
                        }`}
                      >
                        <div className="font-semibold text-gray-700 mb-2">
                          {meaning.definition}
                        </div>
                        {(() => {
                          // 레벨별 예문 가져오기
                          const levelExamples = getExamplesByLevel(meaning.examples, userProfile.englishLevel);
                          // 관심분야별 예문 가져오기
                          const studyFieldExamples = getExamplesByStudyFields(meaning.examples, userProfile.studyFields);
                          
                          return (
                            <>
                              {/* 레벨별 예문 표시 */}
                              {levelExamples && levelExamples.length > 0 && (
                          <div className="text-sm text-gray-600 space-y-1 mb-3">
                                  {levelExamples.map((example: string, exIdx: number) => (
                              <div key={exIdx} className="italic">
                                {example}
                              </div>
                            ))}
                          </div>
                        )}
                              
                              {/* 관심분야별 예문 표시 */}
                              {studyFieldExamples.length > 0 && (
                                <div className="mt-3 space-y-2 mb-3">
                                  {studyFieldExamples.map((fieldData, fieldIdx) => {
                                    const fieldName = getStudyFieldName(fieldData.field);
                                    const fieldColor = fieldData.field === 'KSAT' 
                                      ? 'text-purple-600' 
                                      : fieldData.field === 'Toeic'
                                        ? 'text-cyan-600'
                                        : 'text-emerald-600';
                                    
                                    return (
                                      <div key={fieldIdx} className="space-y-1">
                                        <div className={`text-xs font-semibold ${fieldColor}`}>
                                          {fieldName}
                                        </div>
                                        {fieldData.examples.map((example: string, exIdx: number) => (
                                          <div key={exIdx} className="text-sm text-gray-600 italic ml-2">
                                            {example}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        
                        {/* 단어장에 추가 버튼 */}
                        {(() => {
                          const isAlreadyAdded = isMeaningInFlashcard(clickedWordData.word, meaning);
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isAlreadyAdded) {
                                  onAddToFlashcard(
                                    clickedWordData.word,
                                    meaning,
                                    clickedWordData.pronunciation
                                  );
                                }
                              }}
                              disabled={isSavingMeaning || isAlreadyAdded}
                              className={`w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all ${
                                isAlreadyAdded
                                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed'
                              }`}
                            >
                              {isAlreadyAdded ? (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  단어장에 추가됨
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                  {isSavingMeaning ? '저장 중...' : '단어장에 추가'}
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                단어 정보 없음
              </div>
            )}
            
            {/* ChatGPT에서 받아온 단어인 경우 저장 버튼 표시 */}
            {clickedWordData.isFromChatGPT && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                {/* words 컬렉션에만 저장 */}
                <button
                  onClick={onSaveNewWordToWords}
                  disabled={isSavingMeaning}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {isSavingMeaning ? '저장 중...' : 'words 컬렉션에만 저장'}
                </button>
              </div>
            )}
          </>
        ) : isLoadingWordData && wordDataList.length === 0 ? (
          // 초기 로딩 상태
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
            <p className="text-gray-600 font-semibold">단어 정보를 가져오는 중...</p>
            {batchProgress.total > 1 && (
              <div className="mt-4 w-full">
                <div className="text-sm text-gray-500 text-center mb-2">
                  단어 {batchProgress.current} / {batchProgress.total}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        ) : wordDataList.length > 0 ? (
          <>
            {/* 로딩 중이면서 데이터가 있을 때 진행 상태 표시 */}
            {isLoadingWordData && batchProgress.total > 1 && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="text-xs text-gray-500 text-center mb-2">
                  단어 {batchProgress.current} / {batchProgress.total} 처리 중...
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEditWord(wordDataList[currentWordIndex], 'list')}
                  className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
                  title="단어 수정"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4 text-gray-600" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
                    />
                  </svg>
                </button>
                <h3 className="text-lg font-bold text-gray-800">
                  {wordDataList[currentWordIndex]?.word || ''}
                </h3>
              </div>
              <div className="text-sm text-gray-500">
                {currentWordIndex + 1} / {wordDataList.length}
              </div>
            </div>

            {wordDataList[currentWordIndex]?.meanings && (
              <div className="space-y-4">
                {wordDataList[currentWordIndex].meanings.map((meaning: any, idx: number) => {
                  // 레벨별 예문 가져오기
                  const levelExamples = getExamplesByLevel(meaning.examples, userProfile.englishLevel);
                  // 관심분야별 예문 가져오기
                  const studyFieldExamples = getExamplesByStudyFields(meaning.examples, userProfile.studyFields);
                  
                  return (
                  <div key={idx} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0 relative">
                    <div className="font-semibold text-gray-700 mb-2">
                      {meaning.definition}
                    </div>
                      
                      {/* 레벨별 예문 표시 */}
                      {levelExamples && levelExamples.length > 0 && (
                        <div className="text-sm text-gray-600 space-y-1 mt-2">
                          {levelExamples.map((example: string, exIdx: number) => (
                          <div key={exIdx} className="italic">
                            {example}
                          </div>
                        ))}
                      </div>
                    )}
                      
                      {/* 관심분야별 예문 표시 */}
                      {studyFieldExamples.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {studyFieldExamples.map((fieldData, fieldIdx) => {
                            const fieldName = getStudyFieldName(fieldData.field);
                            const fieldColor = fieldData.field === 'KSAT' 
                              ? 'text-purple-600' 
                              : fieldData.field === 'Toeic'
                                ? 'text-cyan-600'
                                : 'text-emerald-600';
                            
                            return (
                              <div key={fieldIdx} className="space-y-1">
                                <div className={`text-xs font-semibold ${fieldColor}`}>
                                  {fieldName}
                                </div>
                                {fieldData.examples.map((example: string, exIdx: number) => (
                                  <div key={exIdx} className="text-sm text-gray-600 italic ml-2">
                                    {example}
                  </div>
                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {wordDataList.length > 1 && (
              <div className="flex justify-between mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={onPreviousWord}
                  disabled={currentWordIndex === 0}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
                >
                  ← 이전
                </button>
                <button
                  onClick={onNextWord}
                  disabled={currentWordIndex === wordDataList.length - 1}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
                >
                  다음 →
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

