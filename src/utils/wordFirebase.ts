import { db, auth } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc, deleteDoc } from 'firebase/firestore';
import { POS_MAP, getPosTag, formatExampleText } from './wordUtils';
import { fetchWordFromChatGPT, findMostSimilarMeaning } from './wordApi';
import nlp from 'compromise';

// words 컬렉션에 단어 저장
export const saveWordToWordsCollection = async (wordKey: string, wordData: any) => {
  try {
    await setDoc(
      doc(db, 'words', wordKey.toLowerCase()),
      wordData,
      { merge: true }
    );
    console.log(`"${wordKey}" 단어가 words 컬렉션에 저장되었습니다.`);
  } catch (error) {
    console.error('words 컬렉션 저장 실패:', error);
    throw error;
  }
};

// 특정 뜻을 words 컬렉션과 flashcards에 모두 저장
// 반환값: { saved: boolean, message: string } - 저장 여부와 메시지
export const addMeaningToWordsAndFlashcard = async (
  user: any,
  word: string,
  meaning: any,
  pronunciation?: string,
  groupId?: string,
  difficulty?: string
): Promise<{ saved: boolean; message: string }> => {
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }
  
  const wordKey = word.toLowerCase();
  const uid = user.uid;
  
  // 1. words 컬렉션에 저장/업데이트
  const wordDocRef = doc(db, 'words', wordKey);
  const wordDocSnap = await getDoc(wordDocRef);
  
  const nowIso = new Date().toISOString();
  let wordMeanings: any[] = [];
  let wordPos: string[] = [];
  
  if (wordDocSnap.exists()) {
    const wordData = wordDocSnap.data() as any;
    wordMeanings = Array.isArray(wordData.meanings) ? [...wordData.meanings] : [];
    wordPos = Array.isArray(wordData.pos) ? [...wordData.pos] : [];
    
    // 중복 체크 (같은 definition이 이미 있는지)
    const isDuplicate = wordMeanings.some((m: any) => m.definition === meaning.definition);
    if (!isDuplicate) {
      // embedding 제거한 meaning 복사
      const meaningWithoutEmbedding = { ...meaning };
      delete meaningWithoutEmbedding.embedding;
      
      wordMeanings.push({
        ...meaningWithoutEmbedding,
        updatedAt: nowIso
      });
    }
  } else {
    // words 컬렉션에 단어가 없으면 새로 생성
    const meaningWithoutEmbedding = { ...meaning };
    delete meaningWithoutEmbedding.embedding;
    
    wordMeanings = [{
      ...meaningWithoutEmbedding,
      updatedAt: nowIso
    }];
    
    // POS 추출
    const extractedPosMatch = meaning.definition?.match(/^\s*\[([^\]]+)\]/);
    if (extractedPosMatch) {
      const extractedPosValue = extractedPosMatch[1];
      const extractedPosLabel = `[${extractedPosValue}]`;
      const posEntry = Object.entries(POS_MAP).find(([, label]) => label === extractedPosLabel);
      const canonicalPos = posEntry ? posEntry[0] : extractedPosValue.toLowerCase();
      wordPos = [canonicalPos];
    }
  }
  
  await setDoc(
    wordDocRef,
    {
      word: word,
      meanings: wordMeanings,
      pos: wordPos,
      pronunciation: pronunciation || '',
      updatedAt: nowIso
    },
    { merge: true }
  );
  
  // 2. users 문서의 flashcards 배열에 추가
  const userDocRef = doc(db, 'users', uid);
  const userDocSnap = await getDoc(userDocRef);
  const userData = userDocSnap.exists() ? userDocSnap.data() : {};
  const flashcards = (userData.flashcards || []) as any[];
  
  // 중복 체크 (같은 단어와 정의가 이미 있는지)
  // card.definition 또는 card.meaning?.definition 둘 다 확인
  const isDuplicateFlashcard = flashcards.some((card: any) => {
    const cardDefinition = card.definition || card.meaning?.definition;
    return card.word === word && cardDefinition === meaning.definition;
  });
  
  if (!isDuplicateFlashcard) {
    // embedding 제거한 meaning 복사
    const meaningWithoutEmbedding = { ...meaning };
    delete meaningWithoutEmbedding.embedding;
    
    // 기존 단어 찾기 (word로)
    const existingIndex = flashcards.findIndex((card: any) => card.word === word);
    let existingCard: any = null;
    
    if (existingIndex >= 0) {
      existingCard = flashcards[existingIndex];
    }
    
    // groups 배열 처리
    let groups: string[] = [];
    if (existingCard && existingCard.groups) {
      groups = Array.isArray(existingCard.groups) ? [...existingCard.groups] : [];
    }
    if (groupId && !groups.includes(groupId)) {
      groups.push(groupId);
    }
    
    // viewCount 처리
    const viewCount = existingCard?.viewCount ?? 0;
    
    // createdAt 처리 (기존 값이 있으면 유지, 없으면 새로 생성)
    const createdAt = existingCard?.createdAt || new Date().toISOString();
    
    const flashcardData = {
      word: word,
      pronunciation: pronunciation || '',
      meaning: meaningWithoutEmbedding, // Flutter 앱처럼 meaning 객체로 저장
      groups: groups.length > 0 ? groups : undefined,
      difficulty: difficulty || 'normal',
      viewCount: viewCount,
      createdAt: createdAt,
      updatedAt: new Date().toISOString(),
      lastReviewedAt: existingCard?.lastReviewedAt ?? null,
      nextReviewDate: existingCard?.nextReviewDate ?? null,
      level: existingCard?.level ?? 0,
    };
    
    if (existingIndex >= 0) {
      flashcards[existingIndex] = flashcardData;
    } else {
      flashcards.push(flashcardData);
    }
    
    await setDoc(userDocRef, { flashcards }, { merge: true });
    return { saved: true, message: '단어장에 추가되었습니다.' };
  } else if (groupId) {
    // 중복이지만 그룹이 다른 경우 groups 배열에 추가
    const existingIndex = flashcards.findIndex((card: any) => {
      const cardDefinition = card.definition || card.meaning?.definition;
      return card.word === word && cardDefinition === meaning.definition;
    });
    
    if (existingIndex >= 0) {
      const existingCard = flashcards[existingIndex];
      const groups: string[] = existingCard.groups ? [...existingCard.groups] : [];
      if (!groups.includes(groupId)) {
        groups.push(groupId);
        flashcards[existingIndex] = {
          ...existingCard,
          groups: groups,
          updatedAt: new Date().toISOString()
        };
        await setDoc(userDocRef, { flashcards }, { merge: true });
        return { saved: true, message: '단어가 다른 그룹에도 추가되었습니다.' };
      } else {
        return { saved: false, message: '이미 해당 그룹에 있는 단어입니다.' };
      }
    }
    return { saved: false, message: '이미 단어장에 있는 단어입니다.' };
  } else {
    return { saved: false, message: '이미 단어장에 있는 단어입니다.' };
  }
};

