'use client';

interface NewWordSaveDialogProps {
  wordData: any;
  onSaveToWords: () => void;
  onSaveToFlashcard: () => void;
  onClose: () => void;
  isSaving: boolean;
}

export default function NewWordSaveDialog({
  wordData,
  onSaveToWords,
  onSaveToFlashcard,
  onClose,
  isSaving
}: NewWordSaveDialogProps) {
  const selectedWord = wordData.word || '';
  const pronunciation = wordData.pronunciation || '';
  const meanings = (wordData.meanings || []).slice(0, 3); // 최대 3개만 표시

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
          e.stopPropagation();
        }
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          {/* 제목 */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            새 단어 저장
          </h2>

          {/* 단어 정보 미리보기 */}
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl p-5 border border-slate-200 mb-5">
            {/* 단어 */}
            <h3 className="text-3xl font-extrabold text-gray-900 mb-2">
              {selectedWord}
            </h3>

            {/* 발음 */}
            {pronunciation && (
              <p className="text-base text-gray-600 mb-4">
                {pronunciation}
              </p>
            )}

            {/* 의미 미리보기 */}
            <div className="space-y-3">
              {meanings.map((meaning: any, index: number) => {
                const definition = definitionPreview(meaning.definition);
                return (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-indigo-500/10 rounded-lg">
                      <span className="text-sm font-bold text-indigo-600">
                        {index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed flex-1 pt-0.5">
                      {definition}
                    </p>
                  </div>
                );
              })}
              {wordData.meanings && wordData.meanings.length > 3 && (
                <p className="text-xs text-gray-500 pl-10">
                  + {wordData.meanings.length - 3}개의 의미 더 있음
                </p>
              )}
            </div>
          </div>

          {/* 안내 텍스트 */}
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            어디에 저장할까요?
          </h3>

          {/* 버튼 그룹 */}
          <div className="space-y-3">
            {/* words 컬렉션에 저장 */}
            <button
              onClick={onSaveToWords}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              words 컬렉션에 저장
            </button>

            {/* 단어장에 바로 저장 */}
            <button
              onClick={onSaveToFlashcard}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              단어장에 바로 저장
            </button>

            {/* 취소 버튼 */}
            <button
              onClick={onClose}
              disabled={isSaving}
              className="w-full py-3 text-gray-600 hover:text-gray-800 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음에 할게요
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

