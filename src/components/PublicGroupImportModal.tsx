'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PublicGroup {
  id: string;
  name: string;
  date: string;
  ownerId: string;
  ownerNickname?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PublicGroupImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onImportComplete: () => void;
}

export default function PublicGroupImportModal({
  isOpen,
  onClose,
  user,
  onImportComplete
}: PublicGroupImportModalProps) {
  const [publicGroups, setPublicGroups] = useState<PublicGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 공개 그룹 목록 가져오기
  useEffect(() => {
    if (!isOpen || !user) {
      setPublicGroups([]);
      setIsLoading(false);
      return;
    }

    const loadPublicGroups = async () => {
      setIsLoading(true);
      try {
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        const allPublicGroups: PublicGroup[] = [];

        for (const userDoc of usersSnapshot.docs) {
          // 자기 자신의 그룹은 제외
          if (userDoc.id === user.uid) continue;

          const userData = userDoc.data();
          const groups = (userData.groups || []) as any[];
          
          // 공개 그룹만 필터링
          const publicGroupsFromUser = groups
            .filter((group: any) => group.isPublic === true && group.id)
            .map((group: any) => ({
              id: group.id,
              name: group.name || '',
              date: group.date || '',
              ownerId: userDoc.id,
              ownerNickname: userData.nickname || '익명',
              createdAt: group.createdAt,
              updatedAt: group.updatedAt
            }));

          allPublicGroups.push(...publicGroupsFromUser);
        }

        // 이름순으로 정렬
        allPublicGroups.sort((a, b) => a.name.localeCompare(b.name));
        setPublicGroups(allPublicGroups);
      } catch (error) {
        console.error('공개 그룹 로드 실패:', error);
        alert('공개 그룹 목록을 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadPublicGroups();
  }, [isOpen, user]);

  // 검색 필터링
  const filteredGroups = publicGroups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.ownerNickname?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleGroup = (groupId: string) => {
    const newSelected = new Set(selectedGroupIds);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroupIds(newSelected);
  };

  const handleImport = async () => {
    if (selectedGroupIds.size === 0) {
      alert('가져올 그룹을 선택해주세요.');
      return;
    }

    if (!user || !user.uid) {
      alert('로그인이 필요합니다.');
      return;
    }

    setIsImporting(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      
      const myGroups = (userData.groups || []) as any[];
      const myFlashcards = (userData.flashcards || []) as any[];

      // 선택한 그룹들을 가져오기
      for (const groupId of selectedGroupIds) {
        const group = publicGroups.find((g) => g.id === groupId);
        if (!group) continue;

        // 원본 그룹 소유자의 단어들 가져오기
        const ownerDocRef = doc(db, 'users', group.ownerId);
        const ownerDocSnap = await getDoc(ownerDocRef);
        
        if (!ownerDocSnap.exists()) continue;

        const ownerData = ownerDocSnap.data();
        const ownerFlashcards = (ownerData.flashcards || []) as any[];

        // 해당 그룹에 속한 단어들 필터링
        const groupWords = ownerFlashcards.filter((flashcard: any) => {
          const groups = flashcard.groups || [];
          return groups.includes(groupId);
        });

        // 새 그룹 ID 생성 (중복 방지)
        const newGroupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 새 그룹 추가
        const newGroup = {
          id: newGroupId,
          name: `${group.name} (가져온 그룹)`,
          date: group.date || new Date().toISOString().split('T')[0],
          isPublic: false, // 가져온 그룹은 기본적으로 비공개
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        myGroups.push(newGroup);

        // 단어들을 내 단어장에 추가
        for (const word of groupWords) {
          const wordLower = word.word?.toLowerCase() || '';
          if (!wordLower) continue;

          // 기존에 같은 단어가 있는지 확인
          const existingWordIndex = myFlashcards.findIndex(
            (f: any) => f.word?.toLowerCase() === wordLower
          );

          if (existingWordIndex >= 0) {
            // 기존 단어가 있으면 groups 배열에 새 그룹 ID 추가
            const existingWord = myFlashcards[existingWordIndex];
            const existingGroups = existingWord.groups || [];
            if (!existingGroups.includes(newGroupId)) {
              existingGroups.push(newGroupId);
              myFlashcards[existingWordIndex] = {
                ...existingWord,
                groups: existingGroups
              };
            }
          } else {
            // 새 단어 추가
            const newWord = {
              ...word,
              groups: [newGroupId],
              viewCount: 0, // 가져온 단어는 viewCount 초기화
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            myFlashcards.push(newWord);
          }
        }
      }

      // Firestore 업데이트
      await setDoc(userDocRef, {
        groups: myGroups,
        flashcards: myFlashcards
      }, { merge: true });

      alert(`${selectedGroupIds.size}개의 그룹이 성공적으로 가져와졌습니다.`);
      setSelectedGroupIds(new Set());
      onImportComplete();
      onClose();
    } catch (error) {
      console.error('그룹 가져오기 실패:', error);
      alert('그룹 가져오기 중 오류가 발생했습니다.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[160] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800">외부 단어장 가져오기</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>

          {/* 검색 필드 */}
          <div className="relative">
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
              placeholder="그룹 이름 또는 소유자로 검색..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* 그룹 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchQuery
                ? `"${searchQuery}"에 해당하는 공개 그룹이 없습니다.`
                : '공개 그룹이 없습니다.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGroups.map((group) => {
                const isSelected = selectedGroupIds.has(group.id);
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
                    onClick={() => handleToggleGroup(group.id)}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-500'
                        : 'bg-white border-indigo-200 hover:bg-indigo-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleGroup(group.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2"
                      />
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className={`font-semibold ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                          {group.name || '이름 없음'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {displayDate && `${displayDate} • `}
                          소유자: {group.ownerNickname}
                        </div>
                      </div>
                      {isSelected && (
                        <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <div className="flex justify-between items-center gap-3">
            <div className="text-sm text-gray-600">
              {selectedGroupIds.size > 0 && `${selectedGroupIds.size}개 그룹 선택됨`}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={isImporting}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || selectedGroupIds.size === 0}
                className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? '가져오는 중...' : '가져오기'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

