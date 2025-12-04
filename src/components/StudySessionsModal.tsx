'use client';

interface StudySession {
  time: string;
  words: string[];
}

interface StudySessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  formattedDate: string;
  sessions: StudySession[];
  onSessionSelected: (session: StudySession) => void;
}

export default function StudySessionsModal({
  isOpen,
  onClose,
  formattedDate,
  sessions,
  onSessionSelected
}: StudySessionsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[140] p-4"
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
          <h3 className="text-xl font-bold text-gray-800 text-center">{formattedDate}</h3>
        </div>

        {/* 세션 목록 */}
        <div className="flex-1 overflow-y-auto p-6">
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="w-12 h-12 text-gray-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-gray-600 text-sm">이 날에는 공부 기록이 없어요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session, index) => (
                <button
                  key={index}
                  onClick={() => {
                    onSessionSelected(session);
                    onClose();
                  }}
                  className="w-full p-4 bg-teal-50 rounded-xl border border-gray-200 hover:bg-teal-100 transition-all text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="px-3 py-1.5 bg-teal-100 rounded-lg">
                        <span className="text-sm font-bold text-teal-700">{session.time}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800">
                        {session.words.length}개의 단어
                      </span>
                    </div>
                    <svg
                      className="w-4 h-4 text-gray-400"
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
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-teal-600 font-semibold rounded-lg hover:bg-teal-50 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

