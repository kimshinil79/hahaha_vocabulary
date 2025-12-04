'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { StudyPattern } from '@/components/StudyPatternSelectionModal';
import { StudyContinuationOption } from '@/components/StudyCompleteModal';

export interface StudyWord {
  word: string;
  example: string;
  frequency: number;
  starCount: number;
  showDefinition: boolean;
  wordData: {
    meanings: Array<{
      definition: string;
      examples: string[];
      frequency: number;
      updatedAt: string;
    }>;
    updatedAt: string;
  };
}

interface StudySessionContextType {
  // 현재 공부 세션 데이터
  studyWords: StudyWord[];
  currentIndex: number;
  studyPattern: StudyPattern | null;
  
  // 세션 관리 함수
  setStudyWords: (words: StudyWord[]) => void;
  setCurrentIndex: (index: number) => void;
  setStudyPattern: (pattern: StudyPattern | null) => void;
  
  // 공부 옵션
  continuationOption: StudyContinuationOption | 'groupSelection' | null;
  selectedGroupId: string | null;
  setContinuationOption: (option: StudyContinuationOption | 'groupSelection' | null) => void;
  setSelectedGroupId: (groupId: string | null) => void;
  
  // 세션 초기화
  resetSession: () => void;
}

const StudySessionContext = createContext<StudySessionContextType | undefined>(undefined);

export function StudySessionProvider({ children }: { children: ReactNode }) {
  const [studyWords, setStudyWords] = useState<StudyWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [studyPattern, setStudyPattern] = useState<StudyPattern | null>(null);
  const [continuationOption, setContinuationOption] = useState<StudyContinuationOption | 'groupSelection' | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const resetSession = () => {
    setStudyWords([]);
    setCurrentIndex(0);
    setContinuationOption(null);
    setSelectedGroupId(null);
  };

  return (
    <StudySessionContext.Provider
      value={{
        studyWords,
        currentIndex,
        studyPattern,
        setStudyWords,
        setCurrentIndex,
        setStudyPattern,
        continuationOption,
        selectedGroupId,
        setContinuationOption,
        setSelectedGroupId,
        resetSession,
      }}
    >
      {children}
    </StudySessionContext.Provider>
  );
}

export function useStudySession() {
  const context = useContext(StudySessionContext);
  if (context === undefined) {
    throw new Error('useStudySession must be used within a StudySessionProvider');
  }
  return context;
}

