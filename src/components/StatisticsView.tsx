'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import StudySessionsModal from './StudySessionsModal';
import StudySessionWordsModal from './StudySessionWordsModal';

interface WordAdditionData {
  date: string;
  count: number;
  cumulative: number;
}

interface StudyCountData {
  [date: string]: number;
}

export default function StatisticsView() {
  const { user } = useAuth();
  const [selectedDays, setSelectedDays] = useState(7);
  const [wordAdditionData, setWordAdditionData] = useState<WordAdditionData[]>([]);
  const [studyCounts, setStudyCounts] = useState<StudyCountData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [displayedMonth, setDisplayedMonth] = useState(new Date());
  const [selectedChartPoint, setSelectedChartPoint] = useState<WordAdditionData | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);
  const [isWordsModalOpen, setIsWordsModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState<string>('');
  const [selectedSessions, setSelectedSessions] = useState<any[]>([]);
  const [selectedSessionWords, setSelectedSessionWords] = useState<any[]>([]);
  const [selectedSessionTitle, setSelectedSessionTitle] = useState<string>('');

  useEffect(() => {
    if (user) {
      loadStatisticsData();
    }
  }, [user, selectedDays]);

  // 페이지 어디든 클릭하면 툴팁 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectedChartPoint) {
        setSelectedChartPoint(null);
        setTooltipPosition(null);
      }
    };

    if (selectedChartPoint) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [selectedChartPoint]);

  const loadStatisticsData = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      console.log('[StatisticsView] 통계 로딩 시작');
      const uid = user.uid;
      
      if (!uid) {
        setIsLoading(false);
        return;
      }

      console.log('[StatisticsView] 로그인된 유저 정보:', {
        uid,
        userDocId: uid
      });

      // users 컬렉션에서 현재 사용자 문서 가져오기 (uid만 사용)
      const userDocRef = doc(db, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        console.log('[StatisticsView] 사용자 문서가 존재하지 않음');
        setWordAdditionData([]);
        setStudyCounts({});
        setIsLoading(false);
        return;
      }

      const userData = userDocSnap.data();
      const flashcards = Array.isArray(userData?.flashcards) ? userData.flashcards : [];
      const studyHistory = userData?.studyHistory || {};
      
      console.log('[StatisticsView] users 문서에서 flashcards 배열 길이:', flashcards.length);
      console.log('[StatisticsView] users 문서에서 studyHistory 키 수:', Object.keys(studyHistory).length);
      
      // 날짜별 단어 추가 카운트
      const dateCounts: { [key: string]: number } = {};
      const now = new Date();
      
      // 최근 N일 날짜 초기화
      for (let i = 0; i < selectedDays; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = formatDate(date);
        dateCounts[dateStr] = 0;
      }

      // flashcards 배열에서 createdAt 기반으로 카운트
      flashcards.forEach((flashcard: any) => {
        const createdAt = flashcard?.createdAt;
        if (createdAt) {
          // Firestore Timestamp 또는 일반 Date/문자열 모두 대응
          const date =
            typeof createdAt.toDate === 'function'
              ? createdAt.toDate()
              : new Date(createdAt);
          const dateStr = formatDate(date);
          
          // 최근 N일 이내인 경우만 카운트
          if (dateCounts.hasOwnProperty(dateStr)) {
            dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
          }
        }
      });

      // 차트 데이터 생성 (누적)
      const sortedDates = Object.keys(dateCounts).sort();
      let cumulative = 0;
      const chartData: WordAdditionData[] = sortedDates.map(date => {
        cumulative += dateCounts[date];
        return {
          date,
          count: dateCounts[date],
          cumulative
        };
      });

      console.log(
        '[StatisticsView] 차트용 날짜 수:',
        sortedDates.length,
        '누적 최종값:',
        cumulative
      );
      setWordAdditionData(chartData);

      // 달력용 데이터 (전체 기간) - studyHistory에서 날짜별 공부 횟수 가져오기
      const allDateCounts: StudyCountData = {};
      Object.keys(studyHistory).forEach(dateStr => {
        const dateData = studyHistory[dateStr];
        if (dateData && typeof dateData === 'object' && 'sessions' in dateData) {
          const sessions = Array.isArray(dateData.sessions) ? dateData.sessions : [];
          allDateCounts[dateStr] = sessions.length;
        }
      });

      console.log(
        '[StatisticsView] 달력용 날짜 수:',
        Object.keys(allDateCounts).length
      );
      setStudyCounts(allDateCounts);
    } catch (error) {
      console.error('통계 데이터 로드 오류:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getWeekday = (date: Date): string => {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return weekdays[date.getDay()];
  };

  const getBottomLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (selectedDays <= 7) {
      return getWeekday(date);
    } else {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }
  };

  const maxCumulative = Math.max(...wordAdditionData.map(d => d.cumulative), 10);
  const chartHeight = 180;

  const getIntensity = (count: number): number => {
    return Math.min(count / 5, 1);
  };

  const getDateBackgroundColor = (count: number): string => {
    if (count === 0) return 'transparent';
    const intensity = getIntensity(count);
    // RGB 보간: 연한 민트 (224, 242, 241) -> 진한 에메랄드 (0, 137, 123)
    const r = Math.round(224 + (0 - 224) * intensity);
    const g = Math.round(242 + (137 - 242) * intensity);
    const b = Math.round(241 + (123 - 241) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const isToday = (date: Date): boolean => {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
           date.getMonth() === now.getMonth() &&
           date.getDate() === now.getDate();
  };

  const isSelected = (date: Date): boolean => {
    return date.getFullYear() === selectedDate.getFullYear() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getDate() === selectedDate.getDate();
  };

  const renderCalendar = () => {
    const firstDay = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1);
    const lastDay = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0);
    const startOffset = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = lastDay.getDate();

    const days: React.ReactNode[] = [];
    
    // 빈 칸
    for (let i = 0; i < startOffset; i++) {
      days.push(<div key={`empty-${i}`} className="h-7"></div>);
    }

    // 날짜 칸
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day);
      const dateStr = formatDate(date);
      const count = studyCounts[dateStr] || 0;
      const backgroundColor = getDateBackgroundColor(count);
      const today = isToday(date);
      const selected = isSelected(date);

      days.push(
        <button
          key={day}
          onClick={async () => {
            setSelectedDate(date);
            // 날짜 클릭 시 세션 목록 표시
            await handleDateClick(dateStr);
          }}
          className={`h-7 rounded-md flex items-center justify-center text-xs font-medium transition-all ${
            selected ? 'ring-2 ring-teal-600' : ''
          } ${today && !selected ? 'ring-2 ring-red-500' : ''}`}
          style={{ backgroundColor }}
        >
          <span className={`${count > 0 ? 'text-white' : 'text-gray-700'}`}>
            {day}
          </span>
        </button>
      );
    }

    return days;
  };

  const changeMonth = (delta: number) => {
    const newMonth = new Date(displayedMonth);
    newMonth.setMonth(newMonth.getMonth() + delta);
    setDisplayedMonth(newMonth);
  };

  const handleDateClick = async (dateStr: string) => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) return;

      const userData = userDocSnap.data();
      const studyHistory = userData?.studyHistory || {};
      const dateData = studyHistory[dateStr];
      const sessions = dateData?.sessions || [];

      const formattedDate = new Date(dateStr).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      setSelectedDateStr(formattedDate);
      setSelectedSessions(sessions);
      setIsSessionsModalOpen(true);
    } catch (error) {
      console.error('세션 로드 실패:', error);
    }
  };

  const handleSessionSelected = async (session: any) => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) return;

      const userData = userDocSnap.data();
      const flashcards = (userData.flashcards || []) as any[];
      const words = session.words || [];

      // 단어 목록 가져오기
      const wordList = words
        .map((wordStr: string) => {
          return flashcards.find((card) => card.word === wordStr);
        })
        .filter(Boolean);

      const time = session.time || '';
      setSelectedSessionTitle(`${selectedDateStr} ${time}`);
      setSelectedSessionWords(wordList);
      setIsWordsModalOpen(true);
    } catch (error) {
      console.error('단어 로드 실패:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">통계 데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50 space-y-6">
      {/* 단어 추가 차트 */}
      <div className="bg-white rounded-2xl p-6 border-2 border-orange-300 shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-indigo-600">단어장 단어 (누적)</h3>
          <div className="flex gap-2">
            {[7, 14, 30].map(days => (
              <button
                key={days}
                onClick={() => setSelectedDays(days)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  selectedDays === days
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {days}일
              </button>
            ))}
          </div>
        </div>
        
        <div className="relative" style={{ height: `${chartHeight}px` }} ref={(el) => {
          if (el && !el.hasAttribute('data-chart-container')) {
            el.setAttribute('data-chart-container', 'true');
          }
        }}>
          {wordAdditionData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              아직 추가된 단어가 없습니다
            </div>
          ) : (
            <svg width="100%" height="100%" className="overflow-visible">
              {/* 그리드 라인 */}
              {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                const y = chartHeight - (chartHeight * ratio);
                const value = Math.round(maxCumulative * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1="40"
                      y1={y}
                      x2="100%"
                      y2={y}
                      stroke="#e5e7eb"
                      strokeWidth="1"
                    />
                    <text
                      x="35"
                      y={y + 4}
                      textAnchor="end"
                      fontSize="12"
                      fill="#6b7280"
                    >
                      {value}
                    </text>
                  </g>
                );
              })}

              {/* 라인 차트 */}
              <g transform="translate(45, 0)">
                {wordAdditionData.map((data, index) => {
                  const x = (index / (wordAdditionData.length - 1 || 1)) * (100 - 10) + '%';
                  const xNum = (index / (wordAdditionData.length - 1 || 1)) * 90 + 5;
                  const y = chartHeight - (data.cumulative / maxCumulative) * chartHeight;
                  
                  return (
                    <g key={index}>
                      {/* 점 - 클릭 가능 */}
                      <circle
                        cx={`${xNum}%`}
                        cy={y}
                        r="6"
                        fill="white"
                        stroke="#fb923c"
                        strokeWidth="2"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          const circle = e.currentTarget;
                          const svg = circle.ownerSVGElement;
                          const container = svg?.closest('.relative') as HTMLElement;
                          
                          if (svg && container) {
                            const containerRect = container.getBoundingClientRect();
                            const svgRect = svg.getBoundingClientRect();
                            
                            // SVG 내부 좌표를 컨테이너 좌표로 변환
                            const cx = parseFloat(circle.getAttribute('cx') || '0');
                            const cy = parseFloat(circle.getAttribute('cy') || '0');
                            
                            // 퍼센트를 픽셀으로 변환 (transform translate(45, 0) 고려)
                            // cx는 퍼센트 값이므로 svgRect.width를 기준으로 계산
                            const xPercent = cx / 100;
                            const x = (svgRect.width * xPercent) + 45; // translate(45, 0) 오프셋
                            const y = cy;
                            
                            setTooltipPosition({ x, y });
                            setSelectedChartPoint(data);
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.setAttribute('r', '8');
                          e.currentTarget.setAttribute('fill', '#fb923c');
                          e.currentTarget.setAttribute('opacity', '0.7');
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.setAttribute('r', '6');
                          e.currentTarget.setAttribute('fill', 'white');
                          e.currentTarget.setAttribute('opacity', '1');
                        }}
                      />
                      
                      {/* 라인 */}
                      {index < wordAdditionData.length - 1 && (
                        <line
                          x1={`${xNum}%`}
                          y1={y}
                          x2={`${((index + 1) / (wordAdditionData.length - 1)) * 90 + 5}%`}
                          y2={chartHeight - (wordAdditionData[index + 1].cumulative / maxCumulative) * chartHeight}
                          stroke="#fb923c"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      )}
                      
                      {/* X축 레이블 */}
                      <text
                        x={`${xNum}%`}
                        y={chartHeight + 20}
                        textAnchor="middle"
                        fontSize="12"
                        fill="#6b7280"
                      >
                        {getBottomLabel(data.date)}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          
          {/* 그래프 위에 표시되는 툴팁 */}
          {selectedChartPoint && tooltipPosition && (
            <div
              className="absolute bg-white rounded-lg shadow-xl border-2 border-orange-300 p-2.5 z-20"
              style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y - 90}px`,
                transform: 'translateX(-50%)',
                minWidth: '140px',
                maxWidth: '180px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">날짜</p>
                  <p className="text-xs font-semibold text-gray-800">
                    {new Date(selectedChartPoint.date).toLocaleDateString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      weekday: 'short'
                    })}
                  </p>
                </div>
                
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">추가된 단어</p>
                  <p className="text-sm font-bold text-orange-500">
                    {selectedChartPoint.count}개
                  </p>
                </div>
                
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">누적 단어</p>
                  <p className="text-sm font-bold text-indigo-600">
                    {selectedChartPoint.cumulative}개
                  </p>
                </div>
              </div>
              
              {/* 닫기 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedChartPoint(null);
                  setTooltipPosition(null);
                }}
                className="absolute top-1 right-1 text-gray-400 hover:text-gray-600 text-base font-bold z-30"
                style={{ fontSize: '16px', lineHeight: '1', width: '20px', height: '20px' }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        
      </div>

      {/* 달력 */}
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            ←
          </button>
          <h3 className="text-lg font-bold text-gray-800">
            {displayedMonth.getFullYear()}년 {displayedMonth.getMonth() + 1}월
          </h3>
          <button
            onClick={() => changeMonth(1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            →
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['일', '월', '화', '수', '목', '금', '토'].map(day => (
            <div key={day} className="text-center text-xs font-semibold text-gray-600 py-1">
              {day}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-1">
          {renderCalendar()}
        </div>
      </div>

      {/* 세션 목록 모달 */}
      <StudySessionsModal
        isOpen={isSessionsModalOpen}
        onClose={() => setIsSessionsModalOpen(false)}
        formattedDate={selectedDateStr}
        sessions={selectedSessions}
        onSessionSelected={handleSessionSelected}
      />

      {/* 단어 목록 모달 */}
      <StudySessionWordsModal
        isOpen={isWordsModalOpen}
        onClose={() => setIsWordsModalOpen(false)}
        title={selectedSessionTitle}
        wordList={selectedSessionWords}
      />
    </div>
  );
}

