'use client';

import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useEffect, useState } from 'react';

export default function Header() {
  const { user } = useAuth();
  const { nickname, loading } = useUserProfile();
  const [imagePath, setImagePath] = useState('/flashcard.png');

  useEffect(() => {
    // basePath를 동적으로 감지 (window.location.pathname 기반)
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const basePath = pathname.startsWith('/hahahaEnglish') ? '/hahahaEnglish' : '';
      setImagePath(`${basePath}/flashcard.png`);
    }
  }, []);

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
      <div className="flex h-16">
        {/* 좌측 패널 너비만큼 공간 확보 (w-64 = 256px) */}
        <div className="w-64 flex items-center pl-4">
          <img
            src={imagePath}
            alt="HaHaHa FlashCards"
            className="h-10 w-auto object-contain"
            style={{ maxWidth: '200px' }}
          />
        </div>
        {/* 우측 영역 */}
        <div className="flex-1 flex justify-end items-center pr-4">
          <button
            onClick={() => {
              // 설정 모달은 부모 컴포넌트에서 관리
              const event = new CustomEvent('openSettings');
              window.dispatchEvent(event);
            }}
            className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
            title="설정"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-6 w-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
              />
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