// Firebase에서 단어 정보 가져오기 (words 컬렉션 전용)
export const fetchWordFromFirebase = async (
  word: string,
  generateLookupCandidates: (word: string) => string[],
  setStateCallbacks: {
    setIsLoadingClickedWord: (loading: boolean) => void;
    setClickedWordData: (data: any | null) => void;
    setClickedWordNotFound: (notFound: boolean) => void;
    setHighlightedMeaningIndex: (index: number | null) => void;
    setLastDoubleClickedWord: (word: string) => void;
    setNewWordFromChatGPT: (data: any) => void;
  },
  ocrText: string,
  sentence?: string,
  fullText?: string
): Promise<void> => {
  const {
    setIsLoadingClickedWord,
    setClickedWordData,
    setClickedWordNotFound,
    setHighlightedMeaningIndex,
    setLastDoubleClickedWord,
    setNewWordFromChatGPT
  } = setStateCallbacks;

  setIsLoadingClickedWord(true);
  setClickedWordData(null);
  setClickedWordNotFound(false);
  setHighlightedMeaningIndex(null);
  setLastDoubleClickedWord(word);
  
  try {
    const lookupCandidates = generateLookupCandidates(word);
    if (!lookupCandidates.length) {
      throw new Error('단어를 식별할 수 없습니다.');
    }

    let wordData: any = null;
    let meanings: any[] = [];
    let pos: string[] = [];
    const allCandidates = Array.from(new Set(lookupCandidates));
    
    for (const candidate of allCandidates) {
      const wordDocRef = doc(db, 'words', candidate);
      const wordDocSnap = await getDoc(wordDocRef);
      
      if (wordDocSnap.exists()) {
        const data = wordDocSnap.data() as any;
        meanings = data.meanings || [];
        pos = data.pos || [];
        
        wordData = {
          word: data.word || candidate,
          pronunciation: data.pronunciation || '',
          pos: pos,
          meanings: meanings,
          updatedAt: data.updatedAt || ''
        };
        break;
      }
    }
    
    // Firebase에서 단어를 찾지 못한 경우 ChatGPT API 호출
    if (!wordData) {
      try {
        // 원형(lemma) 찾기
        const nlpDoc = nlp(word);
        const baseForm = nlpDoc.nouns().toSingular().out('text') || 
                        nlpDoc.verbs().toInfinitive().out('text') || 
                        word.toLowerCase();
        
        // 사용자 프로필 정보 가져오기 (englishLevel, studyFields)
        let englishLevel: string | undefined;
        let studyFields: string[] | undefined;
        
        try {
          const user = auth.currentUser;
          if (user) {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              englishLevel = userData.englishLevel as string | undefined;
              const fields = userData.studyFields || userData.studyField || [];
              studyFields = Array.isArray(fields) 
                ? fields.filter((f: string) => ['KSAT', 'Toeic', 'Toefl'].includes(f))
                : [];
            }
          }
        } catch (profileError) {
          console.error('사용자 프로필 로드 실패:', profileError);
          // 프로필 로드 실패해도 계속 진행
        }
        
        // ChatGPT API 호출 (Flutter 앱과 동일: fromBrowser: true)
        const chatGPTData = await fetchWordFromChatGPT(word, baseForm, {
          fromBrowser: true,
          englishLevel,
          studyFields,
        });
        
        if (chatGPTData) {
          // meanings가 비어있거나 "존재하지 않는" 메시지가 있는지 확인
          const chatGPTMeanings = chatGPTData.meanings || [];
          let isInvalidWord = false;
          
          if (chatGPTMeanings.length === 0) {
            isInvalidWord = true;
          } else {
            const firstMeaning = chatGPTMeanings[0];
            const definition = firstMeaning?.definition || '';
            if (definition.includes('존재하지 않는') || 
                definition.includes('존재하지 않습니다') || 
                definition.includes('없는 단어')) {
              isInvalidWord = true;
            }
          }
          
          if (isInvalidWord) {
            setClickedWordData(null);
            setClickedWordNotFound(true);
            return;
          }
          
          // ChatGPT에서 받아온 단어 정보를 저장하지 않고 사용자에게 표시
          setNewWordFromChatGPT(chatGPTData);
          
          // 임시로 wordData에 설정하여 표시 (저장은 안 됨)
          meanings = chatGPTData.meanings || [];
          pos = chatGPTData.pos || [];
          
          wordData = {
            word: chatGPTData.word || word,
            pronunciation: chatGPTData.pronunciation || '',
            pos: pos,
            meanings: meanings,
            updatedAt: chatGPTData.updatedAt || '',
            isFromChatGPT: true // ChatGPT에서 온 데이터임을 표시
          };
        }
      } catch (chatGPTError) {
        console.error('ChatGPT API 호출 오류:', chatGPTError);
        setClickedWordData(null);
        setClickedWordNotFound(true);
        return;
      }
    }
    
    if (wordData) {
      setClickedWordData(wordData);
      setClickedWordNotFound(false);
      
      // 문장이 제공되고 meanings에 embedding이 있으면 가장 유사한 뜻 찾기
      if (sentence && meanings.length > 0) {
        try {
          const mostSimilarIndex = await findMostSimilarMeaning(sentence, meanings, fullText || ocrText, word, pos);
          if (mostSimilarIndex !== null) {
            setHighlightedMeaningIndex(mostSimilarIndex);
          }
        } catch (error) {
          console.error('유사도 계산 중 오류 (계속 진행):', error);
        }
      }
    } else {
      setClickedWordData(null);
      setClickedWordNotFound(true);
    }
  } catch (error) {
    console.error('Firebase에서 단어 정보 가져오기 오류:', error);
    setClickedWordData(null);
    setClickedWordNotFound(true);
  } finally {
    setIsLoadingClickedWord(false);
  }
};

