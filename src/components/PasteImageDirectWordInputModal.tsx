'use client';

import { useState } from 'react';

interface PasteImageDirectWordInputModalProps {
  word: string;
  onClose: () => void;
  onSave: (pos: string, definition: string, example: string) => Promise<void>;
  isSaving: boolean;
}

export default function PasteImageDirectWordInputModal({
  word,
  onClose,
  onSave,
  isSaving
}: PasteImageDirectWordInputModalProps) {
  const [pos, setPos] = useState('noun');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');

  const handleSave = async () => {
    if (!pos.trim() || !definition.trim() || !example.trim()) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    await onSave(pos, definition, example);
  };

  const handleClose = () => {
    setPos('noun');
    setDefinition('');
    setExample('');
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      onPaste={(e) => {
        // 직접 입력 모달 내부에서 붙여넣기 이벤트 전파 방지
        e.stopPropagation();
      }}
      onClick={(e) => {
        // 모달 배경 클릭 시 이벤트 전파 방지
        if (e.target === e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              단어 직접 입력: {word}
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 bg-white">
          {/* 품사 선택 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              품사
            </label>
            <select
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="noun">명사 (noun)</option>
              <option value="verb">동사 (verb)</option>
              <option value="adjective">형용사 (adjective)</option>
              <option value="adverb">부사 (adverb)</option>
              <option value="pronoun">대명사 (pronoun)</option>
              <option value="preposition">전치사 (preposition)</option>
              <option value="conjunction">접속사 (conjunction)</option>
              <option value="interjection">감탄사 (interjection)</option>
              <option value="determiner">한정사 (determiner)</option>
              <option value="article">관사 (article)</option>
            </select>
          </div>

          {/* 뜻 입력 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              뜻 정의
            </label>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="뜻을 입력하세요 (품사 태그는 자동으로 추가됩니다)"
            />
          </div>

          {/* 예문 입력 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              예문
            </label>
            <textarea
              value={example}
              onChange={(e) => setExample(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="예문을 입력하세요 (예: I like apples.(나는 사과를 좋아한다.))"
            />
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !pos.trim() || !definition.trim() || !example.trim()}
              className="px-6 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

