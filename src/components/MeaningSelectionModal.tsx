'use client';

interface MeaningSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  meanings: any[];
  onSelect: (meaning: any) => void;
}

export default function MeaningSelectionModal({
  isOpen,
  onClose,
  meanings,
  onSelect
}: MeaningSelectionModalProps) {
  if (!isOpen) return null;

  const definitionPreview = (definition: any): string => {
    if (!definition) return '';
    if (Array.isArray(definition)) {
      return definition.map((e: any) => e.toString()).join(' · ');
    }
    return definition.toString();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          {/* 제목 */}
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            단어장에 추가할 의미를 선택하세요
          </h2>

          {/* 의미 목록 */}
          <div className="max-h-[60vh] overflow-y-auto space-y-3 mb-4">
            {meanings.map((meaning, index) => {
              const definition = definitionPreview(meaning.definition);
              return (
                <button
                  key={index}
                  onClick={() => {
                    onSelect(meaning);
                    onClose();
                  }}
                  className="w-full text-left p-4 rounded-xl bg-gray-50 hover:bg-indigo-50 border-2 border-transparent hover:border-indigo-200 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-indigo-500/15 rounded-lg">
                      <span className="text-sm font-bold text-indigo-600">
                        {index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed flex-1 pt-0.5">
                      {definition}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            className="w-full py-3 text-gray-600 hover:text-gray-800 font-semibold transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