// Firebase에 뜻 저장 함수 (사용자 단어장에 저장)
export const saveMeaningToFirebase = async (
  user: any,
  word: string,
  meaningIndex: number,
  updatedMeaning: any,
  source: 'clicked' | 'list',
  stateData: {
    clickedWordData: any | null;
    wordDataList: any[];
    currentWordIndex: number;
  },
  setStateCallbacks: {
    setClickedWordData: (data: any | null) => void;
    setWordDataList: (data: any[]) => void;
    setIsSavingMeaning: (saving: boolean) => void;
  }
): Promise<void> => {
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { setClickedWordData, setWordDataList, setIsSavingMeaning } = setStateCallbacks;
  const { clickedWordData, wordDataList, currentWordIndex } = stateData;

  setIsSavingMeaning(true);
  try {
    const email = user.email;
    const uid = user.uid;
    
    if (!email) throw new Error('이메일 정보를 찾을 수 없습니다.');

    const username = email.split('@')[0];
    const userDocId = `${username}${uid}`;
    const userDocRef = doc(db, 'users', userDocId);

    // 기존 데이터 가져오기
    const userDocSnap = await getDoc(userDocRef);
    const userData = userDocSnap.exists() ? userDocSnap.data() : {};
    const meanings = userData.meanings || {};

    // 현재 단어의 meanings 가져오기
    let currentMeanings: any[] = [];
    if (source === 'clicked' && clickedWordData) {
      currentMeanings = clickedWordData.meanings || [];
    } else if (source === 'list' && wordDataList[currentWordIndex]) {
      currentMeanings = wordDataList[currentWordIndex].meanings || [];
    }

    // 만약 사용자 단어장에 해당 단어가 없으면, 현재 표시된 meanings를 복사
    if (!meanings[word] && currentMeanings.length > 0) {
      meanings[word] = {
        meanings: [...currentMeanings],
        updatedAt: new Date().toISOString()
      };
    }

    // 업데이트된 meanings 배열 생성
    const updatedMeanings = meanings[word] ? [...meanings[word].meanings] : [...currentMeanings];
    
    // meaningIndex가 유효한 범위인지 확인
    if (meaningIndex >= 0 && meaningIndex < updatedMeanings.length) {
      updatedMeanings[meaningIndex] = {
        ...updatedMeanings[meaningIndex],
        ...updatedMeaning,
        updatedAt: new Date().toISOString()
      };
    } else {
      // 인덱스가 범위를 벗어나면 새로 추가
      updatedMeanings.push({
        ...updatedMeaning,
        updatedAt: new Date().toISOString()
      });
    }

    // 해당 단어의 meanings 업데이트
    meanings[word] = {
      meanings: updatedMeanings,
      updatedAt: new Date().toISOString()
    };

    // Firestore에 저장 (사용자 단어장)
    await setDoc(userDocRef, { meanings }, { merge: true });

    // words 컬렉션 업데이트
    const trimmedWord = word.trim();
    const lowerCaseWord = trimmedWord.toLowerCase();
    const wordDocRef = doc(db, 'words', lowerCaseWord);
    const wordDocSnap = await getDoc(wordDocRef);

    if (wordDocSnap.exists()) {
      const wordDocData = wordDocSnap.data();
      const wordDocMeanings: any[] = Array.isArray(wordDocData.meanings) ? [...wordDocData.meanings] : [];
      const nowIso = new Date().toISOString();

      if (meaningIndex >= 0 && meaningIndex < wordDocMeanings.length) {
        wordDocMeanings[meaningIndex] = {
          ...wordDocMeanings[meaningIndex],
          ...updatedMeaning,
          updatedAt: nowIso
        };
      } else {
        wordDocMeanings.push({
          ...updatedMeaning,
          updatedAt: nowIso
        });
      }

      const extractedPosMatch = updatedMeaning.definition?.match(/^\s*\[([^\]]+)\]/);
      const extractedPosValue = extractedPosMatch ? extractedPosMatch[1] : null;
      let nextPos: string[] = [];

      if (extractedPosValue) {
        const extractedPosLabel = `[${extractedPosValue}]`;
        const posEntry = Object.entries(POS_MAP).find(([, label]) => label === extractedPosLabel);
        const canonicalPos = posEntry ? posEntry[0] : extractedPosValue.toLowerCase();
        nextPos = [canonicalPos];
      }

      await setDoc(
        wordDocRef,
        {
          meanings: wordDocMeanings,
          pos: nextPos,
          updatedAt: nowIso
        },
        { merge: true }
      );
    }

    // 로컬 state 업데이트
    if (source === 'clicked' && clickedWordData) {
      setClickedWordData({
        ...clickedWordData,
        meanings: updatedMeanings
      });
    } else if (source === 'list' && wordDataList[currentWordIndex]) {
      const updatedWordDataList = [...wordDataList];
      updatedWordDataList[currentWordIndex] = {
        ...updatedWordDataList[currentWordIndex],
        meanings: updatedMeanings
      };
      setWordDataList(updatedWordDataList);
    }
  } catch (err) {
    console.error('뜻 저장 오류:', err);
    throw err;
  } finally {
    setIsSavingMeaning(false);
  }
};

