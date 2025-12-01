'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';

export interface AddToFlashcardModalProps {
  word: string;
  meaning: any;
  pronunciation?: string;
  onClose: () => void;
  onSave: (groupId: string, difficulty: string) => Promise<void>;
  isSaving: boolean;
}

export default function AddToFlashcardModal({
  word,
  meaning,
  pronunciation,
  onClose,
  onSave,
  isSaving
}: AddToFlashcardModalProps) {
  const { user } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('normal');
  const [existingGroups, setExistingGroups] = useState<any[]>([]);
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDate, setNewGroupDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);

  useEffect(() => {
    loadGroups();
  }, [user]);

  const loadGroups = async () => {
    try {
      if (!user || !user.uid) {
        setIsLoadingGroups(false);
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const groups = (userData.groups || []) as any[];

        const sortedGroups = groups
          .map((group) => ({
            id: group.id || '',
            name: group.name || '',
            date: group.date || ''
          }))
          .filter((g) => g.id !== '')
          .sort((a, b) => {
            // 최신순 정렬
            return b.date.localeCompare(a.date);
          });

        setExistingGroups(sortedGroups);

        // 마지막 선택 그룹이 있으면 선택
        const lastSelectedGroupId = localStorage.getItem('last_selected_group_id');
        if (lastSelectedGroupId && sortedGroups.some((g) => g.id === lastSelectedGroupId)) {
          setSelectedGroupId(lastSelectedGroupId);
        } else if (sortedGroups.length > 0) {
          setSelectedGroupId(sortedGroups[0].id);
        }
      }
    } catch (error) {
      console.error('그룹 로드 실패:', error);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      alert('그룹 이름을 입력해주세요.');
      return;
    }

    try {
      if (!user || !user.uid) {
        alert('로그인이 필요합니다.');
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      const groups = (userData.groups || []) as any[];

      const newGroupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newGroup = {
        id: newGroupId,
        name: newGroupName.trim(),
        date: newGroupDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      groups.push(newGroup);

      await setDoc(userDocRef, { groups }, { merge: true });

      setExistingGroups([newGroup, ...existingGroups]);
      setSelectedGroupId(newGroupId);
      setIsCreatingNewGroup(false);
      setNewGroupName('');
      setNewGroupDate(new Date().toISOString().split('T')[0]);
    } catch (error) {
      console.error('그룹 생성 실패:', error);
      alert('그룹 생성 중 오류가 발생했습니다.');
    }
  };

  const handleSave = async () => {
    if (!selectedGroupId) {
      alert('그룹을 선택해주세요.');
      return;
    }

    // 마지막 선택 그룹 저장
    localStorage.setItem('last_selected_group_id', selectedGroupId);

    await onSave(selectedGroupId, selectedDifficulty);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[250] p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-green-500 to-emerald-600 bg-clip-text text-transparent">
              단어장에 추가
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
          {/* 단어 정보 */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm font-semibold text-gray-700 mb-1">단어</div>
            <div className="text-lg font-bold text-gray-900">{word}</div>
            {pronunciation && (
              <div className="text-sm text-gray-600 mt-1">{pronunciation}</div>
            )}
            <div className="text-sm text-gray-600 mt-2 italic">
              {meaning.definition}
            </div>
          </div>

          {/* 그룹 선택 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              그룹 선택
            </label>
            {isLoadingGroups ? (
              <div className="text-center py-4 text-gray-500">그룹 로딩 중...</div>
            ) : (
              <>
                {!isCreatingNewGroup ? (
                  <>
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">그룹을 선택하세요</option>
                      {existingGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} {group.date ? `(${group.date})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setIsCreatingNewGroup(true)}
                      className="w-full mt-3 px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      + 새 그룹 만들기
                    </button>
                  </>
                ) : (
                  <div className="space-y-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        그룹 이름
                      </label>
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                        placeholder="예: 토익 단어, 2024-01-15 단어장"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        날짜
                      </label>
                      <input
                        type="date"
                        value={newGroupDate}
                        onChange={(e) => setNewGroupDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateGroup}
                        disabled={!newGroupName.trim()}
                        className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        생성
                      </button>
                      <button
                        onClick={() => {
                          setIsCreatingNewGroup(false);
                          setNewGroupName('');
                          setNewGroupDate(new Date().toISOString().split('T')[0]);
                        }}
                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold text-sm"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 난이도 선택 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              난이도
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'easy', label: '쉬움', color: 'bg-green-100 text-green-700 border-green-300' },
                { value: 'normal', label: '보통', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
                { value: 'hard', label: '어려움', color: 'bg-red-100 text-red-700 border-red-300' }
              ].map((difficulty) => (
                <button
                  key={difficulty.value}
                  onClick={() => setSelectedDifficulty(difficulty.value)}
                  className={`px-4 py-3 rounded-lg border-2 font-semibold text-sm transition-all ${
                    selectedDifficulty === difficulty.value
                      ? `${difficulty.color} ring-2 ring-offset-2`
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {difficulty.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
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
              disabled={isSaving || !selectedGroupId}
              className="px-6 py-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

