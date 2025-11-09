'use client';

import { useState } from 'react';
import { useDirectWordData } from '@/hooks/useDirectWordData';

interface DirectWordInputModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DirectWordInputModal({ isOpen, onClose }: DirectWordInputModalProps) {
  const { loading, error, success, saveDirectWord } = useDirectWordData();
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');

  const handleSave = async () => {
    if (!word.trim() || !meaning.trim() || !example.trim()) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    const result = await saveDirectWord(word.trim(), meaning.trim(), example.trim());
    
    // 저장이 성공하면 입력 필드만 초기화 (모달은 열어둠)
    if (result) {
      setTimeout(() => {
        setWord('');
        setMeaning('');
        setExample('');
      }, 1500);
    }
  };

  const handleClose = () => {
    setWord('');
    setMeaning('');
    setExample('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-md overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">단어 직접 입력</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            단어, 뜻, 예문을 입력하세요.
          </p>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="p-6">
          {/* 상태 메시지 */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">{error}</div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-100 rounded-xl text-green-700">{success}</div>
          )}

          {/* 입력 필드들 */}
          <div className="space-y-4">
            {/* 단어 입력 */}
            <div>
              <label htmlFor="word" className="block text-sm font-medium text-gray-700 mb-2">
                단어 <span className="text-red-500">*</span>
              </label>
              <input
                id="word"
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="예: apple"
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* 뜻 입력 */}
            <div>
              <label htmlFor="meaning" className="block text-sm font-medium text-gray-700 mb-2">
                뜻 <span className="text-red-500">*</span>
              </label>
              <input
                id="meaning"
                type="text"
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                placeholder="예: 사과"
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* 예문 입력 */}
            <div>
              <label htmlFor="example" className="block text-sm font-medium text-gray-700 mb-2">
                예문 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="example"
                value={example}
                onChange={(e) => setExample(e.target.value)}
                placeholder="예: I like apples."
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
              />
            </div>
          </div>

          {/* 버튼 영역 */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={handleClose}
              className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              나가기
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !word.trim() || !meaning.trim() || !example.trim()}
              className="px-6 py-2 rounded-full text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