// Firebase에서 뜻 삭제 함수 (사용자 단어장에서 삭제)
export const deleteMeaningFromFirebase = async (
  user: any,
  word: string,
  meaningIndex: number,
  source: 'clicked' | 'list',
  stateData: {
    clickedWordData: any | null;
    wordDataList: any[];
    currentWordIndex: number;
  },
  setStateCallbacks: {
    setClickedWordData: (data: any | null) => void;
    setWordDataList: (data: any[]) => void;
    setIsSavingMeaning: (saving: boolean) => void;
  }
): Promise<void> => {
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { setClickedWordData, setWordDataList, setIsSavingMeaning } = setStateCallbacks;
  const { clickedWordData, wordDataList, currentWordIndex } = stateData;

  setIsSavingMeaning(true);
  try {
    const email = user.email;
    const uid = user.uid;
    
    if (!email) throw new Error('이메일 정보를 찾을 수 없습니다.');

    const username = email.split('@')[0];
    const userDocId = `${username}${uid}`;
    const userDocRef = doc(db, 'users', userDocId);

    // 기존 데이터 가져오기
    const userDocSnap = await getDoc(userDocRef);
    const userData = userDocSnap.exists() ? userDocSnap.data() : {};
    const meanings = userData.meanings || {};

    // 현재 단어의 meanings 가져오기
    let currentMeanings: any[] = [];
    if (source === 'clicked' && clickedWordData) {
      currentMeanings = clickedWordData.meanings || [];
    } else if (source === 'list' && wordDataList[currentWordIndex]) {
      currentMeanings = wordDataList[currentWordIndex].meanings || [];
    }

    // 만약 사용자 단어장에 해당 단어가 없으면, 현재 표시된 meanings를 복사
    if (!meanings[word] && currentMeanings.length > 0) {
      meanings[word] = {
        meanings: [...currentMeanings],
        updatedAt: new Date().toISOString()
      };
    }

    // 뜻 삭제
    const updatedMeanings = meanings[word] 
      ? meanings[word].meanings.filter((_: any, idx: number) => idx !== meaningIndex)
      : currentMeanings.filter((_: any, idx: number) => idx !== meaningIndex);

    // 해당 단어의 meanings 업데이트
    meanings[word] = {
      meanings: updatedMeanings,
      updatedAt: new Date().toISOString()
    };

    // Firestore에 저장
    await setDoc(userDocRef, { meanings }, { merge: true });

    // 로컬 state 업데이트
    if (source === 'clicked' && clickedWordData) {
      setClickedWordData({
        ...clickedWordData,
        meanings: updatedMeanings
      });
    } else if (source === 'list' && wordDataList[currentWordIndex]) {
      const updatedWordDataList = [...wordDataList];
      updatedWordDataList[currentWordIndex] = {
        ...updatedWordDataList[currentWordIndex],
        meanings: updatedMeanings
      };
      setWordDataList(updatedWordDataList);
    }
  } catch (err) {
    console.error('뜻 삭제 오류:', err);
    throw err;
  } finally {
    setIsSavingMeaning(false);
  }
};

