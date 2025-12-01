'use client';

import { useState, useEffect, useRef } from 'react';
import nlp from 'compromise';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { API_CONFIG } from '@/lib/api-config';
import MeaningEditModal from '@/components/MeaningEditModal';
import WordEditModal from '@/components/WordEditModal';
import AddToFlashcardModal from '@/components/AddToFlashcardModal';
import PasteImageDirectWordInputModal from '@/components/PasteImageDirectWordInputModal';
import NewWordSaveDialog from '@/components/NewWordSaveDialog';
import WordCard from '@/components/WordCard';
import { 
  POS_MAP, 
  getPosTag, 
  getLemma, 
  stripPunctuation, 
  generateLookupCandidates,
  decodeHtmlEntities,
  translateToKorean,
  formatExampleText
} from '@/utils/wordUtils';
import { 
  callTokenMatcher,
  getExtendedContext,
  findMostSimilarMeaning,
  fetchWordFromChatGPT
} from '@/utils/wordApi';
import { 
  saveWordToWordsCollection,
  addMeaningToWordsAndFlashcard,
  fetchWordFromFirebase as fetchWordFromFirebaseUtil,
  saveMeaningToFirebase as saveMeaningToFirebaseUtil,
  deleteMeaningFromFirebase as deleteMeaningFromFirebaseUtil,
  saveDirectWordToFirebase as saveDirectWordToFirebaseUtil,
  saveNewWordToWords as saveNewWordToWordsUtil,
  saveNewWordToFlashcard as saveNewWordToFlashcardUtil,
  updateWordInfo as updateWordInfoUtil
} from '@/utils/wordFirebase';
import { processImageFile, performOCR } from '@/utils/ocrUtils';
import { organizeWords } from '@/utils/wordOrganizer';

interface PasteImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImagePasted: (imageDataUrl: string) => void;
  initialImage?: string | null; // 초기 이미지 (임시 저장된 이미지)
  embedded?: boolean; // 페이지에 embedded 모드로 표시할지 여부
}

