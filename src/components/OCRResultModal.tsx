'use client';

interface OCRResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractedText: string;
  isProcessing: boolean;
}

export default function OCRResultModal({ isOpen, onClose, extractedText, isProcessing }: OCRResultModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              추출된 텍스트
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600 font-semibold">텍스트 추출 중...</p>
              <p className="text-sm text-gray-500 mt-2">잠시만 기다려주세요</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              {extractedText ? (
                <div className="text-gray-800 whitespace-pre-wrap leading-relaxed font-mono text-sm">
                  {extractedText}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <p className="text-lg mb-2">텍스트를 추출할 수 없습니다.</p>
                  <p className="text-sm">이미지를 다시 촬영해주세요.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-semibold"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

