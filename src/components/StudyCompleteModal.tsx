'use client';

export enum StudyContinuationOption {
  lowFrequency = 'lowFrequency', // 공부 빈도 낮은 단어
  hardWords = 'hardWords', // 어려운 단어
  mix = 'mix', // 1번과 2번 믹스
  groupWords = 'groupWords', // 그룹별 단어
  goHome = 'goHome' // main 화면으로 가기
}

interface StudyCompleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (option: StudyContinuationOption | 'groupSelection') => void;
  studiedWordsCount?: number;
}

export default function StudyCompleteModal({
  isOpen,
  onClose,
  onSelect,
  studiedWordsCount = 0
}: StudyCompleteModalProps) {
  if (!isOpen) return null;

  const options = [
    {
      option: StudyContinuationOption.lowFrequency,
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path
            fillRule="evenodd"
            d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
            clipRule="evenodd"
          />
        </svg>
      ),
      title: '공부 빈도 낮은 단어',
      description: 'viewCount가 가장 낮은 10개의 단어',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      hoverColor: 'hover:bg-green-100'
    },
    {
      option: StudyContinuationOption.hardWords,
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd"
          />
        </svg>
      ),
      title: '어려운 단어',
      description: '난이도가 어려움으로 표시된 단어',
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
      hoverColor: 'hover:bg-pink-100'
    },
    {
      option: StudyContinuationOption.mix,
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
        </svg>
      ),
      title: '1번과 2번 믹스',
      description: '빈도 낮은 단어와 어려운 단어를 조합',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      hoverColor: 'hover:bg-indigo-100'
    },
    {
      option: 'groupSelection' as const,
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
        </svg>
      ),
      title: '그룹별 단어',
      description: '특정 그룹의 단어를 선택하여 공부',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      hoverColor: 'hover:bg-blue-100'
    },
    {
      option: StudyContinuationOption.goHome,
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      ),
      title: 'main 화면으로 가기',
      description: '홈 화면으로 돌아갑니다',
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      hoverColor: 'hover:bg-gray-100'
    }
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[130] p-4"
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
          <h3 className="text-xl font-bold text-gray-800 text-center mb-2">
            공부 must go on....
          </h3>
          {studiedWordsCount > 0 && (
            <p className="text-sm text-gray-600 text-center">
              {studiedWordsCount}개의 단어를 공부했습니다! 🎉
            </p>
          )}
        </div>

        {/* 옵션 목록 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {options.map((item) => (
            <button
              key={item.option}
              onClick={() => {
                onSelect(item.option);
                onClose();
              }}
              className={`w-full p-4 rounded-xl border-2 ${item.borderColor} ${item.bgColor} ${item.hoverColor} transition-all text-left`}
            >
              <div className="flex items-center gap-3">
                <div className={item.color}>{item.icon}</div>
                <div className="flex-1">
                  <div className={`font-semibold ${item.color} mb-1`}>
                    {item.title}
                  </div>
                  <div className="text-xs text-gray-600">{item.description}</div>
                </div>
                <svg
                  className={`w-5 h-5 ${item.color} opacity-50`}
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
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

