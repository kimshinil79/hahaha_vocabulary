'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import PublicGroupImportModal from './PublicGroupImportModal';

interface FlashcardGroupSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (groupId: string | null, groupName: string | null) => void;
  user: any;
  currentSelectedGroupId?: string | null; // 현재 선택된 그룹 ID
  showImportButton?: boolean; // 외부 단어장 가져오기 버튼 표시 여부
}

export default function FlashcardGroupSelectionModal({
  isOpen,
  onClose,
  onSelect,
  user,
  currentSelectedGroupId,
  showImportButton = false
}: FlashcardGroupSelectionModalProps) {
  const [groups, setGroups] = useState<any[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDate, setNewGroupDate] = useState(new Date().toISOString().split('T')[0]);
  const [isPublic, setIsPublic] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // 그룹 목록 가져오기
  useEffect(() => {
    if (!isOpen || !user) {
      setGroups([]);
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
          const groupsData = (userData.groups || []) as any[];

          const validGroups = groupsData
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

          setGroups(validGroups);

          // 현재 선택된 그룹 ID가 있으면 그것을 사용, 없으면 localStorage에서 로드
          if (currentSelectedGroupId !== undefined) {
            // currentSelectedGroupId가 null이면 "모든 그룹" 선택
            // currentSelectedGroupId가 문자열이면 해당 그룹 선택
            setSelectedGroupId(currentSelectedGroupId);
          } else {
            // currentSelectedGroupId가 전달되지 않았을 때만 localStorage 사용
            const lastSelectedGroupId = localStorage.getItem('last_selected_group_id');
            if (lastSelectedGroupId && validGroups.some((g) => g.id === lastSelectedGroupId)) {
              setSelectedGroupId(lastSelectedGroupId);
            }
          }
        } else {
          setGroups([]);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('그룹 로드 실패:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, user, currentSelectedGroupId]);

  // 검색 필터링
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredGroups(groups);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredGroups(
        groups.filter((group) => group.name.toLowerCase().includes(query))
      );
    }
  }, [groups, searchQuery]);

  const handleSelectGroup = (groupId: string | null, groupName: string | null) => {
    if (groupId) {
      localStorage.setItem('last_selected_group_id', groupId);
    }
    onSelect(groupId, groupName);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      alert('그룹 이름을 입력해주세요.');
      return;
    }

    if (!user || !user.uid) {
      alert('로그인이 필요합니다.');
      return;
    }

    setIsCreating(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      const groups = (userData.groups || []) as any[];

      const newGroupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newGroup = {
        id: newGroupId,
        name: newGroupName.trim(),
        date: newGroupDate,
        isPublic: isPublic,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      groups.push(newGroup);

      await setDoc(userDocRef, { groups }, { merge: true });

      // 새로 생성한 그룹 선택
      localStorage.setItem('last_selected_group_id', newGroupId);
      setSelectedGroupId(newGroupId);
      setIsCreatingNewGroup(false);
      setNewGroupName('');
      setNewGroupDate(new Date().toISOString().split('T')[0]);
      setIsPublic(false);
      
      // 그룹 선택 완료
      handleSelectGroup(newGroupId, newGroup.name);
    } catch (error) {
      console.error('그룹 생성 실패:', error);
      alert('그룹 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800">그룹 선택</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>

          {/* 검색 필드 및 외부 단어장 가져오기 버튼 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="그룹 이름으로 검색..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            {showImportButton && (
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all font-semibold text-sm whitespace-nowrap flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                외부 단어장 가져오기
              </button>
            )}
          </div>
        </div>

        {/* 그룹 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* 새 그룹 생성 섹션 */}
              {isCreatingNewGroup ? (
                <div className="p-4 bg-indigo-50 border-2 border-indigo-300 rounded-xl space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      그룹 이름 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="예: 2024-01-15 단어장"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreating}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      날짜
                    </label>
                    <input
                      type="date"
                      value={newGroupDate}
                      onChange={(e) => setNewGroupDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      disabled={isCreating}
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        disabled={isCreating}
                        className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm font-semibold text-gray-700">
                        공개 그룹
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-7">
                      공개 그룹은 다른 사용자들이 볼 수 있습니다
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsCreatingNewGroup(false);
                        setNewGroupName('');
                        setNewGroupDate(new Date().toISOString().split('T')[0]);
                        setIsPublic(false);
                      }}
                      disabled={isCreating}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleCreateGroup}
                      disabled={isCreating || !newGroupName.trim()}
                      className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreating ? '생성 중...' : '생성'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 새 그룹 생성 버튼 */}
                  <button
                    onClick={() => setIsCreatingNewGroup(true)}
                    className="w-full p-4 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 hover:bg-indigo-100 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-200 rounded-lg">
                        <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-indigo-700">
                          새 그룹 만들기
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* 모든 그룹 옵션 */}
                  <button
                    onClick={() => handleSelectGroup(null, null)}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      selectedGroupId === null
                        ? 'bg-indigo-50 border-indigo-500'
                        : 'bg-white border-indigo-200 hover:bg-indigo-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className={`font-semibold ${selectedGroupId === null ? 'text-indigo-700' : 'text-gray-800'}`}>
                          모든 그룹
                        </div>
                      </div>
                      {selectedGroupId === null && (
                        <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                </>
              )}

              {/* 그룹 목록 */}
              {filteredGroups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {searchQuery
                    ? `"${searchQuery}"에 해당하는 그룹이 없습니다.`
                    : '그룹이 없습니다.\n새 그룹을 생성해주세요.'}
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const isSelected = selectedGroupId === group.id;
                  const displayDate = group.date
                    ? new Date(group.date).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      })
                    : '';

                  return (
                    <button
                      key={group.id}
                      onClick={() => handleSelectGroup(group.id, group.name)}
                      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-500'
                          : 'bg-white border-indigo-200 hover:bg-indigo-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                          <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className={`font-semibold ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                            {group.name || '이름 없음'}
                          </div>
                          {displayDate && (
                            <div className="text-xs text-gray-500 mt-1">{displayDate}</div>
                          )}
                        </div>
                        {isSelected && (
                          <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
          >
            취소
          </button>
        </div>
      </div>

      {/* 외부 단어장 가져오기 모달 */}
      {isImportModalOpen && user && (
        <PublicGroupImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          user={user}
          onImportComplete={() => {
            // 그룹 목록이 자동으로 업데이트됨 (onSnapshot이 실시간으로 감지)
          }}
        />
      )}
    </div>
  );
}