// 직접 입력 단어를 Firebase에 저장하는 함수
export const saveDirectWordToFirebase = async (
  user: any,
  word: string,
  pos: string,
  definition: string,
  example: string
): Promise<boolean> => {
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  if (!word.trim() || !pos.trim() || !definition.trim() || !example.trim()) {
    throw new Error('모든 필드를 입력해주세요.');
  }

  try {
    const email = user.email;
    const uid = user.uid;
    
    if (!email) throw new Error('이메일 정보를 찾을 수 없습니다.');

    const username = email.split('@')[0];
    const userDocId = `${username}${uid}`;
    const userDocRef = doc(db, 'users', userDocId);

    // 기존 데이터 가져오기
    const userDocSnap = await getDoc(userDocRef);
    const userData = userDocSnap.exists() ? userDocSnap.data() : {};
    const meanings = userData.meanings || {};

    // 품사 태그 추가
    const trimmedWord = word.trim();
    const lowerCaseWord = trimmedWord.toLowerCase();
    const normalizedPos = pos.trim().toLowerCase();
    const posTag = getPosTag(pos);
    const definitionWithTag = posTag ? `${posTag} ${definition.trim()}` : definition.trim();
    const rawExample = example.trim();
    const formattedExample = await formatExampleText(rawExample);
    const exampleText = formattedExample || rawExample;
    const now = new Date();
    const nowIso = now.toISOString();

    const mergePosValues = (...values: Array<string | string[] | undefined>) => {
      const set = new Set<string>();
      values.forEach((value) => {
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (typeof item === 'string' && item.trim()) {
              set.add(item.trim().toLowerCase());
            }
          });
        } else if (typeof value === 'string' && value.trim()) {
          set.add(value.trim().toLowerCase());
        }
      });
      return Array.from(set);
    };

    const extractMeaningIndex = (id?: unknown) => {
      if (typeof id !== 'string') return null;
      const match = id.match(new RegExp(`^${lowerCaseWord}_(\\d+)$`, 'i'));
      if (!match) return null;
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const getNextMeaningId = (list: any[]) => {
      let maxIndex = 0;
      list.forEach((item) => {
        const idx = extractMeaningIndex(item?.id);
        if (typeof idx === 'number' && idx > maxIndex) {
          maxIndex = idx;
        }
      });
      return `${lowerCaseWord}_${maxIndex + 1}`;
    };

    const createMeaningEntry = (id: string) => ({
      id,
      definition: definitionWithTag,
      examples: [exampleText],
      keywords: [],
      embedding: {
        transformers: [],
        tensorflow: []
      },
      difficulty: 1,
      frequency: 1,
      source: 'manual',
      updatedAt: nowIso
    });

    let queuedMeaning: any | null = null;

    const mergeMeaningArray = (existing: any[] = [], captureNewMeaning = false) => {
      const cloned = existing.map((item) => ({
        ...item,
        examples: Array.isArray(item.examples) ? [...item.examples] : []
      }));

      const index = cloned.findIndex((item) => item.definition === definitionWithTag);

      if (index >= 0) {
        const target = cloned[index];
        const existingExamples = Array.isArray(target.examples) ? target.examples : [];
        const mergedExamples = Array.from(new Set([...existingExamples, exampleText]));
        const retainedId =
          typeof target.id === 'string' && target.id.trim()
            ? target.id
            : getNextMeaningId(cloned);

        cloned[index] = {
          ...target,
          id: retainedId,
          definition: definitionWithTag,
          examples: mergedExamples,
          keywords: Array.isArray(target.keywords) ? target.keywords : [],
          embedding:
            typeof target.embedding === 'object' && target.embedding !== null
              ? target.embedding
              : { transformers: [], tensorflow: [] },
          difficulty: target.difficulty || 1,
          frequency: (target.frequency || 0) + 1,
          source: target.source || 'manual',
          updatedAt: nowIso
        };
      } else {
        const newId = getNextMeaningId(cloned);
        const newMeaning = createMeaningEntry(newId);
        cloned.push(newMeaning);
        if (captureNewMeaning) {
          queuedMeaning = newMeaning;
        }
      }

      return cloned;
    };

    const userWordEntry = meanings[trimmedWord] || { meanings: [], pos: [], updatedAt: nowIso };
    const updatedUserMeanings = mergeMeaningArray(userWordEntry.meanings, false);
    const updatedUserPos = mergePosValues(userWordEntry.pos, normalizedPos);
    meanings[trimmedWord] = {
      pos: updatedUserPos,
      meanings: updatedUserMeanings,
      updatedAt: nowIso
    };

    // Firestore에 저장
    await setDoc(userDocRef, { meanings }, { merge: true });

    // words 컬렉션에도 저장하여 글로벌 검색이 가능하도록 처리
    const wordDocRef = doc(db, 'words', lowerCaseWord);
    const wordDocSnap = await getDoc(wordDocRef);
    const wordDocData = wordDocSnap.exists() ? wordDocSnap.data() : {};

    const isNewWordInWordsCollection = !wordDocSnap.exists();
    const existingWordMeanings: any[] = Array.isArray(wordDocData.meanings) ? wordDocData.meanings : [];
    queuedMeaning = null;
    const updatedWordMeanings = mergeMeaningArray(existingWordMeanings, true);

    const existingPos: string[] = Array.isArray(wordDocData.pos) ? wordDocData.pos : [];
    const updatedPos = mergePosValues(existingPos, updatedUserPos, normalizedPos);

    await setDoc(
      wordDocRef,
      {
        word: wordDocData.word || trimmedWord,
        pos: updatedPos,
        meanings: updatedWordMeanings,
        updatedAt: nowIso
      },
      { merge: true }
    );

    if (queuedMeaning) {
      try {
        // 사용자별 통계 집계를 위한 userId 저장
        let userId: string | null = null;
        let userUid: string | null = null;
        let userEmail: string | null = null;

        if (user?.uid && user.email) {
          const username = user.email.split('@')[0];
          userId = `${username}${user.uid}`;
          userUid = user.uid;
          userEmail = user.email;
        }

        console.log('[PasteImageModal] newWords 저장 준비:', {
          word: trimmedWord,
          eventType: isNewWordInWordsCollection ? 'new-word' : 'new-meaning',
          createdAt: nowIso,
          userId,
          userUid,
          userEmail
        });

        await addDoc(collection(db, 'newWords'), {
          word: trimmedWord,
          eventType: isNewWordInWordsCollection ? 'new-word' : 'new-meaning',
          meaning: queuedMeaning,
          createdAt: nowIso,
          source: 'manual',
          userId,
          userUid,
          userEmail
        });
        console.log('[PasteImageModal] newWords 저장 완료');
      } catch (queueError) {
        console.error('새로운 단어 큐 저장 실패:', queueError);
      }
    }

    return true;
  } catch (err) {
    console.error('단어 저장 오류:', err);
    throw err;
  }
};

