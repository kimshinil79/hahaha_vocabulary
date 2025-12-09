'use client';

type EnglishLevel = 'elementary' | 'middle' | 'high';

interface LevelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (level: EnglishLevel) => void;
  currentLevel?: EnglishLevel | null;
}

export default function LevelSelectionModal({
  isOpen,
  onClose,
  onSelect,
  currentLevel,
}: LevelSelectionModalProps) {
  if (!isOpen) return null;

  const levels: { value: EnglishLevel; label: string; description: string; color: string }[] = [
    {
      value: 'elementary',
      label: '초등학교',
      description: '초등학생 수준의 영어 학습',
      color: 'from-blue-400 to-blue-600',
    },
    {
      value: 'middle',
      label: '중학교',
      description: '중학생 수준의 영어 학습',
      color: 'from-green-400 to-green-600',
    },
    {
      value: 'high',
      label: '고등학교 이상',
      description: '고등학생 이상 수준의 영어 학습',
      color: 'from-purple-400 to-purple-600',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[160] p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              영어 레벨 선택
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">현재 영어 수준을 선택하세요.</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-3">
          {levels.map((level) => (
            <button
              key={level.value}
              onClick={() => onSelect(level.value)}
              className={`w-full text-left p-5 rounded-xl border-2 transition-all hover:shadow-lg active:scale-[0.98] ${
                currentLevel === level.value
                  ? `border-indigo-500 bg-gradient-to-r ${level.color} text-white`
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold block mb-1">{level.label}</span>
                  <span className={`text-sm ${currentLevel === level.value ? 'text-white/90' : 'text-gray-600'}`}>
                    {level.description}
                  </span>
                </div>
                {currentLevel === level.value && (
                  <span className="text-2xl">✓</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

