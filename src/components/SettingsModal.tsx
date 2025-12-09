'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, Timestamp, onSnapshot } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useRelationships } from '@/contexts/RelationshipsContext';
import LevelSelectionModal from './LevelSelectionModal';
import FieldSelectionModal from './FieldSelectionModal';
import RelationshipRequestModal from './RelationshipRequestModal';
import { 
  sendRelationshipRequest
} from '@/utils/fcmService';

type EnglishLevel = 'elementary' | 'middle' | 'high';
type StudyField = 'KSAT' | 'Toeic' | 'Toefl';
type UserType = '학생' | '선생님' | '부모님';
type Gender = '남성' | '여성';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserProfile {
  nickname?: string;
  gender?: Gender;
  birthday?: Date;
  userType?: UserType;
  englishLevel?: EnglishLevel;
  studyFields: StudyField[];
  children: string[];
  friends: string[];
  students: string[];
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, logout } = useAuth();
  const { relationships } = useRelationships(); // Provider에서 실시간 데이터 가져오기
  const [profile, setProfile] = useState<UserProfile>({
    studyFields: [],
    children: [],
    friends: [],
    students: [],
  });
  const [initialProfile, setInitialProfile] = useState<UserProfile>({
    studyFields: [],
    children: [],
    friends: [],
    students: [],
  });
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactType, setContactType] = useState<'friends' | 'students' | 'children'>('friends');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const birthdayRef = useRef<HTMLInputElement>(null);

  // 사용자 프로필 불러오기 (relationships는 Provider에서 실시간으로 관리)
  useEffect(() => {
    if (!isOpen || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const loadProfile = async () => {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          
          // birthday 처리
          let birthday: Date | undefined;
          const birthdayData = userData.birthday;
          if (birthdayData) {
            if (birthdayData instanceof Timestamp) {
              birthday = birthdayData.toDate();
            } else if (typeof birthdayData === 'string') {
              birthday = new Date(birthdayData);
            }
          }

          // studyFields 처리
          const fields = userData.studyFields || userData.studyField || [];
          const studyFields = Array.isArray(fields) ? fields : fields ? [fields] : [];

          const loadedProfile: UserProfile = {
            nickname: userData.nickname || '',
            gender: userData.gender as Gender | undefined,
            birthday,
            userType: userData.userType as UserType | undefined,
            englishLevel: userData.englishLevel as EnglishLevel | undefined,
            studyFields: studyFields.filter((f: string) => ['KSAT', 'Toeic', 'Toefl'].includes(f)),
            // Provider에서 실시간으로 가져온 데이터 사용
            children: relationships.children,
            friends: relationships.friends,
            students: relationships.students,
          };

          setProfile(loadedProfile);
          // Date 객체를 보존하면서 깊은 복사
          setInitialProfile({
            ...loadedProfile,
            birthday: birthday ? new Date(birthday.getTime()) : undefined,
            children: [...loadedProfile.children],
            friends: [...loadedProfile.friends],
            students: [...loadedProfile.students],
            studyFields: [...loadedProfile.studyFields],
          });
        } else {
          // 문서가 없으면 기본값 설정 (Provider 데이터 사용)
          const defaultProfile: UserProfile = {
            studyFields: [],
            children: relationships.children,
            friends: relationships.friends,
            students: relationships.students,
          };
          setProfile(defaultProfile);
          setInitialProfile(defaultProfile);
        }
      } catch (error) {
        console.error('프로필 불러오기 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [isOpen, user]); // 초기 로드만 수행

  // relationships가 변경되면 profile 업데이트
  useEffect(() => {
    if (isOpen && user) {
      setProfile(prev => ({
        ...prev,
        children: relationships.children,
        friends: relationships.friends,
        students: relationships.students,
      }));
    }
  }, [relationships, isOpen, user]);

  // 전역 이벤트 리스너 (관계 요청)
  // 프로필 새로고침은 더 이상 필요 없음 (실시간 리스너가 자동으로 처리)
  useEffect(() => {
    const handleRelationshipRequest = (event: CustomEvent) => {
      if (isOpen) {
        const detail = event.detail;
        setPendingRequest({
          id: detail.id,
          fromUserNickname: detail.fromUserNickname,
          fromUserEmail: detail.fromUserEmail || '',
          requestType: detail.requestType,
          createdAt: new Date(),
        });
        setIsRequestModalOpen(true);
      }
    };

    window.addEventListener('relationshipRequest', handleRelationshipRequest as EventListener);

    return () => {
      window.removeEventListener('relationshipRequest', handleRelationshipRequest as EventListener);
    };
  }, [isOpen]);


  // 변경사항 감지
  useEffect(() => {
    // birthday 비교를 위한 헬퍼 함수
    const compareDates = (date1: Date | undefined, date2: Date | undefined): boolean => {
      if (!date1 && !date2) return true;
      if (!date1 || !date2) return false;
      if (date1 instanceof Date && date2 instanceof Date) {
        return date1.getTime() === date2.getTime();
      }
      // 문자열로 변환된 경우를 대비
      const time1 = date1 instanceof Date ? date1.getTime() : new Date(date1 as any).getTime();
      const time2 = date2 instanceof Date ? date2.getTime() : new Date(date2 as any).getTime();
      return time1 === time2;
    };

    const changed =
      profile.nickname !== initialProfile.nickname ||
      profile.gender !== initialProfile.gender ||
      !compareDates(profile.birthday, initialProfile.birthday) ||
      profile.userType !== initialProfile.userType ||
      JSON.stringify(profile.children) !== JSON.stringify(initialProfile.children) ||
      JSON.stringify(profile.friends) !== JSON.stringify(initialProfile.friends) ||
      JSON.stringify(profile.students) !== JSON.stringify(initialProfile.students);
    setHasChanges(changed);
  }, [profile, initialProfile]);

  // loadUserProfile 함수는 제거되었습니다. 실시간 리스너가 자동으로 업데이트합니다.

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updates: any = {
        nickname: profile.nickname?.trim() || null,
        gender: profile.gender || null,
        birthday: profile.birthday ? Timestamp.fromDate(profile.birthday) : null,
        userType: profile.userType || null,
        englishLevel: profile.englishLevel || null,
        studyFields: profile.studyFields,
        children: profile.children,
        friends: profile.friends,
        students: profile.students,
        updatedAt: new Date().toISOString(),
      };

      // null 값 제거
      Object.keys(updates).forEach(key => {
        if (updates[key] === null || updates[key] === undefined) {
          delete updates[key];
        }
      });

      await setDoc(userDocRef, updates, { merge: true });
      // Date 객체를 보존하면서 깊은 복사
      setInitialProfile({
        ...profile,
        birthday: profile.birthday ? new Date(profile.birthday.getTime()) : undefined,
        children: [...profile.children],
        friends: [...profile.friends],
        students: [...profile.students],
        studyFields: [...profile.studyFields],
      });
      setHasChanges(false);
      // 저장 완료 - alert 제거 (사용자 요청)
    } catch (error) {
      console.error('프로필 저장 오류:', error);
      alert('프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleLevelSelect = async (level: EnglishLevel) => {
    setProfile({ ...profile, englishLevel: level });
    setIsLevelModalOpen(false);
    await saveSettings({ englishLevel: level });
  };

  const handleFieldSelect = async (fields: StudyField[]) => {
    setProfile({ ...profile, studyFields: fields });
    setIsFieldModalOpen(false);
    await saveSettings({ studyFields: fields });
  };

  const saveSettings = async (updates: { englishLevel?: EnglishLevel; studyFields?: StudyField[] }) => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        ...updates,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      console.error('설정 저장 오류:', error);
      alert('설정 저장 중 오류가 발생했습니다.');
    }
  };

  const handleClose = async () => {
    if (hasChanges) {
      const shouldSave = confirm('변경사항이 있습니다. 저장하시겠습니까?');
      if (shouldSave) {
        await handleSave();
      }
    }
    onClose();
  };

  const handlePasswordChange = async (newPassword: string, confirmPassword: string) => {
    if (!user) return false;

    if (newPassword !== confirmPassword) {
      alert('두 비밀번호가 일치하지 않습니다.');
      return false;
    }

    if (newPassword.length < 6) {
      alert('비밀번호는 최소 6자 이상이어야 합니다.');
      return false;
    }

    try {
      await updatePassword(user, newPassword);
      alert('비밀번호가 변경되었습니다.');
      setIsPasswordModalOpen(false);
      return true;
    } catch (error: any) {
      console.error('비밀번호 변경 오류:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('보안을 위해 다시 로그인해주세요.');
      } else {
        alert(`비밀번호 변경에 실패했습니다: ${error.message}`);
      }
      return false;
    }
  };

  const handleContactAdd = async (email: string) => {
    if (!email.trim() || !user) return;

    const emailLower = email.trim().toLowerCase();
    
    // 이미 등록된 경우 스킵
    if (contactType === 'friends' && profile.friends.includes(emailLower)) {
      alert('이미 등록된 친구입니다.');
      return;
    }
    if (contactType === 'students' && profile.students.includes(emailLower)) {
      alert('이미 등록된 학생입니다.');
      return;
    }
    if (contactType === 'children' && profile.children.includes(emailLower)) {
      alert('이미 등록된 자녀입니다.');
      return;
    }

    try {
      // 관계 요청 전송
      const requestType = contactType === 'friends' ? 'friend' : contactType === 'students' ? 'student' : 'child';
      await sendRelationshipRequest(
        emailLower,
        profile.nickname || user.email?.split('@')[0] || '사용자',
        requestType
      );
      
      alert('요청이 전송되었습니다.');
      setIsContactModalOpen(false);
    } catch (error: any) {
      console.error('요청 전송 실패:', error);
      alert(`요청 전송 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  const handleContactRemove = (email: string, type: 'friends' | 'students' | 'children') => {
    if (type === 'friends') {
      setProfile({ ...profile, friends: profile.friends.filter(e => e !== email) });
    } else if (type === 'students') {
      setProfile({ ...profile, students: profile.students.filter(e => e !== email) });
    } else if (type === 'children') {
      setProfile({ ...profile, children: profile.children.filter(e => e !== email) });
    }
  };

  const handleLogout = async () => {
    if (hasChanges) {
      const shouldSave = confirm('변경사항이 있습니다. 저장하시겠습니까?');
      if (shouldSave) {
        await handleSave();
      }
    }
    await logout();
    onClose();
  };

  const getLevelDisplayName = (level: EnglishLevel | null | undefined): string => {
    if (!level) return '레벨 선택';
    switch (level) {
      case 'elementary': return '초등학교';
      case 'middle': return '중학교';
      case 'high': return '고등학교 이상';
      default: return '레벨 선택';
    }
  };

  const getFieldsDisplayName = (fields: StudyField[]): string => {
    if (fields.length === 0) return '관심분야 선택';
    const fieldNames = fields.map(field => {
      switch (field) {
        case 'KSAT': return '수능';
        case 'Toeic': return '토익';
        case 'Toefl': return '토플';
        default: return field;
      }
    });
    return fieldNames.join(', ');
  };

  const formatDate = (date: Date | undefined): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
        <div className="bg-white rounded-3xl shadow-xl ring-1 ring-black/5 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-gradient-to-r from-indigo-500 to-purple-600">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">설정</h3>
              <button
                onClick={handleClose}
                className="text-white hover:text-gray-200 text-3xl font-bold"
              >
                ×
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 개인 정보 */}
                <div>
                  <div className="flex items-center mb-3">
                    <div className="w-1 h-4 bg-indigo-500 rounded-full mr-2"></div>
                    <h4 className="text-base font-bold text-gray-900">개인 정보</h4>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-5 border border-indigo-100 space-y-4">
                    {/* 닉네임 */}
                    <div>
                      <input
                        ref={nicknameRef}
                        type="text"
                        value={profile.nickname || ''}
                        onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                        placeholder="닉네임"
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    {/* 성별 */}
                    <div>
                      <label className="text-sm font-semibold text-gray-700 mb-2 block">성별</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setProfile({ ...profile, gender: '남성' })}
                          className={`px-4 py-3 rounded-xl border-2 transition-all ${
                            profile.gender === '남성'
                              ? 'bg-blue-500 border-blue-500 text-white shadow-lg'
                              : 'bg-white border-gray-200 text-gray-800 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span>♂</span>
                            <span className="font-semibold">남성</span>
                          </div>
                        </button>
                        <button
                          onClick={() => setProfile({ ...profile, gender: '여성' })}
                          className={`px-4 py-3 rounded-xl border-2 transition-all ${
                            profile.gender === '여성'
                              ? 'bg-pink-500 border-pink-500 text-white shadow-lg'
                              : 'bg-white border-gray-200 text-gray-800 hover:border-pink-300'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span>♀</span>
                            <span className="font-semibold">여성</span>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* 생일 */}
                    <div>
                      <label className="text-sm font-semibold text-gray-700 mb-2 block">생일</label>
                      <input
                        ref={birthdayRef}
                        type="date"
                        max={new Date().toISOString().split('T')[0]}
                        value={profile.birthday ? profile.birthday.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            setProfile({ ...profile, birthday: new Date(e.target.value) });
                          }
                        }}
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    {/* 분류 */}
                    <div>
                      <label className="text-sm font-semibold text-gray-700 mb-2 block">분류</label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['학생', '선생님', '부모님'] as UserType[]).map((type) => {
                          const colors = {
                            '학생': 'bg-green-500 border-green-500',
                            '선생님': 'bg-indigo-500 border-indigo-500',
                            '부모님': 'bg-amber-500 border-amber-500',
                          };
                          const isSelected = profile.userType === type;
                          return (
                            <button
                              key={type}
                              onClick={() => setProfile({ ...profile, userType: type })}
                              className={`px-4 py-3 rounded-xl border-2 transition-all ${
                                isSelected
                                  ? `${colors[type]} text-white shadow-lg`
                                  : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-lg">
                                  {type === '학생' ? '🎓' : type === '선생님' ? '👨‍🏫' : '👨‍👩‍👧'}
                                </span>
                                <span className="font-semibold text-sm">{type}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 분류별 친구/학생/자녀 관리 */}
                    {profile.userType === '학생' && (
                      <div>
                        <button
                          onClick={() => {
                            setContactType('friends');
                            setIsContactModalOpen(true);
                          }}
                          className="w-full px-4 py-3 rounded-xl border-2 border-indigo-500 text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                        >
                          <span>👥</span>
                          <span className="font-semibold">친구 요청하기</span>
                        </button>
                        {profile.friends.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <label className="text-sm font-semibold text-gray-700">등록된 친구</label>
                            {profile.friends.map((email) => (
                              <div
                                key={email}
                                className="flex items-center justify-between px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-200"
                              >
                                <span className="text-sm text-gray-800">{email}</span>
                                <button
                                  onClick={() => handleContactRemove(email, 'friends')}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {profile.userType === '선생님' && (
                      <div>
                        <button
                          onClick={() => {
                            setContactType('students');
                            setIsContactModalOpen(true);
                          }}
                          className="w-full px-4 py-3 rounded-xl border-2 border-amber-500 text-amber-600 hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                        >
                          <span>👥</span>
                          <span className="font-semibold">학생 요청하기</span>
                        </button>
                        {profile.students.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <label className="text-sm font-semibold text-gray-700">등록된 학생</label>
                            {profile.students.map((email) => (
                              <div
                                key={email}
                                className="flex items-center justify-between px-4 py-2 bg-amber-50 rounded-xl border border-amber-200"
                              >
                                <span className="text-sm text-gray-800">{email}</span>
                                <button
                                  onClick={() => handleContactRemove(email, 'students')}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {profile.userType === '부모님' && (
                      <div>
                        <button
                          onClick={() => {
                            setContactType('children');
                            setIsContactModalOpen(true);
                          }}
                          className="w-full px-4 py-3 rounded-xl border-2 border-green-500 text-green-600 hover:bg-green-50 transition-all flex items-center justify-center gap-2"
                        >
                          <span>👥</span>
                          <span className="font-semibold">자녀 요청하기</span>
                        </button>
                        {profile.children.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <label className="text-sm font-semibold text-gray-700">등록된 자녀</label>
                            {profile.children.map((email) => (
                              <div
                                key={email}
                                className="flex items-center justify-between px-4 py-2 bg-green-50 rounded-xl border border-green-200"
                              >
                                <span className="text-sm text-gray-800">{email}</span>
                                <button
                                  onClick={() => handleContactRemove(email, 'children')}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 레벨 설정 */}
                <div>
                  <div className="flex items-center mb-3">
                    <div className="w-1 h-4 bg-indigo-500 rounded-full mr-2"></div>
                    <h4 className="text-base font-bold text-gray-900">레벨 설정</h4>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-5 border border-indigo-100">
                    <button
                      onClick={() => setIsLevelModalOpen(true)}
                      disabled={saving}
                      className="w-full px-4 py-3 rounded-xl border-2 border-indigo-500 text-indigo-600 hover:bg-indigo-50 transition-all text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="font-semibold">{getLevelDisplayName(profile.englishLevel)}</span>
                      <span className="text-gray-400">→</span>
                    </button>
                  </div>
                </div>

                {/* 관심분야 설정 */}
                <div>
                  <div className="flex items-center mb-3">
                    <div className="w-1 h-4 bg-purple-500 rounded-full mr-2"></div>
                    <h4 className="text-base font-bold text-gray-900">관심분야 설정</h4>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-5 border border-purple-100">
                    <button
                      onClick={() => setIsFieldModalOpen(true)}
                      disabled={saving}
                      className="w-full px-4 py-3 rounded-xl border-2 border-purple-500 text-purple-600 hover:bg-purple-50 transition-all text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="font-semibold">{getFieldsDisplayName(profile.studyFields)}</span>
                      <span className="text-gray-400">→</span>
                    </button>
                  </div>
                </div>

                {/* 비밀번호 수정 */}
                <div>
                  <button
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="flex items-center justify-between w-full px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                      <span className="font-semibold text-gray-900">비밀번호 수정</span>
                    </div>
                    <span className="text-gray-400">→</span>
                  </button>
                </div>

                {/* 로그아웃 */}
                <div>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-3 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                  >
                    <span>🚪</span>
                    <span className="font-semibold">로그아웃</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {hasChanges && (
            <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 레벨 선택 모달 */}
      <LevelSelectionModal
        isOpen={isLevelModalOpen}
        onClose={() => setIsLevelModalOpen(false)}
        onSelect={handleLevelSelect}
        currentLevel={profile.englishLevel}
      />

      {/* 분야 선택 모달 */}
      <FieldSelectionModal
        isOpen={isFieldModalOpen}
        onClose={() => setIsFieldModalOpen(false)}
        onSelect={handleFieldSelect}
        currentFields={profile.studyFields}
      />

      {/* 비밀번호 변경 모달 */}
      {isPasswordModalOpen && (
        <PasswordChangeModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
          onSave={handlePasswordChange}
        />
      )}

      {/* 친구/학생/자녀 등록 모달 */}
      {isContactModalOpen && (
        <ContactModal
          isOpen={isContactModalOpen}
          onClose={() => setIsContactModalOpen(false)}
          onAdd={handleContactAdd}
          type={contactType}
        />
      )}

      {/* 관계 요청 모달 */}
      {isRequestModalOpen && pendingRequest && (
        <RelationshipRequestModal
          isOpen={isRequestModalOpen}
          onClose={() => {
            setIsRequestModalOpen(false);
            setPendingRequest(null);
          }}
          request={pendingRequest}
          onRequestHandled={() => {
            // 프로필은 실시간 리스너가 자동으로 업데이트합니다
          }}
        />
      )}
    </>
  );
}

// 비밀번호 변경 모달
function PasswordChangeModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newPassword: string, confirmPassword: string) => Promise<boolean>;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError('');
    if (!newPassword || !confirmPassword) {
      setError('새 비밀번호를 두 번 입력해 주세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('두 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setSaving(true);
    const success = await onSave(newPassword, confirmPassword);
    setSaving(false);
    if (success) {
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-pink-500 to-orange-500 rounded-t-3xl">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white">비밀번호 수정</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-white hover:text-gray-200 text-3xl font-bold disabled:opacity-50"
            >
              ×
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">새 비밀번호</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none pr-12"
                placeholder="새 비밀번호를 입력하세요"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showNewPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">새 비밀번호 확인</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none pr-12"
                placeholder="새 비밀번호를 다시 입력하세요"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 친구/학생/자녀 등록 모달
function ContactModal({
  isOpen,
  onClose,
  onAdd,
  type,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (email: string) => void;
  type: 'friends' | 'students' | 'children';
}) {
  const [email, setEmail] = useState('');

  const typeLabels = {
    friends: '친구',
    students: '학생',
    children: '자녀',
  };

  const handleAdd = () => {
    if (email.trim()) {
      onAdd(email);
      setEmail('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-3xl">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white">{typeLabels[type]} 등록</h3>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 text-3xl font-bold"
            >
              ×
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none"
              placeholder={`${typeLabels[type]} 이메일을 입력하세요`}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleAdd}
              className="flex-1 px-4 py-3 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-colors font-semibold"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
