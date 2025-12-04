'use client';

export enum StudyPattern {
  englishToKorean = 'englishToKorean', // 영어 -> 한글
  koreanToEnglish = 'koreanToEnglish', // 한글 -> 영어
  koreanSentenceToEnglish = 'koreanSentenceToEnglish', // 한글 문장 -> 영어 문장
}

interface StudyPatternSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (pattern: StudyPattern) => void;
}

export default function StudyPatternSelectionModal({
  isOpen,
  onClose,
  onSelect
}: StudyPatternSelectionModalProps) {
  if (!isOpen) return null;

  const patterns = [
    {
      pattern: StudyPattern.englishToKorean,
      title: '영어 → 한글',
      color: 'from-indigo-500 to-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-700'
    },
    {
      pattern: StudyPattern.koreanToEnglish,
      title: '한글 → 영어',
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-700'
    },
    {
      pattern: StudyPattern.koreanSentenceToEnglish,
      title: '한글 문장 → 영어 문장',
      color: 'from-pink-500 to-pink-600',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
      textColor: 'text-pink-700'
    }
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[120] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 w-full max-w-md h-[60vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="p-7 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 flex-shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-6 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full"></div>
            <h3 className="text-2xl font-bold text-gray-800">공부 패턴 선택</h3>
          </div>
          <p className="text-sm text-gray-600 ml-4">원하는 학습 방식을 선택하세요</p>
        </div>

        {/* 패턴 옵션들 */}
        <div className="flex-1 overflow-y-auto p-7 flex items-center justify-center">
          <div className="w-full space-y-4">
            {patterns.map((item) => (
              <button
                key={item.pattern}
                onClick={() => {
                  onSelect(item.pattern);
                  onClose();
                }}
                className={`w-full p-6 rounded-2xl border-2 ${item.borderColor} ${item.bgColor} hover:shadow-lg transition-all group`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-lg font-semibold ${item.textColor}`}>
                    {item.title}
                  </span>
                  <div className={`p-2 rounded-full bg-gradient-to-r ${item.color} opacity-10 group-hover:opacity-20 transition-opacity`}>
                    <svg
                      className={`w-4 h-4 ${item.textColor}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