export default function PasteImageModal({ isOpen, onClose, onImagePasted, initialImage, embedded = false }: PasteImageModalProps) {
  const { user } = useAuth();
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [selectedWords, setSelectedWords] = useState<Array<{word: string; meaning: any; wordData: any}>>([]);
  const [wordDataList, setWordDataList] = useState<any[]>([]); // AI로부터 받은 단어 데이터 리스트
  const [currentWordIndex, setCurrentWordIndex] = useState(0); // 현재 표시할 단어 인덱스
  const [isLoadingWordData, setIsLoadingWordData] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 }); // 단어 처리 진행 상태
  const [isDragOver, setIsDragOver] = useState(false); // 드래그 오버 상태
  const [clickedWordData, setClickedWordData] = useState<any | null>(null); // 클릭한 단어의 데이터
  const [isLoadingClickedWord, setIsLoadingClickedWord] = useState(false); // 클릭한 단어 로딩 상태
  const [clickedWordNotFound, setClickedWordNotFound] = useState(false); // 클릭한 단어가 없는지 여부
  const [highlightedMeaningIndex, setHighlightedMeaningIndex] = useState<number | null>(null); // 하이라이트된 뜻 인덱스
  const [editingMeaning, setEditingMeaning] = useState<{ word: string; meaningIndex: number; source: 'clicked' | 'list' } | null>(null); // 편집 중인 뜻 정보
  const [editingWord, setEditingWord] = useState<{ wordData: any; source: 'clicked' | 'list' } | null>(null); // 편집 중인 단어 정보
  const [addingToFlashcard, setAddingToFlashcard] = useState<{ word: string; meaning: any; pronunciation?: string } | null>(null); // 단어장에 추가 중인 단어 정보
  const [isSavingMeaning, setIsSavingMeaning] = useState(false); // 뜻 저장 중 여부
  const [isDirectInputOpen, setIsDirectInputOpen] = useState(false); // 직접 입력 모달 열림 여부
  const [clickedWordForInput, setClickedWordForInput] = useState<string | null>(null); // 직접 입력할 단어
  const [lastDoubleClickedWord, setLastDoubleClickedWord] = useState<string | null>(null); // 마지막으로 더블 클릭한 단어
  const containerRef = useRef<HTMLDivElement>(null);
  
  // ChatGPT에서 받아온 새 단어 정보 (저장 전)
  const [newWordFromChatGPT, setNewWordFromChatGPT] = useState<any>(null);
  const [showNewWordSaveDialog, setShowNewWordSaveDialog] = useState(false);
  
  // 사용자의 flashcards 배열
  const [userFlashcards, setUserFlashcards] = useState<any[]>([]);

  const generateLookupCandidatesLocal = (rawWord: string): string[] => {
    return generateLookupCandidates(rawWord, getLemma);
  };


  // Firebase에서 단어 정보 가져오기 (words 컬렉션 전용)
  const fetchWordFromFirebase = async (word: string, sentence?: string, fullText?: string) => {
    await fetchWordFromFirebaseUtil(
      word,
      generateLookupCandidatesLocal,
      {
        setIsLoadingClickedWord,
        setClickedWordData,
        setClickedWordNotFound,
        setHighlightedMeaningIndex,
        setLastDoubleClickedWord,
        setNewWordFromChatGPT
      },
      ocrText,
      sentence,
      fullText
    );
  };

  // Firebase에 뜻 저장 함수 (사용자 단어장에 저장)
  const saveMeaningToFirebase = async (word: string, meaningIndex: number, updatedMeaning: any, source: 'clicked' | 'list') => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      await saveMeaningToFirebaseUtil(
        user,
        word,
        meaningIndex,
        updatedMeaning,
        source,
        { clickedWordData, wordDataList, currentWordIndex },
        { setClickedWordData, setWordDataList, setIsSavingMeaning }
      );
      alert('뜻이 저장되었습니다.');
    } catch (err) {
      console.error('뜻 저장 오류:', err);
      alert('뜻 저장 중 오류가 발생했습니다.');
    }
  };

  // Firebase에서 뜻 삭제 함수 (사용자 단어장에서 삭제)
  const deleteMeaningFromFirebase = async (word: string, meaningIndex: number, source: 'clicked' | 'list') => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!confirm('정말 이 뜻을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteMeaningFromFirebaseUtil(
        user,
        word,
        meaningIndex,
        source,
        { clickedWordData, wordDataList, currentWordIndex },
        { setClickedWordData, setWordDataList, setIsSavingMeaning }
      );
      alert('뜻이 삭제되었습니다.');
    } catch (err) {
      console.error('뜻 삭제 오류:', err);
      alert('뜻 삭제 중 오류가 발생했습니다.');
    }
  };

  // ChatGPT로부터 받은 새 단어를 words 컬렉션에 저장
  const handleSaveNewWordToWords = async () => {
    if (!newWordFromChatGPT) return;
    
    try {
      await saveNewWordToWordsUtil(newWordFromChatGPT, {
        setClickedWordData,
        setShowNewWordSaveDialog,
        setNewWordFromChatGPT,
        setIsSavingMeaning
      });
      alert('words 컬렉션에 저장되었습니다.');
    } catch (error) {
      console.error('words 컬렉션 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // ChatGPT로부터 받은 새 단어를 단어장(flashcards)에 바로 저장
  const handleSaveNewWordToFlashcard = async () => {
    if (!newWordFromChatGPT || !user) return;
    
    try {
      await saveNewWordToFlashcardUtil(user, newWordFromChatGPT, {
        setShowNewWordSaveDialog,
        setNewWordFromChatGPT,
        setIsSavingMeaning
      });
      alert('단어장에 저장되었습니다.');
    } catch (error) {
      console.error('단어장 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // 특정 뜻을 words 컬렉션과 flashcards에 모두 저장
  const handleAddMeaningToWordsAndFlashcard = async (word: string, meaning: any, pronunciation?: string) => {
    // 모달 열기
    setAddingToFlashcard({ word, meaning, pronunciation });
  };

  // 모달에서 저장 버튼 클릭 시 호출
  const handleSaveToFlashcard = async (groupId: string, difficulty: string) => {
    if (!user || !addingToFlashcard) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    try {
      setIsSavingMeaning(true);
      const result = await addMeaningToWordsAndFlashcard(
        user,
        addingToFlashcard.word,
        addingToFlashcard.meaning,
        addingToFlashcard.pronunciation,
        groupId,
        difficulty
      );
      
      // 저장 후 flashcards 다시 가져오기
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const flashcards = (userData.flashcards || []) as any[];
        setUserFlashcards(flashcards);
      }
      
      // 저장 여부에 따라 메시지 표시
      if (result.saved) {
        // 모달 자동 닫기
        setAddingToFlashcard(null);
      } else {
        // 이미 있는 경우 알림만 표시하고 모달은 유지
        alert(result.message);
      }
    } catch (error) {
      console.error('저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingMeaning(false);
    }
  };


  // 직접 입력 단어를 Firebase에 저장하는 함수
  const saveDirectWordToFirebase = async (word: string, pos: string, definition: string, example: string): Promise<boolean> => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return false;
    }

    if (!word.trim() || !pos.trim() || !definition.trim() || !example.trim()) {
      alert('모든 필드를 입력해주세요.');
      return false;
    }

    setIsSavingMeaning(true);
    try {
      await saveDirectWordToFirebaseUtil(user, word, pos, definition, example);
      alert('단어가 저장되었습니다.');
      return true;
    } catch (err) {
      console.error('단어 저장 오류:', err);
      alert('단어 저장 중 오류가 발생했습니다.');
      return false;
    } finally {
      setIsSavingMeaning(false);
    }
  };

  // 단어 뜻/예문 정리 함수 - 단어별 개별 처리
  const handleOrganizeWords = async () => {
    if (selectedWords.length === 0) return;

    try {
      await organizeWords(selectedWords, {
        setIsLoadingWordData,
        setWordDataList,
        setCurrentWordIndex,
        setBatchProgress
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : '단어 정리 중 오류가 발생했습니다.');
    }
  };

  // 파일을 이미지로 읽는 함수
  const handleFile = async (file: File) => {
    try {
      setError(null);
      const imageDataUrl = await processImageFile(file);
      setPastedImage(imageDataUrl);
      // 이미지를 드래그 앤 드롭하면 자동으로 OCR 실행
      setShowText(true);
      setIsProcessingOCR(true);
      setOcrText('');
      setSelectedWords([]);

      try {
        const text = await performOCR(imageDataUrl);
        setOcrText(text);
      } catch (error) {
        console.error('OCR 처리 오류:', error);
        setOcrText(`텍스트 추출 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      } finally {
        setIsProcessingOCR(false);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '이미지 파일만 업로드할 수 있습니다.');
    }
  };

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 드래그가 자식 요소로 이동한 경우는 무시
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  // OCR 처리 함수
  const handleConvertToText = async () => {
    if (!pastedImage) return;
    
    setShowText(true);
    setIsProcessingOCR(true);
    setOcrText('');

    try {
      const text = await performOCR(pastedImage);
      setOcrText(text);
    } catch (error) {
      console.error('OCR 처리 오류:', error);
      setOcrText(`텍스트 추출 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // 사용자의 flashcards 가져오기
  useEffect(() => {
    const fetchUserFlashcards = async () => {
      if (!user) {
        setUserFlashcards([]);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const flashcards = (userData.flashcards || []) as any[];
          setUserFlashcards(flashcards);
        } else {
          setUserFlashcards([]);
        }
      } catch (error) {
        console.error('Flashcards 가져오기 오류:', error);
        setUserFlashcards([]);
      }
    };

    fetchUserFlashcards();
  }, [user]);

  useEffect(() => {
    if (!isOpen) {
      setPastedImage(null);
      setError(null);
      setShowText(false);
      setOcrText('');
      setIsProcessingOCR(false);
      setSelectedWords([]);
      setWordDataList([]);
      setCurrentWordIndex(0);
      setIsDragOver(false);
      setClickedWordData(null);
      setIsLoadingClickedWord(false);
      setClickedWordNotFound(false);
      setHighlightedMeaningIndex(null);
      // 모달이 닫힐 때 body 스크롤 복원
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      return;
    }

    // 초기 이미지가 있으면 자동으로 설정
    if (initialImage && initialImage !== pastedImage) {
      setPastedImage(initialImage);
      setShowText(false); // 초기 이미지가 들어오면 텍스트 모드 해제
      setOcrText('');
      setSelectedWords([]);
    }

    // 모달이 열릴 때 body 스크롤 및 터치 이벤트 막기
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    // 클립보드에서 이미지 또는 텍스트 붙여넣기 처리
    const handlePaste = async (e: ClipboardEvent) => {
      // 직접 입력 모달이나 편집 모달이 열려있으면 처리하지 않음
      if (isDirectInputOpen || editingMeaning || editingWord) {
        return;
      }

      e.preventDefault();
      setError(null);

      const items = e.clipboardData?.items;
      if (!items) return;

      // 먼저 클립보드에서 이미지 찾기
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const result = event.target?.result;
              if (typeof result === 'string') {
                setPastedImage(result);
                // 이미지를 붙여넣으면 자동으로 OCR 실행
                setShowText(true);
                setIsProcessingOCR(true);
                setOcrText('');

                try {
                  // Tesseract.js 동적 import (클라이언트 사이드에서만 로드)
                  const Tesseract = await import('tesseract.js');
                  
                  // Worker 생성 및 언어 설정 (영어 + 한국어)
                  const worker = await Tesseract.createWorker('eng+kor');
                  
                  // 이미지에서 텍스트 추출
                  const { data: { text } } = await worker.recognize(result);
                  
                  // Worker 종료
                  await worker.terminate();

                  // 추출된 텍스트 설정
                  setOcrText(text.trim() || '텍스트를 찾을 수 없습니다.');
                } catch (error) {
                  console.error('OCR 처리 오류:', error);
                  setOcrText(`텍스트 추출 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
                } finally {
                  setIsProcessingOCR(false);
                }
              }
            };
            reader.onerror = () => {
              setError('이미지를 읽는 중 오류가 발생했습니다.');
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      }
      
      // 이미지가 없으면 텍스트 찾기
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        // 텍스트가 있으면 바로 텍스트 모드로 전환
        setOcrText(text.trim());
        setShowText(true);
        setPastedImage(null); // 이미지는 null로 설정
        return;
      }
      
      // 이미지도 텍스트도 없을 때
      setError('클립보드에 이미지나 텍스트가 없습니다. 스크린샷을 복사하거나 텍스트를 복사한 후 다시 시도해주세요.');
    };

    // 포커스를 모달 컨테이너로 설정
    const handleFocus = () => {
      if (containerRef.current) {
        containerRef.current.focus();
      }
    };

    // 이벤트 리스너 추가
    window.addEventListener('paste', handlePaste);
    
    // 모달이 열릴 때 포커스 설정
    if (containerRef.current) {
      containerRef.current.focus();
      handleFocus();
    }

    // 약간의 지연 후 다시 포커스 (일부 브라우저 대응)
    const timeoutId = setTimeout(handleFocus, 100);

    return () => {
      window.removeEventListener('paste', handlePaste);
      clearTimeout(timeoutId);
      // 컴포넌트 언마운트 시 body 스타일 복원
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen, initialImage, isDirectInputOpen, editingMeaning, editingWord, addingToFlashcard]);

  // 텍스트 모드에서 확인 버튼 클릭 시 - 모달 닫기
  const handleConfirm = () => {
    if (showText && ocrText) {
      // 텍스트 모드에서 확인을 누르면 모달 닫기
      setPastedImage(null);
      setShowText(false);
      setOcrText('');
      setSelectedWords([]);
      onClose();
    }
  };

  const handleCancel = () => {
    setPastedImage(null);
    setError(null);
    onClose();
  };

  if (!isOpen && !embedded) return null;

  const contentComponent = (
    <div 
      ref={containerRef}
      className={`bg-white ${embedded ? 'h-full' : 'rounded-2xl shadow-2xl w-full max-w-[95vw] max-h-[90vh]'} flex flex-col overflow-hidden transition-all ${
        isDragOver ? 'ring-4 ring-blue-500 ring-offset-2 scale-[0.98]' : ''
      }`}
      tabIndex={-1}
      style={{ outline: 'none' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
        {/* 헤더 */}
        {!embedded && (
          <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
                이미지 붙이기
              </h2>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              스크린샷/텍스트를 복사한 후 (Cmd+V 또는 Ctrl+V)로 붙여넣거나, 이미지 파일을 드래그 앤 드롭하세요
            </p>
          </div>
        )}

        {/* 메인 콘텐츠 */}
        <div 
          className="flex-1 overflow-y-auto overscroll-contain p-6 bg-gray-50 flex gap-6"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          style={{ touchAction: 'auto' }}
        >
          {/* 텍스트 본문 영역 */}
          <div className="flex-1 min-h-0 flex flex-col">
            {showText ? (
              // 텍스트 표시 모드
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              {isProcessingOCR ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                  <p className="text-gray-600 font-semibold">텍스트 추출 중...</p>
                  <p className="text-sm text-gray-500 mt-2">잠시만 기다려주세요</p>
                </div>
              ) : (
                <>
                  <div 
                    className="text-gray-800 whitespace-pre-wrap leading-relaxed font-mono text-sm select-none cursor-default"
                    style={{ 
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}
                    onMouseDown={(e) => {
                      // 더블클릭이 아닌 경우에만 선택 방지
                      if (e.detail !== 2) {
                        e.preventDefault();
                      }
                    }}
                    onCopy={(e) => {
                      // 복사 방지
                      e.preventDefault();
                      e.clipboardData.setData('text/plain', '');
                      return false;
                    }}
                    onDoubleClick={(e) => {
                      // 더블클릭 시에만 단어 선택 허용
                      e.preventDefault();
                      
                      // 더블 클릭된 위치의 단어 추출
                      // @ts-ignore - caretRangeFromPoint는 일부 브라우저에서 지원
                      const range = document.caretRangeFromPoint?.(e.clientX, e.clientY) || 
                                   (document as any).caretPositionFromPoint?.(e.clientX, e.clientY);
                      if (range) {
                        try {
                          // Range를 확장하여 단어 전체 선택
                          const textNode = range.startContainer;
                          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                            const text = textNode.textContent || '';
                            const start = Math.max(0, range.startOffset - 1);
                            const end = Math.min(text.length, range.endOffset + 1);
                            
                            // 단어 경계 찾기
                            let wordStart = start;
                            let wordEnd = end;
                            
                            // 앞쪽으로 단어 시작 찾기
                            while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
                              wordStart--;
                            }
                            
                            // 뒤쪽으로 단어 끝 찾기
                            while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
                              wordEnd++;
                            }
                            
                            const word = text.substring(wordStart, wordEnd).trim();
                            
                            // 단어가 포함된 문장 추출 (줄바꿈이나 마침표 기준)
                            let sentenceStart = wordStart;
                            let sentenceEnd = wordEnd;
                            
                            // 문장 시작 찾기 (이전 줄바꿈이나 마침표까지)
                            while (sentenceStart > 0 && !/[.!?\n]/.test(text[sentenceStart - 1])) {
                              sentenceStart--;
                            }
                            
                            // 문장 끝 찾기 (다음 줄바꿈이나 마침표까지)
                            while (sentenceEnd < text.length && !/[.!?\n]/.test(text[sentenceEnd])) {
                              sentenceEnd++;
                            }
                            
                            // 문장 추출 및 정리
                            let sentence = text.substring(sentenceStart, sentenceEnd).trim();
                            // ** 표시 제거
                            sentence = sentence.replace(/\*\*/g, '').trim();
                            
                            // 더블클릭 시 Firebase에서 단어 정보 가져오기만 (선택 목록에는 아직 추가하지 않음)
                            if (word) {
                              fetchWordFromFirebase(word, sentence, ocrText);
                              
                              // 시각적 피드백: 더블클릭 시 일시적으로 선택 표시
                              const selection = window.getSelection();
                              if (selection) {
                                try {
                                  const wordRange = document.createRange();
                                  wordRange.setStart(textNode, wordStart);
                                  wordRange.setEnd(textNode, wordEnd);
                                  selection.removeAllRanges();
                                  selection.addRange(wordRange);
                                  
                                  // 300ms 후 선택 해제
                                  setTimeout(() => {
                                    if (selection) {
                                      selection.removeAllRanges();
                                    }
                                  }, 300);
                                } catch (err) {
                                  // Range 생성 실패 시 무시
                                }
                              }
                            }
                          }
                        } catch (error) {
                          console.error('단어 추출 오류:', error);
                        }
                      }
                    }}
                  >
                    {ocrText || '텍스트를 찾을 수 없습니다.'}
                  </div>
                </>
              )}
              </div>
            ) : pastedImage ? (
              // 이미지 표시 모드
              <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex items-center justify-center min-h-0 flex-1 overflow-auto">
                <img
                  src={pastedImage}
                  alt="붙여넣은 이미지"
                  className="max-w-full max-h-full w-auto h-auto rounded-lg object-contain"
                />
              </div>
            ) : error ? (
              // 에러 표시
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <p className="text-red-600 font-semibold">{error}</p>
              </div>
            ) : (
              // 빈 상태
              <div className={`bg-white border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                isDragOver 
                  ? 'border-blue-500 bg-blue-50 scale-105' 
                  : 'border-gray-300'
              }`}>
                <div className="text-6xl mb-4">{isDragOver ? '📎' : '📋'}</div>
                <p className="text-gray-600 font-semibold text-lg mb-2">
                  {isDragOver ? '이미지를 놓아주세요' : '이미지 또는 텍스트를 붙여넣으세요'}
                </p>
                <p className="text-gray-500 text-sm">
                  {isDragOver 
                    ? '이미지 파일을 놓으면 자동으로 업로드됩니다'
                    : '스크린샷/텍스트를 복사한 후 (Cmd+V 또는 Ctrl+V)를 누르거나, 이미지 파일을 드래그 앤 드롭하세요'
                  }
                </p>
              </div>
            )}
          </div>

          {/* 단어 카드 영역 */}
          <WordCard
            isLoadingClickedWord={isLoadingClickedWord}
            clickedWordData={clickedWordData}
            clickedWordNotFound={clickedWordNotFound}
            isLoadingWordData={isLoadingWordData}
            wordDataList={wordDataList}
            currentWordIndex={currentWordIndex}
            batchProgress={batchProgress}
            highlightedMeaningIndex={highlightedMeaningIndex}
            isSavingMeaning={isSavingMeaning}
            selectedWords={selectedWords}
            lastDoubleClickedWord={lastDoubleClickedWord}
            userFlashcards={userFlashcards}
            onClose={() => setClickedWordData(null)}
            onCloseNotFound={() => {
              setClickedWordData(null);
              setClickedWordNotFound(false);
              setClickedWordForInput(null);
            }}
            onDirectInput={(word) => {
              setClickedWordForInput(word);
              setIsDirectInputOpen(true);
            }}
            onEditWord={(wordData, source) => {
              setEditingWord({ wordData, source });
            }}
            onAddToFlashcard={handleAddMeaningToWordsAndFlashcard}
            onSaveNewWordToWords={handleSaveNewWordToWords}
            onPreviousWord={() => setCurrentWordIndex((prev) => Math.max(0, prev - 1))}
            onNextWord={() => setCurrentWordIndex((prev) => Math.min(wordDataList.length - 1, prev + 1))}
          />
        </div>

        {/* 푸터 */}
        {!embedded && (
          <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
            <div className="flex justify-between gap-3">
              {showText && pastedImage ? (
                // 텍스트 모드일 때: 이미지로 돌아가기 버튼
                <button
                  onClick={() => {
                    setShowText(false);
                    setOcrText('');
                  }}
                  className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-semibold"
                >
                  ← 이미지로 돌아가기
                </button>
              ) : showText ? (
                // 텍스트만 있을 때: 빈 공간
                <div></div>
              ) : pastedImage ? (
                // 이미지 모드일 때: 텍스트로 바꾸기 버튼
                <button
                  onClick={handleConvertToText}
                  className="px-6 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl"
                >
                  📝 텍스트로 바꾸기
                </button>
              ) : (
                <div></div>
              )}
              {showText && selectedWords.length > 0 && (
                <div className="text-xs text-gray-500">
                  {selectedWords.length}개 단어 선택됨
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-semibold"
                >
                  취소
                </button>
                {showText && !isProcessingOCR && ocrText && (
                  <button
                    onClick={handleConfirm}
                    className="px-6 py-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl"
                  >
                    확인
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  );

  // 모달들은 embedded 모드에서도 항상 렌더링
  const modals = (
    <>
      {/* 뜻 편집 모달 */}
      {editingMeaning && (
        <MeaningEditModal
          word={editingMeaning.word}
          meaningIndex={editingMeaning.meaningIndex}
          source={editingMeaning.source}
          clickedWordData={clickedWordData}
          wordDataList={wordDataList}
          currentWordIndex={currentWordIndex}
          onClose={() => setEditingMeaning(null)}
          onSave={async (updatedMeaning) => {
            await saveMeaningToFirebase(
              editingMeaning.word,
              editingMeaning.meaningIndex,
              updatedMeaning,
              editingMeaning.source
            );
            setEditingMeaning(null);
          }}
          onDelete={async () => {
            await deleteMeaningFromFirebase(editingMeaning.word, editingMeaning.meaningIndex, editingMeaning.source);
            setEditingMeaning(null);
          }}
          isSaving={isSavingMeaning}
        />
      )}

      {/* 단어 수정 모달 */}
      {editingWord && (
        <WordEditModal
          wordData={editingWord.wordData}
          source={editingWord.source}
          onClose={() => setEditingWord(null)}
          onSave={async (updatedWordData) => {
            if (!user) {
              alert('로그인이 필요합니다.');
              return;
            }

            try {
              await updateWordInfoUtil(
                user,
                editingWord.wordData,
                updatedWordData,
                editingWord.source,
                { clickedWordData, wordDataList, currentWordIndex },
                { setClickedWordData, setWordDataList, setIsSavingMeaning }
              );
              alert('단어 정보가 수정되었습니다.');
              setEditingWord(null);
            } catch (err) {
              console.error('단어 정보 수정 오류:', err);
              alert('단어 정보 수정 중 오류가 발생했습니다.');
            }
          }}
          isSaving={isSavingMeaning}
        />
      )}

      {/* 단어장에 추가 모달 */}
      {addingToFlashcard && (
        <AddToFlashcardModal
          word={addingToFlashcard.word}
          meaning={addingToFlashcard.meaning}
          pronunciation={addingToFlashcard.pronunciation}
          onClose={() => setAddingToFlashcard(null)}
          onSave={handleSaveToFlashcard}
          isSaving={isSavingMeaning}
        />
      )}
    </>
  );

  if (embedded) {
    return (
      <>
        {contentComponent}
        {modals}
      </>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{ touchAction: 'none' }}
      onClick={(e) => {
        // 모달 배경 클릭 시 이벤트 전파 방지
        if (e.target === e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      {contentComponent}
      {modals}

      {/* 직접 입력 모달 */}
      {isDirectInputOpen && clickedWordForInput && (
        <PasteImageDirectWordInputModal
          word={clickedWordForInput}
          onClose={() => {
            setIsDirectInputOpen(false);
            setClickedWordForInput(null);
          }}
          onSave={async (pos: string, definition: string, example: string) => {
            const success = await saveDirectWordToFirebase(clickedWordForInput, pos, definition, example);
            if (success) {
              // 저장 후 단어 정보 다시 가져오기
              await fetchWordFromFirebase(clickedWordForInput);
              setIsDirectInputOpen(false);
              setClickedWordForInput(null);
              setClickedWordNotFound(false);
            }
          }}
          isSaving={isSavingMeaning}
        />
      )}

      {/* ChatGPT 새 단어 저장 다이얼로그 */}
      {showNewWordSaveDialog && newWordFromChatGPT && (
        <NewWordSaveDialog
          wordData={newWordFromChatGPT}
          onSaveToWords={handleSaveNewWordToWords}
          onSaveToFlashcard={handleSaveNewWordToFlashcard}
          onClose={() => {
            setShowNewWordSaveDialog(false);
            setNewWordFromChatGPT(null);
          }}
          isSaving={isSavingMeaning}
        />
      )}

    </div>
  );
}
