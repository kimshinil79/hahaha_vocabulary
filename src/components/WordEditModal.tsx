'use client';

import { useState, useEffect } from 'react';

export interface WordEditModalProps {
  wordData: any;
  source: 'clicked' | 'list';
  onClose: () => void;
  onSave: (updatedWordData: any) => Promise<void>;
  isSaving: boolean;
}

export default function WordEditModal({
  wordData,
  source,
  onClose,
  onSave,
  isSaving
}: WordEditModalProps) {
  const [word, setWord] = useState(wordData?.word || '');
  const [pronunciation, setPronunciation] = useState(wordData?.pronunciation || '');
  const [meanings, setMeanings] = useState<any[]>([]);

  useEffect(() => {
    if (wordData) {
      setWord(wordData.word || '');
      setPronunciation(wordData.pronunciation || '');
      setMeanings(wordData.meanings ? [...wordData.meanings] : []);
    }
  }, [wordData]);

  const handleExampleChange = (meaningIndex: number, exampleIndex: number, value: string) => {
    const updatedMeanings = [...meanings];
    if (!updatedMeanings[meaningIndex].examples) {
      updatedMeanings[meaningIndex].examples = [];
    }
    updatedMeanings[meaningIndex].examples[exampleIndex] = value;
    setMeanings(updatedMeanings);
  };

  const handleAddExample = (meaningIndex: number) => {
    const updatedMeanings = [...meanings];
    if (!updatedMeanings[meaningIndex].examples) {
      updatedMeanings[meaningIndex].examples = [];
    }
    updatedMeanings[meaningIndex].examples.push('');
    setMeanings(updatedMeanings);
  };

  const handleRemoveExample = (meaningIndex: number, exampleIndex: number) => {
    const updatedMeanings = [...meanings];
    if (updatedMeanings[meaningIndex].examples) {
      updatedMeanings[meaningIndex].examples = updatedMeanings[meaningIndex].examples.filter(
        (_: any, idx: number) => idx !== exampleIndex
      );
    }
    setMeanings(updatedMeanings);
  };

  const handleSave = async () => {
    if (!word.trim()) {
      alert('단어를 입력해주세요.');
      return;
    }

    const updatedWordData = {
      ...wordData,
      word: word.trim(),
      pronunciation: pronunciation.trim(),
      meanings: meanings,
      updatedAt: new Date().toISOString()
    };

    await onSave(updatedWordData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              단어 수정
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
          {/* 단어 스펠링 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              단어 스펠링
            </label>
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="단어를 입력하세요"
            />
          </div>

          {/* 발음기호 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              발음기호
            </label>
            <input
              type="text"
              value={pronunciation}
              onChange={(e) => setPronunciation(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="발음기호를 입력하세요 (예: /əˈkɑːnɪdʒ/)"
            />
          </div>

          {/* 각 뜻의 예문 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-4">
              예문 (각 뜻별로 수정 가능)
            </label>
            <div className="space-y-6">
              {meanings.map((meaning, meaningIndex) => (
                <div key={meaningIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-gray-700 mb-1">
                      뜻 {meaningIndex + 1}
                    </div>
                    <div className="text-sm text-gray-600 italic">
                      {meaning.definition}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-600 mb-2">
                      예문:
                    </div>
                    {meaning.examples && meaning.examples.length > 0 ? (
                      meaning.examples.map((example: string, exampleIndex: number) => (
                        <div key={exampleIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={example}
                            onChange={(e) => handleExampleChange(meaningIndex, exampleIndex, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="예문을 입력하세요"
                          />
                          <button
                            onClick={() => handleRemoveExample(meaningIndex, exampleIndex)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            title="예문 삭제"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-400 italic">예문이 없습니다</div>
                    )}
                    <button
                      onClick={() => handleAddExample(meaningIndex)}
                      className="w-full px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      + 예문 추가
                    </button>
                  </div>
                </div>
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
              disabled={isSaving || !word.trim()}
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

