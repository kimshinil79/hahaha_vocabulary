'use client';

import { useState, useEffect } from 'react';

type StudyField = 'KSAT' | 'Toeic' | 'Toefl';

interface FieldSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (fields: StudyField[]) => void;
  currentFields?: StudyField[];
}

export default function FieldSelectionModal({
  isOpen,
  onClose,
  onSelect,
  currentFields = [],
}: FieldSelectionModalProps) {
  const [selectedFields, setSelectedFields] = useState<StudyField[]>(currentFields);

  useEffect(() => {
    if (isOpen) {
      setSelectedFields(currentFields);
    }
  }, [isOpen, currentFields]);

  if (!isOpen) return null;

  const fields: { value: StudyField; label: string; description: string; color: string }[] = [
    {
      value: 'KSAT',
      label: '수능',
      description: '수능 영어 시험 준비',
      color: 'from-orange-400 to-orange-600',
    },
    {
      value: 'Toeic',
      label: '토익',
      description: 'TOEIC 시험 준비',
      color: 'from-red-400 to-red-600',
    },
    {
      value: 'Toefl',
      label: '토플',
      description: 'TOEFL 시험 준비',
      color: 'from-indigo-400 to-indigo-600',
    },
  ];

  const handleToggleField = (field: StudyField) => {
    setSelectedFields((prev) => {
      if (prev.includes(field)) {
        return prev.filter((f) => f !== field);
      } else {
        return [...prev, field];
      }
    });
  };

  const handleConfirm = () => {
    onSelect(selectedFields);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[160] p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              분야 선택 (중복 가능)
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">학습하고자 하는 분야를 선택하세요. 여러 개 선택 가능합니다.</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-3">
          {fields.map((field) => {
            const isSelected = selectedFields.includes(field.value);
            return (
              <button
                key={field.value}
                onClick={() => handleToggleField(field.value)}
                className={`w-full text-left p-5 rounded-xl border-2 transition-all hover:shadow-lg active:scale-[0.98] ${
                  isSelected
                    ? `border-indigo-500 bg-gradient-to-r ${field.color} text-white`
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                      isSelected ? 'border-white bg-white' : 'border-gray-400'
                    }`}>
                      {isSelected && (
                        <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <span className="text-lg font-bold block mb-1">{field.label}</span>
                      <span className={`text-sm ${isSelected ? 'text-white/90' : 'text-gray-600'}`}>
                        {field.description}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 transition-colors font-semibold"
            >
              확인 ({selectedFields.length}개 선택됨)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

