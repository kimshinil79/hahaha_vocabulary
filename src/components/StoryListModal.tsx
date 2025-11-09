'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface StoryListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SelectedStoryData {
  key: string;
  preview: string;
  story: string;
  readCount: number;
}

export default function StoryListModal({ isOpen, onClose }: StoryListModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storyPreviews, setStoryPreviews] = useState<{ [key: string]: string }>({});
  const [storyReadCounts, setStoryReadCounts] = useState<{ [key: string]: number }>({});
  const [storyList, setStoryList] = useState<string[]>([]);
  const [selectedStory, setSelectedStory] = useState<SelectedStoryData | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      loadStories();
    }
  }, [isOpen, user]);

  const loadStories = async () => {
    if (!user) {
      setError('로그인이 필요합니다');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const email = user.email;
      const uid = user.uid;
      
      if (!email) {
        throw new Error('이메일 정보를 찾을 수 없습니다.');
      }

      const username = email.split('@')[0];
      const userDocId = `${username}${uid}`;

      const userDocRef = doc(db, 'users', userDocId);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const loadedStoryList = userData.storyList || [];
        const loadedStoryPreviews = userData.storyPreviews || {};
        const loadedStoryReadCounts = userData.storyReadCounts || {};

        setStoryPreviews(loadedStoryPreviews);
        setStoryReadCounts(loadedStoryReadCounts);
        setStoryList(Array.isArray(loadedStoryList) ? loadedStoryList : []);
      } else {
        setStoryPreviews({});
        setStoryReadCounts({});
        setStoryList([]);
      }
    } catch (err) {
      console.error('이야기 데이터 로드 오류:', err);
      setError(err instanceof Error ? err.message : '이야기 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStoryPreviews({});
    setStoryReadCounts({});
    setStoryList([]);
    setSelectedStory(null);
    setError(null);
    onClose();
  };

  const findFullStoryByPreview = (preview: string): string | null => {
    const trimmedPreview = preview.trim();
    if (!trimmedPreview) return null;

    if (storyList.length === 0) {
      return null;
    }

    const exactMatch = storyList.find((story) => story.trim().startsWith(trimmedPreview));
    if (exactMatch) {
      return exactMatch;
    }

    if (trimmedPreview.length > 20) {
      const shortPreview = trimmedPreview.substring(0, 50);
      const partialMatch = storyList.find((story) => story.trim().startsWith(shortPreview));
      if (partialMatch) {
        return partialMatch;
      }
    }

    return null;
  };

  const handleStoryClick = (storyKey: string) => {
    const preview = storyPreviews[storyKey];
    if (!preview) return;

    const fullStory = findFullStoryByPreview(preview);

    setSelectedStory({
      key: storyKey,
      preview,
      story: fullStory ?? preview,
      readCount: storyReadCounts[storyKey] ?? 0
    });
  };

  const handleCloseStoryDetail = () => {
    setSelectedStory(null);
  };

  const updateStoryReadCount = async (storyKey: string, shouldIncrement: boolean = false): Promise<number> => {
    if (!user) {
      throw new Error('로그인이 필요합니다.');
    }

    try {
      const email = user.email;
      const uid = user.uid;

      if (!email) {
        throw new Error('이메일 정보를 찾을 수 없습니다.');
      }

      const username = email.split('@')[0];
      const userDocId = `${username}${uid}`;
      const userDocRef = doc(db, 'users', userDocId);

      // Firebase에서 storyReadCounts 맵을 읽어옴
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        throw new Error('사용자 문서를 찾을 수 없습니다.');
      }
      
      const userData = userDocSnap.data();
      const storyReadCountsMap = userData.storyReadCounts || {};
      
      let newCount: number;

      if (shouldIncrement) {
        // 해당 키의 현재 값을 가져와서 +1
        const currentCount = storyReadCountsMap[storyKey] || 0;
        newCount = currentCount + 1;
      } else {
        // 직접 값 설정 (기존 로직 유지)
        newCount = storyReadCounts[storyKey] || 0;
      }

      // storyReadCounts 맵 전체에 해당 키를 업데이트하여 저장
      await setDoc(
        userDocRef,
        {
          storyReadCounts: {
            ...storyReadCountsMap,
            [storyKey]: newCount
          }
        },
        { merge: true }
      );

      setStoryReadCounts((prev) => ({ ...prev, [storyKey]: newCount }));
      setSelectedStory((prev) =>
        prev && prev.key === storyKey ? { ...prev, readCount: newCount } : prev
      );

      return newCount;
    } catch (err) {
      console.error('읽은 횟수 저장 오류:', err);
      throw err;
    }
  };

  // readCount에 따라 색상 클래스를 반환하는 함수
  const getColorClass = (readCount: number): string => {
    // 0: 매우 옅음, 1-2: 옅음, 3-5: 중간, 6-10: 진함, 11+: 매우 진함
    if (readCount === 0) {
      return 'bg-gradient-to-r from-sky-100 to-cyan-100 text-gray-700 hover:from-sky-200 hover:to-cyan-200';
    } else if (readCount <= 2) {
      return 'bg-gradient-to-r from-sky-200 to-cyan-200 text-gray-700 hover:from-sky-300 hover:to-cyan-300';
    } else if (readCount <= 5) {
      return 'bg-gradient-to-r from-cyan-300 to-blue-400 text-white hover:from-cyan-400 hover:to-blue-500';
    } else if (readCount <= 10) {
      return 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:from-cyan-500 hover:to-blue-600';
    } else if (readCount <= 20) {
      return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700';
    } else {
      return 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800';
    }
  };

  if (!isOpen) return null;

  const storyKeys = Object.keys(storyPreviews);
  const totalStories = storyKeys.length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full h-[90vh] max-w-6xl flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              이야기 목록
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            저장된 이야기 목록입니다. 총 {loading ? '...' : totalStories}개의 이야기가 있습니다.
          </p>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">{error}</div>
          )}

          {!loading && !error && totalStories === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-500 text-lg mb-2">저장된 이야기가 없습니다.</p>
                <p className="text-gray-400 text-sm">이야기 입력으로 이야기를 추가해보세요!</p>
              </div>
            </div>
          )}

          {!loading && !error && totalStories > 0 && (
            <div className="space-y-3">
              {storyKeys.map((key) => {
                const preview = storyPreviews[key];
                const readCount = storyReadCounts[key] || 0;
                return (
                  <div
                    key={key}
                    onClick={() => handleStoryClick(key)}
                    className={`px-5 py-4 rounded-xl font-medium shadow-md hover:shadow-lg transition-all cursor-pointer ${getColorClass(readCount)}`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="text-base sm:text-lg mb-1 line-clamp-2">
                          {preview}
                        </div>
                        <div className="text-xs opacity-75 mt-2">
                          공부 횟수: {readCount}회
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>

      {/* 이야기 상세 모달 */}
      {selectedStory && (
        <StoryDetailModal
          storyData={selectedStory}
          onClose={handleCloseStoryDetail}
          onUpdateReadCount={updateStoryReadCount}
        />
      )}
    </div>
  );
}

// 이야기 상세 모달 컴포넌트
interface StoryDetailModalProps {
  storyData: SelectedStoryData;
  onClose: () => void;
  onUpdateReadCount: (storyKey: string, increment?: boolean) => Promise<number>;
}

const splitStoryIntoSentences = (story: string): string[] => {
  const matches = story.match(/[^.!?]+[.!?]/g);
  if (matches && matches.length > 0) {
    return matches.map((sentence) => sentence.trim()).filter(Boolean);
  }
  const trimmed = story.trim();
  return trimmed ? [trimmed] : [];
};

const createSeededRandom = (seed: number) => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const maskWordWithPunctuation = (word: string) => {
  const lettersOnly = word.replace(/[^A-Za-z0-9]/g, '');
  const punctuation = word.replace(/[A-Za-z0-9]/g, '');
  return `${'_'.repeat(lettersOnly.length)}${punctuation}`;
};

const processTextByDifficulty = (text: string, difficulty: number): string => {
  if (difficulty <= 0) {
    return text;
  }

  const words = text.split(/\s+/);
  if (words.length === 0) {
    return text;
  }

  if (difficulty >= 1) {
    return words
      .map((word, index) => (index === 0 ? word : maskWordWithPunctuation(word)))
      .join(' ');
  }

  const seed = Array.from(text).reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
  const random = createSeededRandom(seed);
  const hideChance = difficulty * 0.8;

  return words
    .map((word, index) => {
      if (index === 0) {
        return word;
      }
      return random() < hideChance ? maskWordWithPunctuation(word) : word;
    })
    .join(' ');
};

function StoryDetailModal({ storyData, onClose, onUpdateReadCount }: StoryDetailModalProps) {
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [difficulty, setDifficulty] = useState(0);
  const [speechRate, setSpeechRate] = useState(0.5);
  const [readCount, setReadCount] = useState(storyData.readCount);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUpdatingCount, setIsUpdatingCount] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const sentences = splitStoryIntoSentences(storyData.story);
  const continuousRef = useRef(false);

  const stopSpeaking = () => {
    if (speechSupported) {
      window.speechSynthesis.cancel();
    }
    continuousRef.current = false;
    setIsPlaying(false);
    setCurrentIndex(-1);
  };

  useEffect(() => {
    setReadCount(storyData.readCount);
    stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyData.story, storyData.readCount]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speakSentence = (index: number, continuous = false) => {
    if (!speechSupported || !sentences[index]) {
      return;
    }

    const sentence = sentences[index];
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = speechRate;
    utterance.pitch = 1;
    utterance.lang = 'en-US';

    utterance.onend = () => {
      if (continuous && index < sentences.length - 1) {
        const nextIndex = index + 1;
        setCurrentIndex(nextIndex);
        speakSentence(nextIndex, true);
      } else {
        continuousRef.current = false;
        setIsPlaying(false);
        setCurrentIndex(-1);
      }
    };

    utterance.onerror = () => {
      continuousRef.current = false;
      setIsPlaying(false);
      setCurrentIndex(-1);
    };

    setCurrentIndex(index);
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleSentencePlay = (index: number) => {
    speakSentence(index, false);
  };

  const handleSentencePlayContinuous = (index: number) => {
    speakSentence(index, true);
  };

  const handlePlayFromStart = () => {
    speakSentence(0, true);
  };

  const handleSpeechRateChange = (value: number) => {
    const resumeIndex = currentIndex >= 0 ? currentIndex : 0;
    const shouldResume = isPlaying;
    const resumeContinuous = continuousRef.current;

    setSpeechRate(value);

    if (shouldResume) {
      stopSpeaking();
      setTimeout(() => {
        speakSentence(resumeIndex, resumeContinuous);
      }, 120);
    }
  };

  const handleGoodJob = async () => {
    if (isUpdatingCount) return;

    setIsUpdatingCount(true);
    try {
      const newCount = await onUpdateReadCount(storyData.key, true);
      setReadCount(newCount);
      setFeedbackMessage(`Great job! 이 스토리를 ${newCount}번 완독했습니다!`);
    } catch (err) {
      console.error(err);
      setFeedbackMessage('읽은 횟수를 저장하는 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingCount(false);
      setTimeout(() => setFeedbackMessage(null), 2500);
    }
  };

  const handleCloseModal = () => {
    stopSpeaking();
    onClose();
  };

  const resolvedSentences = sentences.length > 0 ? sentences : [storyData.story];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white"></div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="p-6 space-y-8">
            {!speechSupported && (
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-sm">
                현재 브라우저에서는 음성 합성 기능이 지원되지 않습니다. Chrome, Edge 등 최신 브라우저를 사용해 주세요.
              </div>
            )}

            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-semibold text-gray-700 whitespace-nowrap">난이도 조절</h4>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={Math.round(difficulty * 100)}
                    onChange={(event) => setDifficulty(Number(event.target.value) / 100)}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">{Math.round(difficulty * 100)}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  값을 높일수록 단어가 숨겨져 빈칸 학습에 도움이 됩니다.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-semibold text-gray-700 whitespace-nowrap">읽기 속도</h4>
                  <input
                    type="range"
                    min={30}
                    max={150}
                    step={5}
                    value={Math.round(speechRate * 100)}
                    onChange={(event) => handleSpeechRateChange(Number(event.target.value) / 100)}
                    className="flex-1"
                    disabled={!speechSupported}
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">{speechRate.toFixed(2)}x</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  문장이 재생 중이면 속도 변경 후 자동으로 다시 재생됩니다. (0.30x ~ 1.50x)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {resolvedSentences.map((sentence, index) => (
                <div
                  key={index}
                  className={`text-base leading-relaxed text-gray-800 transition-colors ${
                    speechSupported ? 'cursor-pointer hover:text-purple-600' : ''
                  } ${
                    currentIndex === index ? 'text-purple-600 font-semibold' : ''
                  }`}
                  onClick={() => speechSupported && handleSentencePlay(index)}
                >
                  {processTextByDifficulty(sentence, difficulty)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 하단 컨트롤 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white space-y-4">
          {feedbackMessage && (
            <div className="px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm text-center">
              {feedbackMessage}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={isPlaying ? stopSpeaking : handlePlayFromStart}
              disabled={!speechSupported}
              className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-semibold shadow hover:from-purple-600 hover:to-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isPlaying ? '정지' : '처음부터 듣기'}
            </button>

            <button
              onClick={handleGoodJob}
              disabled={isUpdatingCount}
              className="px-5 py-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-semibold shadow hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
            >
              {isUpdatingCount ? '저장 중...' : `Good Job! (${readCount})`}
            </button>

            <button
              onClick={handleCloseModal}
              className="px-4 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-sm font-semibold whitespace-nowrap"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

