'use client';

import { useMemo, useState } from 'react';

export interface MeaningEditModalProps {
  word: string;
  meaningIndex: number;
  source: 'clicked' | 'list';
  clickedWordData: any | null;
  wordDataList: any[];
  currentWordIndex: number;
  onClose: () => void;
  onSave: (updatedMeaning: any) => Promise<void>;
  onDelete: () => Promise<void>;
  isSaving: boolean;
}

const POS_MAP: Record<string, string> = {
  noun: '[명사]',
  verb: '[동사]',
  adjective: '[형용사]',
  adverb: '[부사]',
  pronoun: '[대명사]',
  preposition: '[전치사]',
  conjunction: '[접속사]',
  interjection: '[감탄사]',
  determiner: '[한정사]',
  article: '[관사]'
};

const POS_OPTIONS = [
  { value: 'noun', label: '명사 (noun)' },
  { value: 'verb', label: '동사 (verb)' },
  { value: 'adjective', label: '형용사 (adjective)' },
  { value: 'adverb', label: '부사 (adverb)' },
  { value: 'pronoun', label: '대명사 (pronoun)' },
  { value: 'preposition', label: '전치사 (preposition)' },
  { value: 'conjunction', label: '접속사 (conjunction)' },
  { value: 'interjection', label: '감탄사 (interjection)' },
  { value: 'determiner', label: '한정사 (determiner)' },
  { value: 'article', label: '관사 (article)' }
];

const getPosValueFromDefinition = (definition: string) => {
  const match = definition.match(/^\s*\[([^\]]+)\]\s*/);
  if (!match) return { baseDefinition: definition, posValue: 'noun' };

  const tag = `[${match[1]}]`;
  const posEntry = Object.entries(POS_MAP).find(([, label]) => label === tag);
  return {
    baseDefinition: definition.replace(/^\s*\[[^\]]+\]\s*/, '').trim(),
    posValue: posEntry ? posEntry[0] : 'noun'
  };
};

const composeDefinitionWithTag = (baseDefinition: string, posValue: string) => {
  const trimmed = baseDefinition.trim();
  if (!trimmed) return '';
  const tag = POS_MAP[posValue.toLowerCase()];
  return tag ? `${tag} ${trimmed}` : trimmed;
};

export default function MeaningEditModal({
  word,
  meaningIndex,
  source,
  clickedWordData,
  wordDataList,
  currentWordIndex,
  onClose,
  onSave,
  onDelete,
  isSaving
}: MeaningEditModalProps) {
  const currentMeanings = source === 'clicked'
    ? clickedWordData?.meanings || []
    : wordDataList[currentWordIndex]?.meanings || [];

  const currentMeaning = currentMeanings[meaningIndex] || {};

  const { baseDefinition, posValue } = useMemo(
    () => getPosValueFromDefinition(currentMeaning.definition || ''),
    [currentMeaning.definition]
  );

  const [definition, setDefinition] = useState(baseDefinition);
  const [selectedPos, setSelectedPos] = useState<string>(posValue);
  const [examples, setExamples] = useState<string[]>(currentMeaning.examples || []);
  const [newExample, setNewExample] = useState('');

  const handleAddExample = () => {
    if (newExample.trim()) {
      setExamples([...examples, newExample.trim()]);
      setNewExample('');
    }
  };

  const handleRemoveExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const trimmedDefinition = definition.trim();
    if (!trimmedDefinition) {
      alert('뜻을 입력해주세요.');
      return;
    }

    const definitionWithTag = composeDefinitionWithTag(trimmedDefinition, selectedPos);

    const updatedMeaning = {
      ...currentMeaning,
      definition: definitionWithTag,
      examples: examples,
      frequency: currentMeaning.frequency || 0,
      updatedAt: new Date().toISOString()
    };

    await onSave(updatedMeaning);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              뜻 편집: {word}
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
          {/* 뜻 정의 */}
          <div className="mb-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                뜻 정의
              </label>
              <select
                value={selectedPos}
                onChange={(e) => setSelectedPos(e.target.value)}
                className="w-full sm:w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              >
                {POS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="뜻을 입력하세요"
            />
          </div>

          {/* 예문 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              예문
            </label>
            <div className="space-y-2 mb-3">
              {examples.map((example, index) => (
                <div key={index} className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                  <span className="flex-1 text-sm text-gray-700 italic">{example}</span>
                  <button
                    onClick={() => handleRemoveExample(index)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
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
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newExample}
                onChange={(e) => setNewExample(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddExample();
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="예문을 입력하고 Enter를 누르세요"
              />
              <button
                onClick={handleAddExample}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors font-semibold"
              >
                추가
              </button>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between gap-3">
            <button
              onClick={onDelete}
              disabled={isSaving}
              className="px-6 py-2 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              삭제
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !definition.trim()}
                className="px-6 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

