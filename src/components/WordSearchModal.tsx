'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { doc, getDoc, collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { addMeaningToWordsAndFlashcard } from '@/utils/wordFirebase';
import { getExamplesByLevel, getExamplesByStudyFields, getStudyFieldName } from '@/utils/wordUtils';
import AddToFlashcardModal from '@/components/AddToFlashcardModal';

interface WordSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

export default function WordSearchModal({ isOpen, onClose, user }: WordSearchModalProps) {
  const { user: authUser } = useAuth();
  const [wordSearchTerm, setWordSearchTerm] = useState('');
  const [wordSearchResult, setWordSearchResult] = useState<any | null>(null);
  const [wordSearchCandidates, setWordSearchCandidates] = useState<any[]>([]); // 부분 일치 검색 결과 목록
  const [isWordSearchLoading, setIsWordSearchLoading] = useState(false);
  const [wordSearchError, setWordSearchError] = useState<string | null>(null);
  const wordSearchInputRef = useRef<HTMLInputElement>(null);
  const [addingToFlashcardFromSearch, setAddingToFlashcardFromSearch] = useState<{ word: string; meaning: any; pronunciation?: string } | null>(null);
  const [isSavingToFlashcard, setIsSavingToFlashcard] = useState(false);
  const [userProfile, setUserProfile] = useState<{ englishLevel?: string; studyFields?: string[] }>({});

  // 사용자 프로필 정보 로드
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!authUser) return;
      
      try {
        const userDocRef = doc(db, 'users', authUser.uid);
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
    
    if (authUser) {
      loadUserProfile();
    }
  }, [authUser]);

  // 모달이 열릴 때 자동 포커싱
  useEffect(() => {
    if (isOpen && wordSearchInputRef.current) {
      // 약간의 지연을 두어 모달이 완전히 렌더링된 후 포커싱
      setTimeout(() => {
        wordSearchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setWordSearchTerm('');
      setWordSearchResult(null);
      setWordSearchCandidates([]);
      setWordSearchError(null);
      setIsWordSearchLoading(false);
      setAddingToFlashcardFromSearch(null);
    }
  }, [isOpen]);

  // 부분 일치 검색 함수
  const searchPartialMatch = async (searchText: string): Promise<any[]> => {
    if (searchText.length < 2) {
      return []; // 너무 짧은 검색어는 제외
    }

    try {
      const wordsRef = collection(db, 'words');
      // Firestore는 documentId로 직접 쿼리할 수 없으므로,
      // 모든 문서를 가져와서 클라이언트 측에서 필터링
      // 하지만 성능을 위해 제한을 둠
      const q = query(wordsRef, limit(1000)); // 최대 1000개까지만 가져오기
      const querySnapshot = await getDocs(q);

      const matchingDocs: any[] = [];
      const searchLower = searchText.toLowerCase();

      querySnapshot.forEach((doc) => {
        const docId = doc.id.toLowerCase();
        const data = doc.data();
        const word = (data.word || doc.id).toLowerCase();

        // 검색어가 포함된 단어 찾기
        if (docId.includes(searchLower) || word.includes(searchLower)) {
          matchingDocs.push({
            id: doc.id,
            word: data.word || doc.id,
            ...data
          });
        }
      });

      // 검색어로 시작하는 단어를 우선순위로 정렬
      matchingDocs.sort((a, b) => {
        const aId = a.id.toLowerCase();
        const bId = b.id.toLowerCase();
        const aWord = a.word.toLowerCase();
        const bWord = b.word.toLowerCase();
        
        const aStartsWith = aId.startsWith(searchLower) || aWord.startsWith(searchLower);
        const bStartsWith = bId.startsWith(searchLower) || bWord.startsWith(searchLower);
        
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return aId.localeCompare(bId);
      });

      return matchingDocs.slice(0, 50); // 최대 50개까지만 반환
    } catch (error) {
      console.error('부분 일치 검색 오류:', error);
      return [];
    }
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
    setWordSearchCandidates([]);

    try {
      const targetWord = trimmedTerm.toLowerCase();
      
      // 1. 정확히 일치하는 단어 먼저 검색
      const wordDocRef = doc(db, 'words', targetWord);
      const wordDocSnap = await getDoc(wordDocRef);

      if (wordDocSnap.exists()) {
        const data = wordDocSnap.data();
        setWordSearchResult({ word: targetWord, ...data });
        setIsWordSearchLoading(false);
        return;
      }

      // 2. 부분 일치 검색
      const matchingWords = await searchPartialMatch(targetWord);
      
      if (matchingWords.length === 0) {
        setWordSearchError('해당 단어를 찾을 수 없습니다.');
      } else if (matchingWords.length === 1) {
        // 하나만 찾았으면 바로 표시
        const wordData = matchingWords[0];
        setWordSearchResult({ word: wordData.word || wordData.id, ...wordData });
      } else {
        // 여러 개 찾았으면 목록 표시
        setWordSearchCandidates(matchingWords);
      }
    } catch (error) {
      console.error('단어 검색 오류:', error);
      setWordSearchError(error instanceof Error ? error.message : '단어 검색 중 오류가 발생했습니다.');
    } finally {
      setIsWordSearchLoading(false);
    }
  };

  // 후보 단어 선택 핸들러
  const handleSelectWordCandidate = (wordData: any) => {
    setWordSearchResult({ word: wordData.word || wordData.id, ...wordData });
    setWordSearchCandidates([]);
  };

  // 단어장에 추가 핸들러 (검색 결과에서)
  const handleAddToFlashcardFromSearch = (meaning: any) => {
    if (!wordSearchResult) return;
    setAddingToFlashcardFromSearch({
      word: wordSearchResult.word || wordSearchTerm.trim().toLowerCase(),
      meaning: meaning,
      pronunciation: wordSearchResult.pronunciation
    });
  };

  // 검색 결과에서 단어장에 저장
  const handleSaveToFlashcardFromSearch = async (groupId: string, difficulty: string) => {
    if (!user || !addingToFlashcardFromSearch) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    try {
      setIsSavingToFlashcard(true);
      const result = await addMeaningToWordsAndFlashcard(
        user,
        addingToFlashcardFromSearch.word,
        addingToFlashcardFromSearch.meaning,
        addingToFlashcardFromSearch.pronunciation,
        groupId,
        difficulty
      );
      
      // 저장 여부에 따라 메시지 표시
      if (result.saved) {
        // 모달 자동 닫기
        setAddingToFlashcardFromSearch(null);
      } else {
        // 이미 있는 경우 알림만 표시하고 모달은 유지
        alert(result.message);
      }
    } catch (error) {
      console.error('저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingToFlashcard(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
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
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>

          <div className="p-6 border-b border-gray-100">
            <form onSubmit={handleWordSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                ref={wordSearchInputRef}
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
            ) : wordSearchCandidates.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-4">
                  {wordSearchCandidates.length}개의 유사한 단어를 찾았습니다. 선택해주세요:
                </p>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {wordSearchCandidates.map((wordData, index) => (
                    <button
                      key={wordData.id || index}
                      onClick={() => handleSelectWordCandidate(wordData)}
                      className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-slate-500 hover:bg-slate-50 transition-all"
                    >
                      <div className="font-semibold text-gray-900">
                        {wordData.word || wordData.id}
                      </div>
                      {wordData.pronunciation && (
                        <div className="text-sm text-gray-500 mt-1 italic">
                          {wordData.pronunciation}
                        </div>
                      )}
                      {Array.isArray(wordData.pos) && wordData.pos.length > 0 && (
                        <div className="text-xs text-gray-400 mt-1">
                          {wordData.pos.join(', ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
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

                      // 레벨별 예문 가져오기
                      const levelExamples = getExamplesByLevel(meaning.examples, userProfile.englishLevel);
                      // 관심분야별 예문 가져오기
                      const studyFieldExamples = getExamplesByStudyFields(meaning.examples, userProfile.studyFields);
                      
                      return (
                        <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-slate-50 shadow-sm relative">
                          <div className="text-gray-800 font-semibold text-base sm:text-lg">
                            {renderDefinition()}
                          </div>
                          
                          {/* 레벨별 예문 표시 */}
                          {levelExamples && levelExamples.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold text-gray-500">예문</p>
                              {levelExamples.map((example: string, exIdx: number) => (
                                <div key={exIdx}>
                                  {renderExample(example)}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* 관심분야별 예문 표시 */}
                          {studyFieldExamples.length > 0 && (
                            <div className="mt-3 space-y-3">
                              {studyFieldExamples.map((fieldData, fieldIdx) => {
                                const fieldName = getStudyFieldName(fieldData.field);
                                const fieldColor = fieldData.field === 'KSAT' 
                                  ? 'text-purple-600' 
                                  : fieldData.field === 'Toeic'
                                    ? 'text-cyan-600'
                                    : 'text-emerald-600';
                                
                                return (
                                  <div key={fieldIdx} className="space-y-1">
                                    <p className={`text-xs font-semibold ${fieldColor}`}>
                                      {fieldName}
                                    </p>
                                    {fieldData.examples.map((example: string, exIdx: number) => (
                                      <div key={exIdx}>
                                        {renderExample(example)}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
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
                          {/* 단어장 추가 버튼 */}
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={() => handleAddToFlashcardFromSearch(meaning)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-sm hover:shadow-md transition-all"
                            >
                              단어장 추가
                            </button>
                          </div>
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

      {/* 단어장에 추가 모달 (검색 결과에서) */}
      {addingToFlashcardFromSearch && (
        <AddToFlashcardModal
          word={addingToFlashcardFromSearch.word}
          meaning={addingToFlashcardFromSearch.meaning}
          pronunciation={addingToFlashcardFromSearch.pronunciation}
          onClose={() => setAddingToFlashcardFromSearch(null)}
          onSave={handleSaveToFlashcardFromSearch}
          isSaving={isSavingToFlashcard}
        />
      )}
    </>
  );
}

