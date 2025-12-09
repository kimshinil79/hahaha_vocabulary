'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { getExamplesByLevel, getExamplesByStudyFields, getStudyFieldName } from '@/utils/wordUtils';

export interface WordEditModalProps {
  wordData: any;
  source: 'clicked' | 'list';
  onClose: () => void;
  onSave: (updatedWordData: any) => Promise<void>;
  isSaving: boolean;
  onDelete?: () => Promise<void>; // 단어장에서 삭제 함수 (optional)
}

export default function WordEditModal({
  wordData,
  source,
  onClose,
  onSave,
  isSaving,
  onDelete
}: WordEditModalProps) {
  const { user } = useAuth();
  const [word, setWord] = useState(wordData?.word || '');
  const [pronunciation, setPronunciation] = useState(wordData?.pronunciation || '');
  const [meanings, setMeanings] = useState<any[]>(wordData?.meanings ? [...wordData.meanings] : []);
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

  useEffect(() => {
    if (wordData) {
      setWord(wordData.word || '');
      setPronunciation(wordData.pronunciation || '');
      setMeanings(wordData.meanings ? [...wordData.meanings] : []);
    }
  }, [wordData]);

  const handleExampleChange = (meaningIndex: number, exampleIndex: number, value: string) => {
    const updatedMeanings = [...meanings];
    if (!updatedMeanings[meaningIndex].examples) {
      updatedMeanings[meaningIndex].examples = [];
    }
    updatedMeanings[meaningIndex].examples[exampleIndex] = value;
    setMeanings(updatedMeanings);
  };

  const handleAddExample = (meaningIndex: number) => {
    const updatedMeanings = [...meanings];
    if (!updatedMeanings[meaningIndex].examples) {
      updatedMeanings[meaningIndex].examples = [];
    }
    updatedMeanings[meaningIndex].examples.push('');
    setMeanings(updatedMeanings);
  };

  const handleRemoveExample = (meaningIndex: number, exampleIndex: number) => {
    const updatedMeanings = [...meanings];
    if (updatedMeanings[meaningIndex].examples) {
      updatedMeanings[meaningIndex].examples = updatedMeanings[meaningIndex].examples.filter(
        (_: any, idx: number) => idx !== exampleIndex
      );
    }
    setMeanings(updatedMeanings);
  };

  const handleSave = async () => {
    if (!word.trim()) {
      alert('단어를 입력해주세요.');
      return;
    }

    const updatedWordData = {
      ...wordData,
      word: word.trim(),
      pronunciation: pronunciation.trim(),
      meanings: meanings,
      updatedAt: new Date().toISOString()
    };

    await onSave(updatedWordData);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    const confirmDelete = window.confirm(`"${word}" 단어를 단어장에서 삭제하시겠습니까?`);
    if (!confirmDelete) return;

    try {
      await onDelete();
      onClose();
    } catch (error) {
      console.error('단어 삭제 오류:', error);
      alert('단어 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              단어 수정
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {/* 단어 스펠링 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              단어 스펠링
            </label>
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="단어를 입력하세요"
            />
          </div>

          {/* 발음기호 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              발음기호
            </label>
            <input
              type="text"
              value={pronunciation}
              onChange={(e) => setPronunciation(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="발음기호를 입력하세요 (예: /əˈkɑːnɪdʒ/)"
            />
          </div>

          {/* 각 뜻의 예문 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-4">
              예문 (각 뜻별로 수정 가능)
            </label>
            <div className="space-y-6">
              {meanings.map((meaning, meaningIndex) => (
                <div key={meaningIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-gray-700 mb-1">
                      뜻 {meaningIndex + 1}
                    </div>
                    <div className="text-sm text-gray-600 italic">
                      {meaning.definition}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {(() => {
                      // 레벨별 예문 가져오기
                      const levelExamples = getExamplesByLevel(meaning.examples, userProfile.englishLevel);
                      // 관심분야별 예문 가져오기
                      const studyFieldExamples = getExamplesByStudyFields(meaning.examples, userProfile.studyFields);
                      
                      return (
                        <>
                          {/* 레벨별 예문 표시 */}
                          {levelExamples && levelExamples.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-gray-600 mb-2">
                                예문:
                              </div>
                              {levelExamples.map((example: string, exampleIndex: number) => (
                                <div key={exampleIndex} className="text-sm text-gray-700 italic bg-white p-3 rounded-lg border border-gray-200">
                                  {example}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* 관심분야별 예문 표시 */}
                          {studyFieldExamples.length > 0 && (
                            <div className="space-y-3">
                              {studyFieldExamples.map((fieldData, fieldIdx) => {
                                const fieldName = getStudyFieldName(fieldData.field);
                                const fieldColor = fieldData.field === 'KSAT' 
                                  ? 'text-purple-600' 
                                  : fieldData.field === 'Toeic'
                                    ? 'text-cyan-600'
                                    : 'text-emerald-600';
                                
                                return (
                                  <div key={fieldIdx} className="space-y-2">
                                    <div className={`text-xs font-semibold ${fieldColor} mb-2`}>
                                      {fieldName} 예문:
                                    </div>
                                    {fieldData.examples.map((example: string, exIndex: number) => (
                                      <div key={exIndex} className="text-sm text-gray-700 italic bg-white p-3 rounded-lg border border-gray-200">
                                        {example}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          
                          {/* 예문이 없는 경우 */}
                          {(!levelExamples || levelExamples.length === 0) && studyFieldExamples.length === 0 && (
                            <div className="text-sm text-gray-400 italic">예문이 없습니다</div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex flex-col gap-3">
            {/* 삭제 버튼 (가장 아래) */}
            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className="w-full px-6 py-2 rounded-full bg-red-50 text-red-600 hover:bg-red-100 border-2 border-red-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                단어장에서 삭제
              </button>
            )}
            
            {/* 저장/취소 버튼 */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !word.trim()}
                className="px-6 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

