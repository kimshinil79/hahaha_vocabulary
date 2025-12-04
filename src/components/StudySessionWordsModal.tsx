'use client';

interface StudySessionWordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  wordList: any[];
}

export default function StudySessionWordsModal({
  isOpen,
  onClose,
  title,
  wordList
}: StudySessionWordsModalProps) {
  if (!isOpen) return null;

  const extractKoreanFromDefinition = (definition: any): string => {
    if (!definition) return '';
    const defStr = Array.isArray(definition)
      ? (definition.length > 0 ? String(definition[0]) : '')
      : String(definition);
    if (!defStr) return '';
    
    // "[명사] 확신" 형식에서 "확신" 부분만 추출
    const match = defStr.match(/\]\s*(.+)$/);
    if (match) {
      return match[1]?.trim() || defStr;
    }
    return defStr;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[150] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        </div>

        {/* 단어 목록 */}
        <div className="flex-1 overflow-y-auto p-6">
          {wordList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-sm">단어 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {wordList.map((word, index) => {
                const wordStr = word.word || '';
                const meaning = word.meaning || {};
                const definition = meaning.definition || '';
                const subtitle = extractKoreanFromDefinition(definition);

                return (
                  <div
                    key={index}
                    className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm"
                  >
                    <div className="text-base font-bold text-teal-700 mb-2">{wordStr}</div>
                    {subtitle && (
                      <div className="text-sm text-gray-700 leading-relaxed">{subtitle}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