// ChatGPT로부터 받은 새 단어를 words 컬렉션에 저장
export const saveNewWordToWords = async (
  newWordFromChatGPT: any,
  setStateCallbacks: {
    setClickedWordData: (data: any | null) => void;
    setShowNewWordSaveDialog: (show: boolean) => void;
    setNewWordFromChatGPT: (data: any | null) => void;
    setIsSavingMeaning: (saving: boolean) => void;
  }
): Promise<void> => {
  if (!newWordFromChatGPT) {
    throw new Error('저장할 단어 정보가 없습니다.');
  }

  const { setClickedWordData, setShowNewWordSaveDialog, setNewWordFromChatGPT, setIsSavingMeaning } = setStateCallbacks;

  setIsSavingMeaning(true);
  try {
    const wordKey = (newWordFromChatGPT.word || '').toLowerCase();
    await saveWordToWordsCollection(wordKey, newWordFromChatGPT);
    
    // 저장 후 단어 정보 다시 가져오기
    const savedDocRef = doc(db, 'words', wordKey);
    const savedDocSnap = await getDoc(savedDocRef);
    
    if (savedDocSnap.exists()) {
      const savedData = savedDocSnap.data() as any;
      const meanings = savedData.meanings || [];
      const pos = savedData.pos || [];
      
      // clickedWordData 업데이트 (isFromChatGPT 플래그 제거)
      setClickedWordData({
        word: savedData.word || wordKey,
        pos: pos,
        meanings: meanings,
        updatedAt: savedData.updatedAt || ''
      });
    }
    
    setShowNewWordSaveDialog(false);
    setNewWordFromChatGPT(null);
  } catch (error) {
    console.error('words 컬렉션 저장 오류:', error);
    throw error;
  } finally {
    setIsSavingMeaning(false);
  }
};

