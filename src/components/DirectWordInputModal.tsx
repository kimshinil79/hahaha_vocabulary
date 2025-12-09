'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import FlashcardGroupSelectionModal from './FlashcardGroupSelectionModal';

interface DirectWordInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean; // 페이지에 embedded 모드로 표시할지 여부
}

export default function DirectWordInputModal({ isOpen, onClose, embedded = false }: DirectWordInputModalProps) {
  const { user } = useAuth();
  const [englishWord, setEnglishWord] = useState(''); // 영어 단어
  const [koreanMeaning, setKoreanMeaning] = useState(''); // 한글 뜻
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const [isGroupSelectionOpen, setIsGroupSelectionOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user) {
      setError('로그인이 필요합니다.');
      return;
    }

    if (!englishWord.trim() || !koreanMeaning.trim()) {
      setError('영어 단어와 한글 뜻을 모두 입력해주세요.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const uid = user.uid;
      const userDocRef = doc(db, 'users', uid);
      
      // 기존 flashcards 가져오기
      const userDocSnap = await getDoc(userDocRef);
      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      const flashcards = (userData.flashcards || []) as any[];
      
      // 중복 체크 (같은 단어가 있는지)
      const existingIndex = flashcards.findIndex((card: any) => 
        card.word.toLowerCase() === englishWord.trim().toLowerCase()
      );
      
      const now = new Date().toISOString();
      
      // flashcard 데이터 생성
      const flashcardData: any = {
        word: englishWord.trim(),
        pronunciation: '', // 직접 입력에서는 발음 기호 없음
        meaning: {
          definition: koreanMeaning.trim(), // 한글 뜻을 definition으로 사용
          pos: [],
          examples: []
        },
        difficulty: difficulty,
        viewCount: 0,
        createdAt: now,
        updatedAt: now,
        lastReviewedAt: null,
        nextReviewDate: null,
        level: 0,
      };
      
      // 그룹이 선택된 경우
      if (selectedGroupId) {
        if (existingIndex >= 0) {
          // 기존 단어가 있으면 groups 배열에 추가
          const existingCard = flashcards[existingIndex];
          const groups: string[] = existingCard.groups ? [...existingCard.groups] : [];
          if (!groups.includes(selectedGroupId)) {
            groups.push(selectedGroupId);
          }
          flashcardData.groups = groups;
          flashcardData.createdAt = existingCard.createdAt; // 기존 생성 시간 유지
          flashcardData.viewCount = existingCard.viewCount || 0;
          flashcardData.lastReviewedAt = existingCard.lastReviewedAt || null;
          flashcardData.nextReviewDate = existingCard.nextReviewDate || null;
          flashcardData.level = existingCard.level || 0;
          flashcards[existingIndex] = flashcardData;
        } else {
          // 새 단어 추가
          flashcardData.groups = [selectedGroupId];
          flashcards.push(flashcardData);
        }
      } else {
        // 그룹이 선택되지 않은 경우
        if (existingIndex >= 0) {
          setError('이미 단어장에 있는 단어입니다.');
          setIsSaving(false);
          return;
        }
        flashcards.push(flashcardData);
      }
      
      // Firestore에 저장
      await setDoc(userDocRef, { flashcards }, { merge: true });
      
      setSuccess('단어장에 추가되었습니다!');
      setEnglishWord('');
      setKoreanMeaning('');
      
      // 1.5초 후 성공 메시지 지우기
      setTimeout(() => {
        setSuccess(null);
      }, 1500);
    } catch (err) {
      console.error('저장 오류:', err);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setEnglishWord('');
    setKoreanMeaning('');
    setDifficulty('normal');
    setError(null);
    setSuccess(null);
    onClose();
  };

  const handleGroupSelect = (groupId: string | null, groupName: string | null) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setIsGroupSelectionOpen(false);
  };

  if (!isOpen) return null;

  const contentComponent = (
    <div className={`bg-white ${embedded ? 'h-full rounded-none' : 'rounded-2xl shadow-xl ring-1 ring-black/5'} w-full ${embedded ? '' : 'max-w-md'} overflow-hidden flex flex-col`}>
          {/* 헤더 */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-extrabold bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                직접 입력
              </h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              영어 단어와 한글 뜻을 입력하세요.
            </p>
          </div>

          {/* 메인 콘텐츠 */}
          <div className="p-6 space-y-5">
            {/* 상태 메시지 */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-green-700 text-sm font-medium">
                {success}
              </div>
            )}

            {/* 영어 단어 입력 */}
            <div>
              <label htmlFor="englishWord" className="block text-sm font-semibold text-gray-700 mb-2">
                영어 <span className="text-red-500">*</span>
              </label>
              <input
                id="englishWord"
                type="text"
                value={englishWord}
                onChange={(e) => setEnglishWord(e.target.value)}
                placeholder="예: apple"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                disabled={isSaving}
              />
            </div>

            {/* 한글 뜻 입력 */}
            <div>
              <label htmlFor="koreanMeaning" className="block text-sm font-semibold text-gray-700 mb-2">
                한글<span className="text-red-500">*</span>
              </label>
              <input
                id="koreanMeaning"
                type="text"
                value={koreanMeaning}
                onChange={(e) => setKoreanMeaning(e.target.value)}
                placeholder="예: 사과"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                disabled={isSaving}
              />
            </div>

            {/* 난이도 선택과 그룹 선택 */}
            <div className="flex gap-4">
              {/* 난이도 선택 */}
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  난이도
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDifficulty('easy')}
                    disabled={isSaving}
                    className={`flex-1 px-3 py-2.5 rounded-xl font-medium text-xs transition-all ${
                      difficulty === 'easy'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    쉬움
                  </button>
                  <button
                    onClick={() => setDifficulty('normal')}
                    disabled={isSaving}
                    className={`flex-1 px-3 py-2.5 rounded-xl font-medium text-xs transition-all ${
                      difficulty === 'normal'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    보통
                  </button>
                  <button
                    onClick={() => setDifficulty('hard')}
                    disabled={isSaving}
                    className={`flex-1 px-3 py-2.5 rounded-xl font-medium text-xs transition-all ${
                      difficulty === 'hard'
                        ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    어려움
                  </button>
                </div>
              </div>

              {/* 그룹 선택 */}
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  그룹
                </label>
                <button
                  onClick={() => setIsGroupSelectionOpen(true)}
                  disabled={isSaving}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedGroupName ? (
                    <span className="text-gray-800 font-medium text-sm">{selectedGroupName}</span>
                  ) : (
                    <span className="text-gray-400 text-sm">그룹 선택</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 푸터 */}
          <div className="p-6 border-t border-gray-100 flex gap-3">
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="flex-1 px-6 py-3 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !englishWord.trim() || !koreanMeaning.trim()}
              className="flex-1 px-6 py-3 rounded-xl text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
  );

  if (embedded) {
    return (
      <>
        {contentComponent}
        {/* 그룹 선택 모달 */}
        {isGroupSelectionOpen && user && (
          <FlashcardGroupSelectionModal
            isOpen={isGroupSelectionOpen}
            onClose={() => setIsGroupSelectionOpen(false)}
            onSelect={handleGroupSelect}
            user={user}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
        {contentComponent}
      </div>

      {/* 그룹 선택 모달 */}
      {isGroupSelectionOpen && user && (
        <FlashcardGroupSelectionModal
          isOpen={isGroupSelectionOpen}
          onClose={() => setIsGroupSelectionOpen(false)}
          onSelect={handleGroupSelect}
          user={user}
        />
      )}
    </>
  );
}
