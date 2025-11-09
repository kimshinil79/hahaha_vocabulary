'use client';

import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';

export default function Header() {
  const { user, logout } = useAuth();
  const { nickname, loading } = useUserProfile();

  if (loading) {
    return (
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="animate-pulse bg-gray-200 h-8 w-48 rounded"></div>
          </div>
        </div>
      </header>
    );
  }

  if (!user) {
    return (
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="text-sm text-gray-500">
              로그인이 필요합니다
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-extrabold font-dancing truncate bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
            영어왕 {nickname || '사용자'}
          </h1>
          <button
            onClick={logout}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 shadow-sm hover:shadow-md transition-shadow whitespace-nowrap"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