// ChatGPT로부터 받은 새 단어를 단어장(flashcards)에 저장 (선택한 의미만)
export const saveNewWordToFlashcard = async (
  user: any,
  newWordFromChatGPT: any,
  selectedMeaning: any,
  setStateCallbacks: {
    setShowNewWordSaveDialog: (show: boolean) => void;
    setNewWordFromChatGPT: (data: any | null) => void;
    setIsSavingMeaning: (saving: boolean) => void;
  }
): Promise<void> => {
  if (!newWordFromChatGPT || !user || !selectedMeaning) {
    throw new Error('저장할 단어 정보가 없습니다.');
  }

  const { setShowNewWordSaveDialog, setNewWordFromChatGPT, setIsSavingMeaning } = setStateCallbacks;

  setIsSavingMeaning(true);
  try {
    const uid = user.uid;
    const userDocRef = doc(db, 'users', uid);
    
    const word = newWordFromChatGPT.word || '';
    const pronunciation = newWordFromChatGPT.pronunciation || '';
    
    // flashcard 데이터 생성 (선택한 meaning만)
    const flashcardData = {
      word: word,
      pronunciation: pronunciation,
      definition: selectedMeaning.definition || '',
      examples: selectedMeaning.examples || [],
      createdAt: new Date().toISOString(),
      lastReviewedAt: null,
      nextReviewDate: null,
      level: 0,
    };
    
    // users 문서의 flashcards 배열에 추가
    const userDocSnap = await getDoc(userDocRef);
    const userData = userDocSnap.exists() ? userDocSnap.data() : {};
    const flashcards = userData.flashcards || [];
    
    flashcards.push(flashcardData);
    
    await setDoc(userDocRef, { flashcards }, { merge: true });
    
    setShowNewWordSaveDialog(false);
    setNewWordFromChatGPT(null);
  } catch (error) {
    console.error('단어장 저장 오류:', error);
    throw error;
  } finally {
    setIsSavingMeaning(false);
  }
};

