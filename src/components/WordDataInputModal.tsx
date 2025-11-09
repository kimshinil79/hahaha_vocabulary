'use client';

import { useState } from 'react';
import { useWordData } from '@/hooks/useWordData';

interface WordDataInputModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WordDataInputModal({ isOpen, onClose }: WordDataInputModalProps) {
  const { loading, error, success, saveWordData } = useWordData();
  const [jsonData, setJsonData] = useState('');

  const handleSave = async () => {
    if (!jsonData.trim()) {
      alert('JSON 데이터를 입력해주세요.');
      return;
    }

    const result = await saveWordData(jsonData);
    
    // 저장이 성공하면 모달 닫기
    if (result) {
      setTimeout(() => {
        handleClose();
      }, 1500); // 1.5초 후 모달 닫기
    }
  };

  const handleClose = () => {
    setJsonData('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full h-[90vh] max-w-6xl flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">JSON 입력</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            JSON 형식의 단어 데이터를 입력하세요. 데이터는 users 컬렉션과 meanings 컬렉션에 저장됩니다.
          </p>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 flex flex-col p-6 gap-4 bg-white">
          {/* 상태 메시지 */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">{error}</div>
          )}

          {success && (
            <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-green-700">{success}</div>
          )}

          {/* JSON 입력 영역 */}
          <div className="flex-1 flex flex-col">
            <label htmlFor="jsonInput" className="block text-sm font-medium text-gray-700 mb-2">
              JSON 데이터 입력
            </label>
            <textarea
              id="jsonInput"
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              placeholder="여기에 JSON 데이터를 입력하세요..."
              className="flex-1 w-full p-4 border border-gray-200 rounded-xl font-mono text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              style={{ minHeight: '400px' }}
            />
          </div>

          {/* 버튼 영역 */}
          <div className="flex justify-end gap-3 mt-2 flex-shrink-0">
            <button
              onClick={handleClose}
              className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !jsonData.trim()}
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