// 단어 정보 수정 함수 (스펠링, 발음기호, 예문)
export const updateWordInfo = async (
  user: any,
  originalWordData: any,
  updatedWordData: any,
  source: 'clicked' | 'list',
  stateData: {
    clickedWordData: any | null;
    wordDataList: any[];
    currentWordIndex: number;
  },
  stateSetters: {
    setClickedWordData: (data: any | null) => void;
    setWordDataList: (data: any[]) => void;
    setIsSavingMeaning: (saving: boolean) => void;
  }
): Promise<void> => {
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { setClickedWordData, setWordDataList, setIsSavingMeaning } = stateSetters;
  const { clickedWordData, wordDataList, currentWordIndex } = stateData;

  setIsSavingMeaning(true);
  try {
    const originalWord = originalWordData.word || '';
    const updatedWord = updatedWordData.word || '';
    const originalWordKey = originalWord.toLowerCase();
    const updatedWordKey = updatedWord.toLowerCase();

    // words 컬렉션 업데이트
    const originalWordDocRef = doc(db, 'words', originalWordKey);
    const originalWordDocSnap = await getDoc(originalWordDocRef);

    if (!originalWordDocSnap.exists()) {
      throw new Error('단어를 찾을 수 없습니다.');
    }

    const originalWordDocData = originalWordDocSnap.data() as any;
    const nowIso = new Date().toISOString();

    // 단어가 변경된 경우
    if (originalWordKey !== updatedWordKey) {
      // 새 단어 문서 생성
      const newWordDocRef = doc(db, 'words', updatedWordKey);
      const newWordData = {
        ...originalWordDocData,
        word: updatedWord,
        pronunciation: updatedWordData.pronunciation || originalWordDocData.pronunciation || '',
        meanings: updatedWordData.meanings || originalWordDocData.meanings || [],
        updatedAt: nowIso
      };

      await setDoc(newWordDocRef, newWordData);

      // 기존 단어 문서 삭제
      await deleteDoc(originalWordDocRef);
    } else {
      // 단어는 그대로, 발음기호와 예문만 업데이트
      const updateData: any = {
        meanings: updatedWordData.meanings || originalWordDocData.meanings || [],
        updatedAt: nowIso
      };

      if (updatedWordData.pronunciation !== undefined) {
        updateData.pronunciation = updatedWordData.pronunciation || '';
      }

      await setDoc(originalWordDocRef, updateData, { merge: true });
    }

    // 로컬 state 업데이트
    if (source === 'clicked' && clickedWordData) {
      setClickedWordData({
        ...clickedWordData,
        word: updatedWord,
        pronunciation: updatedWordData.pronunciation || clickedWordData.pronunciation || '',
        meanings: updatedWordData.meanings || clickedWordData.meanings || []
      });
    } else if (source === 'list' && wordDataList[currentWordIndex]) {
      const updatedWordDataList = [...wordDataList];
      updatedWordDataList[currentWordIndex] = {
        ...updatedWordDataList[currentWordIndex],
        word: updatedWord,
        pronunciation: updatedWordData.pronunciation || updatedWordDataList[currentWordIndex].pronunciation || '',
        meanings: updatedWordData.meanings || updatedWordDataList[currentWordIndex].meanings || []
      };
      setWordDataList(updatedWordDataList);
    }
  } catch (err) {
    console.error('단어 정보 수정 오류:', err);
    throw err;
  } finally {
    setIsSavingMeaning(false);
  }
};

