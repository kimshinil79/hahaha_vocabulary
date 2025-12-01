'use client';

import { useState, useEffect, useRef } from 'react';
import nlp from 'compromise';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { API_CONFIG } from '@/lib/api-config';
import MeaningEditModal from '@/components/MeaningEditModal';

const TOKEN_MATCHER_BASE_URL = (process.env.NEXT_PUBLIC_TOKEN_MATCHER_URL || 'https://token-matcher-1017620600279.asia-northeast3.run.app').replace(/\/$/, '');

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
  const [isSavingMeaning, setIsSavingMeaning] = useState(false); // 뜻 저장 중 여부
  const [isDirectInputOpen, setIsDirectInputOpen] = useState(false); // 직접 입력 모달 열림 여부
  const [clickedWordForInput, setClickedWordForInput] = useState<string | null>(null); // 직접 입력할 단어
  const [lastDoubleClickedWord, setLastDoubleClickedWord] = useState<string | null>(null); // 마지막으로 더블 클릭한 단어
  const containerRef = useRef<HTMLDivElement>(null);
  
  // ChatGPT에서 받아온 새 단어 정보 (저장 전)
  const [newWordFromChatGPT, setNewWordFromChatGPT] = useState<any>(null);
  const [showNewWordSaveDialog, setShowNewWordSaveDialog] = useState(false);

  const POS_MAP: Record<string, string> = {
    noun: '[명사]',
    verb: '[동사]',
    adjective: '[형용사]',
    adverb: '[부사]',
    pronoun: '[대명사]',
    preposition: '[전치사]',
    conjunction: '[접속사]',
    interjection: '[감탄사]',
    determiner: '[한정사]',
    article: '[관사]'
  };

  // 품사를 한글로 변환하는 함수
  const getPosTag = (pos: string): string => {
    return POS_MAP[pos.toLowerCase()] || '';
  };

  // 단어 원형 변환 함수 (compromise 사용)
  const getLemma = (word: string): string => {
    try {
      const doc = nlp(word);
      const lemma = doc.verbs().toInfinitive().out('array')[0] || 
                   doc.nouns().toSingular().out('array')[0] || 
                   word.toLowerCase();
      return lemma;
    } catch (error) {
      console.error('단어 원형 변환 오류:', error);
      return word.toLowerCase();
    }
  };

  const stripPunctuation = (input: string) => {
    return (input || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  };

  const generateLookupCandidates = (rawWord: string): string[] => {
    const candidates = new Set<string>();
    const cleaned = stripPunctuation(rawWord || '').toLowerCase();
    if (!cleaned) {
      return [];
    }

    candidates.add(cleaned);
    candidates.add(getLemma(cleaned));

    if (cleaned.endsWith("'s") || cleaned.endsWith("'s")) {
      candidates.add(cleaned.slice(0, -2));
    }

    if (cleaned.endsWith('s') && cleaned.length > 3) {
      candidates.add(cleaned.slice(0, -1));
    }

    if (cleaned.endsWith('es') && cleaned.length > 4) {
      candidates.add(cleaned.slice(0, -2));
    }

    if (cleaned.endsWith('ies') && cleaned.length > 4) {
      candidates.add(cleaned.slice(0, -3) + 'y');
    }

    if (cleaned.endsWith('ed') && cleaned.length > 3) {
      const base = cleaned.slice(0, -2);
      candidates.add(base);
      if (!base.endsWith('e')) {
        candidates.add(base + 'e');
      }
      if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
        candidates.add(base.slice(0, -1));
      }
    }

    if (cleaned.endsWith('ing') && cleaned.length > 4) {
      const base = cleaned.slice(0, -3);
      candidates.add(base);
      candidates.add(base + 'e');
      if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
        candidates.add(base.slice(0, -1));
      }
    }

    if (cleaned.includes('-')) {
      cleaned.split('-').forEach((segment) => {
        const seg = segment.trim();
        if (seg) {
          candidates.add(seg);
          candidates.add(getLemma(seg));
        }
      });
    }

    return Array.from(candidates).map((item) => item.trim()).filter(Boolean);
  };

  const callTokenMatcher = async (contextSentence: string, targetWord: string) => {
    const endpoint = `${TOKEN_MATCHER_BASE_URL}/token-match`;
    try {
      console.log('[Token Matcher] 호출 시작:', { endpoint, sentence: contextSentence, word: targetWord });
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          sentence: contextSentence,
          word: targetWord,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Token Matcher] 응답 오류:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          endpoint
        });
        return null;
      }

      const data = await response.json();
      console.log('[Token Matcher] 응답 성공:', { matchesCount: data?.matches?.length || 0 });
      return data;
    } catch (error) {
      console.error('[Token Matcher] 호출 실패:', {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof TypeError ? 'Network/CORS' : 'Unknown',
        endpoint,
        details: error instanceof Error ? error.stack : undefined
      });
      
      // 네트워크 오류인 경우 사용자에게 알림하지 않고 조용히 실패 (기능은 계속 작동)
      return null;
    }
  };

  // 문맥 확장 함수: 단어가 포함된 문장 + 앞뒤 문장 1개씩
  const getExtendedContext = (sentence: string, fullText: string, wordIndex: number): string => {
    try {
      // 전체 텍스트를 문장 단위로 분리 (마침표, 물음표, 느낌표, 줄바꿈 기준)
      const sentenceEndings = /[.!?\n]+/g;
      const sentences: string[] = [];
      let lastIndex = 0;
      let match;
      
      // 문장 끝 구분자 찾기
      while ((match = sentenceEndings.exec(fullText)) !== null) {
        const sentenceText = fullText.substring(lastIndex, match.index + match[0].length).trim();
        if (sentenceText.length > 0) {
          sentences.push(sentenceText);
        }
        lastIndex = match.index + match[0].length;
      }
      
      // 마지막 문장 추가
      if (lastIndex < fullText.length) {
        const lastSentence = fullText.substring(lastIndex).trim();
        if (lastSentence.length > 0) {
          sentences.push(lastSentence);
        }
      }
      
      // 현재 문장이 포함된 인덱스 찾기
      let currentSentenceIndex = -1;
      const normalizedSentence = sentence.trim().toLowerCase();
      
      for (let i = 0; i < sentences.length; i++) {
        const normalizedCandidate = sentences[i].trim().toLowerCase();
        // 문장이 포함되어 있거나, 문장의 일부가 포함되어 있는지 확인
        if (normalizedCandidate.includes(normalizedSentence) || 
            normalizedSentence.includes(normalizedCandidate) ||
            normalizedCandidate.substring(0, normalizedSentence.length) === normalizedSentence) {
          currentSentenceIndex = i;
          break;
        }
      }
      
      // 인덱스를 찾지 못한 경우 원본 문장 반환
      if (currentSentenceIndex === -1) {
        console.warn('문맥 확장: 현재 문장을 찾을 수 없음, 원본 문장 사용');
        return sentence;
      }
      
      // 앞뒤 문장 포함하여 문맥 구성
      const contextSentences: string[] = [];
      
      // 이전 문장 (있으면)
      if (currentSentenceIndex > 0) {
        contextSentences.push(sentences[currentSentenceIndex - 1].trim());
      }
      
      // 현재 문장
      contextSentences.push(sentences[currentSentenceIndex].trim());
      
      // 다음 문장 (있으면)
      if (currentSentenceIndex < sentences.length - 1) {
        contextSentences.push(sentences[currentSentenceIndex + 1].trim());
      }
      
      const extendedContext = contextSentences.join(' ').replace(/\*\*/g, '').trim();
      console.log(`📚 문맥 확장: ${contextSentences.length}개 문장 결합`);
      
      return extendedContext;
    } catch (error) {
      console.error('문맥 확장 오류:', error);
      return sentence;
    }
  };

  // 문장에서 embedding 생성 및 가장 유사한 뜻 찾기 (Transformers.js + TensorFlow.js + Token-level)
  const findMostSimilarMeaning = async (sentence: string, meanings: any[], fullText?: string, word?: string, wordPos?: string[]) => {
    try {
      let filteredMeanings = meanings;
      const detectedPos: string[] = [];
      const addDetectedPos = (pos: string | undefined | null) => {
        if (!pos) return;
        const normalized = pos.toLowerCase();
        const allowed = ['noun', 'verb', 'adjective', 'adverb'];
        if (!allowed.includes(normalized)) return;
        if (!detectedPos.includes(normalized)) {
          detectedPos.push(normalized);
        }
      };

      if (word && sentence) {
        const normalizedWordPosSet = new Set<string>((wordPos ?? ([] as string[])).map((pos) => pos.toLowerCase()));

        try {
          const doc = nlp(sentence);
          const wordDoc = doc.match(word) as any;

          if (wordDoc.found) {
            if (wordDoc.verbs && wordDoc.verbs().found) addDetectedPos('verb');
            if (wordDoc.nouns && wordDoc.nouns().found) addDetectedPos('noun');
            if (wordDoc.adjectives && wordDoc.adjectives().found) addDetectedPos('adjective');
            if (wordDoc.adverbs && wordDoc.adverbs().found) addDetectedPos('adverb');
          }
        } catch (error) {
          console.warn('품사 감지 오류:', error);
        }

        try {
          const matchResult = sentence.toLowerCase().match(/\b[\w']+\b/g);
          const tokens = matchResult ? Array.from(matchResult) : ([] as string[]);
          const wordLower = word.toLowerCase();
          const tokenIndex = tokens.indexOf(wordLower);

          if (tokenIndex !== -1) {
            const prevToken = tokens[tokenIndex - 1] || '';
            const nextToken = tokens[tokenIndex + 1] || '';
            const prevPrevToken = tokens[tokenIndex - 2] || '';

            const determiners = new Set([
              'the', 'a', 'an', 'this', 'that', 'these', 'those',
              'my', 'your', 'his', 'her', 'its', 'our', 'their',
              'some', 'any', 'each', 'every', 'no', 'another', 'either', 'neither', 'both', 'such', 'what', 'which',
            ]);
            if (prevToken && determiners.has(prevToken)) addDetectedPos('noun');

            const linkingVerbs = new Set([
              'is', 'was', 'were', 'are', 'be', 'been', 'being',
              'seems', 'seemed', 'seem', 'appear', 'appeared', 'appears',
              'becomes', 'became', 'become', 'remain', 'remains', 'remained',
            ]);
            if (nextToken && linkingVerbs.has(nextToken) && normalizedWordPosSet.has('noun')) addDetectedPos('noun');

            const ofFollowers = new Set(['of', 'for', 'in']);
            if (nextToken && ofFollowers.has(nextToken) && normalizedWordPosSet.has('noun')) addDetectedPos('noun');

            const modalVerbs = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would']);
            if ((prevToken === 'to' || modalVerbs.has(prevToken) || prevPrevToken === 'to') && normalizedWordPosSet.has('verb')) {
              addDetectedPos('verb');
            }

            if (wordLower.endsWith('ly') && (normalizedWordPosSet.size === 0 || normalizedWordPosSet.has('adverb'))) {
              addDetectedPos('adverb');
            }

            const adjectiveIndicators = new Set(['very', 'quite', 'rather', 'more', 'most', 'too', 'so']);
            if (prevToken && adjectiveIndicators.has(prevToken) && normalizedWordPosSet.has('adjective')) {
              addDetectedPos('adjective');
            }
          }
        } catch (heuristicError) {
          console.warn('품사 휴리스틱 처리 오류:', heuristicError);
        }

        if (detectedPos.length === 0 && (wordPos?.length ?? 0) > 0) {
          wordPos?.forEach((pos) => addDetectedPos(pos));
        }

        console.log(`🏷️  최종 감지된 품사: ${detectedPos.join(', ') || '없음'}`);
        console.log(`📚 단어의 전체 품사 (pos): ${wordPos?.join(', ') || '없음'}`);

        if (detectedPos.length > 0) {
          const posFiltered = meanings.filter((meaning) => {
            const defMatch = meaning.definition?.match(/^\[(.*?)\]/);
            if (defMatch) {
              const meaningPos = defMatch[1].toLowerCase();
              return detectedPos.some((pos) => {
                if (pos === 'verb') return meaningPos.includes('동사');
                if (pos === 'noun') return meaningPos.includes('명사');
                if (pos === 'adjective') return meaningPos.includes('형용사');
                if (pos === 'adverb') return meaningPos.includes('부사');
                return false;
              });
            }
            if (wordPos?.length) {
              return detectedPos.some((detected) => wordPos.includes(detected));
            }
            return true;
          });

          if (posFiltered.length > 0) {
            filteredMeanings = posFiltered;
            console.log(`✅ 품사 필터링: ${meanings.length}개 → ${filteredMeanings.length}개`);
          } else {
            console.log('⚠️  품사 필터링 결과 없음, 전체 meanings 사용');
          }
        } else {
          console.log('ℹ️  감지된 품사가 없어 전체 meanings 사용');
        }
      }

      let extendedContext = sentence;
      if (fullText) {
        const wordIndex = fullText.indexOf(sentence);
        extendedContext = getExtendedContext(sentence, fullText, wordIndex);
      }

      console.log('📝 원본 문장:', sentence);
      console.log('📚 확장된 문맥:', extendedContext);
      console.log(`📊 필터링된 meanings: ${filteredMeanings.length}개 (전체: ${meanings.length}개)`);

      if (!word || !word.trim()) {
        console.warn('Token matcher: 유효한 단어가 없어 비교를 건너뜁니다.');
        return null;
      }

      const matcherResponse = await callTokenMatcher(extendedContext, word.trim());
      if (!matcherResponse) {
        console.warn('⚠️ Cloud Run 토큰 매칭 결과를 가져오지 못했습니다.');
        return null;
      }

      const matches: any[] = Array.isArray(matcherResponse.matches) ? matcherResponse.matches : [];
      if (matcherResponse.info) {
        console.log(`ℹ️ Token matcher info: ${matcherResponse.info}`);
      }
      if (!matches.length) {
        console.warn('⚠️ Token matcher에서 유사한 뜻을 찾지 못했습니다.');
        return null;
      }

      if (Array.isArray(matcherResponse.tokenIndices)) {
        console.log('🔢 선택된 토큰 인덱스:', matcherResponse.tokenIndices);
      }
      if (Array.isArray(matcherResponse.tokens)) {
        console.log('🔤 토크나이즈된 토큰:', matcherResponse.tokens);
      }

      const filteredIndexSet = new Set<number>(
        filteredMeanings
          .map((meaning) => meanings.indexOf(meaning))
          .filter((idx) => idx >= 0)
      );

      const resolveMeaningIndex = (match: any): number => {
        if (typeof match?.meaningIndex === 'number' && match.meaningIndex >= 0) {
          return match.meaningIndex;
        }
        if (match?.meaning?.id) {
          const byId = meanings.findIndex((item) => item?.id === match.meaning.id);
          if (byId >= 0) return byId;
        }
        if (match?.meaning?.definition) {
          const byDefinition = meanings.findIndex((item) => item?.definition === match.meaning.definition);
          if (byDefinition >= 0) return byDefinition;
        }
        return -1;
      };

      let selectedIndex: number | null = null;
      for (const match of matches) {
        const idx = resolveMeaningIndex(match);
        if (idx < 0) continue;
        if (filteredIndexSet.size === 0 || filteredIndexSet.has(idx)) {
          selectedIndex = idx;
          break;
        }
      }

      if (selectedIndex === null) {
        const fallbackMatch = matches.find((match) => resolveMeaningIndex(match) >= 0);
        if (fallbackMatch) {
          selectedIndex = resolveMeaningIndex(fallbackMatch);
        }
      }

      const maxLogCount = 3;
      matches.slice(0, maxLogCount).forEach((match, idx) => {
        const resolvedIndex = resolveMeaningIndex(match);
        const meaning = resolvedIndex >= 0 ? meanings[resolvedIndex] : null;
        console.log(`⭐ Cloud Run ${idx + 1}위`, {
          meaningId: meaning?.id ?? match?.meaning?.id,
          resolvedIndex,
          similarity: match?.similarity,
          definition: meaning?.definition,
        });
      });

      if (selectedIndex !== null && selectedIndex >= 0) {
        console.log('✅ 선택된 뜻 인덱스:', selectedIndex);
        return selectedIndex;
      }

      return null;
    } catch (error) {
      console.error('Token matcher 비교 오류:', error);
      return null;
    }
  };

  // ChatGPT API를 호출하여 단어 정보 가져오기
  const fetchWordFromChatGPT = async (word: string, baseForm?: string): Promise<any | null> => {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    
    if (!apiKey || apiKey === 'YOUR_OPENAI_API_KEY_HERE') {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    const now = new Date().toISOString();
    
    const prompt = baseForm && baseForm.trim() !== '' && baseForm !== word.toLowerCase()
      ? `다음 영어 단어에 대한 정보를 아래 형식의 JSON으로 제공해주세요.

단어: "${word}"
원형(lemma): "${baseForm.trim()}"

응답 형식 (정확히 이 형식을 따르세요):
{
  "word": "${baseForm.trim()}",
  "pos": ["noun", "verb"],
  "pronunciation": "/əˈʃʊrəns/",
  "meanings": [
    {
      "id": "${baseForm.trim().toLowerCase()}_1",
      "definition": "[명사] 한국어 정의",
      "examples": [
        "English example sentence. (한국어 번역)"
      ],
      "keywords": ["keyword1", "keyword2"],
      "embedding": {},
      "difficulty": 3,
      "frequency": 0.65
    }
  ],
  "updatedAt": "${now}"
}

주의사항:
1. JSON 형식만 반환하세요. 다른 설명이나 마크다운 코드 블록 없이 순수 JSON만 반환하세요.
2. word는 원형 "${baseForm.trim()}"로 반환하세요.
3. 만약 "${word}"가 영어 사전에 존재하지 않는 단어이거나 유효하지 않은 단어라면, meanings 배열을 빈 배열 []로 반환하고, definition에는 "[${word} 단어는 존재하지 않는 단어입니다.]" 형식으로 반환하세요.
4. pos는 영어 품사 배열입니다 (예: ["noun"], ["verb", "noun"]).
5. pronunciation은 IPA(International Phonetic Alphabet) 형식의 발음기호입니다. 슬래시(/)로 감싼 형식으로 반환하세요 (예: /əˈʃʊrəns/). 미국식 발음을 제공해주세요. 단어가 존재하지 않는 경우 빈 문자열 ""을 반환하세요.
6. meanings 배열에는 단어의 주요 의미를 2개에서 5개 사이로 포함하세요. 가장 자주 사용되고 중요한 의미를 우선적으로 포함해주세요. 의미가 많더라도 5개를 초과하지 마세요. 단어가 존재하지 않는 경우 빈 배열 []을 반환하세요.
7. 각 meaning의 id는 "${baseForm.trim().toLowerCase()}_1", "${baseForm.trim().toLowerCase()}_2" 형식입니다.
8. definition은 "[품사] 한국어 정의" 형식입니다 (예: "[명사] 확신, 자신감"). 단어가 존재하지 않는 경우 "[${word} 단어는 존재하지 않는 단어입니다.]" 형식으로 반환하세요.
9. examples는 영문 예문과 한국어 번역을 포함한 문자열 배열입니다 (예: "She spoke with assurance. (그녀는 자신 있게 말했다.)"). 단어가 존재하지 않는 경우 빈 배열 []을 반환하세요.
10. keywords는 관련 단어 배열입니다 (영어로). 단어가 존재하지 않는 경우 빈 배열 []을 반환하세요.
11. embedding은 항상 빈 객체 {}입니다.
12. difficulty는 1-5 사이의 정수입니다.
13. frequency는 0-1 사이의 실수입니다.
14. updatedAt은 "${now}" 형식의 ISO 8601 문자열입니다.`
      : `다음 영어 단어에 대한 정보를 아래 형식의 JSON으로 제공해주세요.

단어: "${word}"

응답 형식 (정확히 이 형식을 따르세요):
{
  "word": "${word}",
  "pos": ["noun", "verb"],
  "pronunciation": "/əˈʃʊrəns/",
  "meanings": [
    {
      "id": "${word.toLowerCase()}_1",
      "definition": "[명사] 한국어 정의",
      "examples": [
        "English example sentence. (한국어 번역)"
      ],
      "keywords": ["keyword1", "keyword2"],
      "embedding": {},
      "difficulty": 3,
      "frequency": 0.65
    }
  ],
  "updatedAt": "${now}"
}

주의사항:
1. JSON 형식만 반환하세요. 다른 설명이나 마크다운 코드 블록 없이 순수 JSON만 반환하세요.
2. word는 정확히 "${word}"로 반환하세요.
3. 만약 "${word}"가 영어 사전에 존재하지 않는 단어이거나 유효하지 않은 단어라면, meanings 배열을 빈 배열 []로 반환하고, definition에는 "[${word} 단어는 존재하지 않는 단어입니다.]" 형식으로 반환하세요.
4. pos는 영어 품사 배열입니다 (예: ["noun"], ["verb", "noun"]).
5. pronunciation은 IPA(International Phonetic Alphabet) 형식의 발음기호입니다. 슬래시(/)로 감싼 형식으로 반환하세요 (예: /əˈʃʊrəns/). 미국식 발음을 제공해주세요. 단어가 존재하지 않는 경우 빈 문자열 ""을 반환하세요.
6. meanings 배열에는 단어의 주요 의미를 2개에서 5개 사이로 포함하세요. 가장 자주 사용되고 중요한 의미를 우선적으로 포함해주세요. 의미가 많더라도 5개를 초과하지 마세요. 단어가 존재하지 않는 경우 빈 배열 []을 반환하세요.
7. 각 meaning의 id는 "${word.toLowerCase()}_1", "${word.toLowerCase()}_2" 형식입니다.
8. definition은 "[품사] 한국어 정의" 형식입니다 (예: "[명사] 확신, 자신감"). 단어가 존재하지 않는 경우 "[${word} 단어는 존재하지 않는 단어입니다.]" 형식으로 반환하세요.
9. examples는 영문 예문과 한국어 번역을 포함한 문자열 배열입니다 (예: "She spoke with assurance. (그녀는 자신 있게 말했다.)"). 단어가 존재하지 않는 경우 빈 배열 []을 반환하세요.
10. keywords는 관련 단어 배열입니다 (영어로). 단어가 존재하지 않는 경우 빈 배열 []을 반환하세요.
11. embedding은 항상 빈 객체 {}입니다.
12. difficulty는 1-5 사이의 정수입니다.
13. frequency는 0-1 사이의 실수입니다.
14. updatedAt은 "${now}" 형식의 ISO 8601 문자열입니다.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that provides word definitions in JSON format. Always respond with valid JSON only, no additional text.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`ChatGPT API 호출 실패: ${response.status} - ${await response.text()}`);
      }

      const responseData = await response.json();
      const content = responseData.choices[0].message.content as string;
      
      // JSON 파싱
      const wordData = JSON.parse(content) as any;
      
      // 응답 정규화
      const normalizedWord = wordData.word || word;
      const normalizedPos = (wordData.pos || []).map((p: any) => p.toString());
      const normalizedMeanings = (wordData.meanings || []).map((meaning: any, index: number) => {
        if (typeof meaning !== 'object') return meaning;
        
        return {
          id: meaning.id || `${normalizedWord.toLowerCase()}_${index + 1}`,
          definition: meaning.definition || '',
          examples: (meaning.examples || []).map((e: any) => e.toString()),
          keywords: (meaning.keywords || []).map((k: any) => k.toString()),
          embedding: meaning.embedding || {},
          difficulty: meaning.difficulty || 3,
          frequency: meaning.frequency || 0.5,
        };
      });

      return {
        word: normalizedWord,
        pos: normalizedPos,
        pronunciation: wordData.pronunciation || '',
        meanings: normalizedMeanings,
        updatedAt: wordData.updatedAt || now,
      };
    } catch (error) {
      console.error('ChatGPT API 오류:', error);
      throw error;
    }
  };

  // words 컬렉션에 단어 저장
  const saveWordToWordsCollection = async (wordKey: string, wordData: any) => {
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

  // Firebase에서 단어 정보 가져오기 (words 컬렉션 전용)
  const fetchWordFromFirebase = async (word: string, sentence?: string, fullText?: string) => {
    setIsLoadingClickedWord(true);
    setClickedWordData(null);
    setClickedWordNotFound(false);
    setHighlightedMeaningIndex(null);
    setLastDoubleClickedWord(word); // 더블 클릭한 단어 저장
    
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
          
          // ChatGPT API 호출
          const chatGPTData = await fetchWordFromChatGPT(word, baseForm);
          
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
            // setShowNewWordSaveDialog(true); // 다이얼로그 대신 우측 카드에 버튼 표시
            
            // 임시로 wordData에 설정하여 표시 (저장은 안 됨)
            meanings = chatGPTData.meanings || [];
            pos = chatGPTData.pos || [];
            
            wordData = {
              word: chatGPTData.word || word,
              pos: pos,
              meanings: meanings,
              updatedAt: chatGPTData.updatedAt || '',
              isFromChatGPT: true // ChatGPT에서 온 데이터임을 표시
            };
          }
        } catch (chatGPTError) {
          console.error('ChatGPT API 호출 오류:', chatGPTError);
          // ChatGPT API 실패 시에도 계속 진행 (기존 로직대로)
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
            // 에러가 발생해도 단어 정보는 표시됨
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
  const saveMeaningToFirebase = async (word: string, meaningIndex: number, updatedMeaning: any, source: 'clicked' | 'list') => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

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
        // words 컬렉션에서 가져온 데이터를 사용자 단어장에 복사
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

      alert('뜻이 저장되었습니다.');
    } catch (err) {
      console.error('뜻 저장 오류:', err);
      alert('뜻 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingMeaning(false);
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

      alert('뜻이 삭제되었습니다.');
    } catch (err) {
      console.error('뜻 삭제 오류:', err);
      alert('뜻 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsSavingMeaning(false);
    }
  };

  // ChatGPT로부터 받은 새 단어를 words 컬렉션에 저장
  const handleSaveNewWordToWords = async () => {
    if (!newWordFromChatGPT) return;
    
    try {
      setIsSavingMeaning(true);
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
      
      alert('words 컬렉션에 저장되었습니다.');
      setShowNewWordSaveDialog(false);
      setNewWordFromChatGPT(null);
    } catch (error) {
      console.error('words 컬렉션 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingMeaning(false);
    }
  };

  // ChatGPT로부터 받은 새 단어를 단어장(flashcards)에 바로 저장
  const handleSaveNewWordToFlashcard = async () => {
    if (!newWordFromChatGPT || !user) return;
    
    try {
      setIsSavingMeaning(true);
      const uid = user.uid;
      const userDocRef = doc(db, 'users', uid);
      
      // 첫 번째 meaning 가져오기 (Flutter 앱처럼)
      const meanings = newWordFromChatGPT.meanings || [];
      if (meanings.length === 0) {
        alert('저장할 의미가 없습니다.');
        return;
      }
      
      const firstMeaning = meanings[0];
      const word = newWordFromChatGPT.word || '';
      const pronunciation = newWordFromChatGPT.pronunciation || '';
      
      // flashcard 데이터 생성
      const flashcardData = {
        word: word,
        pronunciation: pronunciation,
        definition: firstMeaning.definition || '',
        examples: firstMeaning.examples || [],
        createdAt: new Date().toISOString(),
        reviewCount: 0,
        correctCount: 0,
        wrongCount: 0,
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
      
      alert('단어장에 저장되었습니다.');
      setShowNewWordSaveDialog(false);
      setNewWordFromChatGPT(null);
    } catch (error) {
      console.error('단어장 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingMeaning(false);
    }
  };

  // 특정 뜻을 words 컬렉션과 flashcards에 모두 저장
  const handleAddMeaningToWordsAndFlashcard = async (word: string, meaning: any, pronunciation?: string) => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    try {
      setIsSavingMeaning(true);
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
      const isDuplicateFlashcard = flashcards.some((card: any) => 
        card.word === word && card.definition === meaning.definition
      );
      
      if (!isDuplicateFlashcard) {
        // embedding 제거한 meaning 복사
        const meaningWithoutEmbedding = { ...meaning };
        delete meaningWithoutEmbedding.embedding;
        
        const flashcardData = {
          word: word,
          pronunciation: pronunciation || '',
          meaning: meaningWithoutEmbedding, // Flutter 앱처럼 meaning 객체로 저장
          createdAt: new Date().toISOString(),
          reviewCount: 0,
          correctCount: 0,
          wrongCount: 0,
          lastReviewedAt: null,
          nextReviewDate: null,
          level: 0,
        };
        
        flashcards.push(flashcardData);
        
        await setDoc(userDocRef, { flashcards }, { merge: true });
      }
      
      alert('words 컬렉션과 단어장에 저장되었습니다.');
    } catch (error) {
      console.error('저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingMeaning(false);
    }
  };

const decodeHtmlEntities = (text: string): string => {
  if (!text) return text;
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#96;': '`'
  };
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27|#x2F|#96);/g, (match) => entities[match] || match);
};

  const translateToKorean = async (text: string): Promise<string | null> => {
    try {
      // 정적 호스팅 환경 감지 및 엔드포인트 결정
      const phpProxy = '/hahahaEnglish/translate-proxy.php';
      const apiRoute = '/api/translate';
      const endpoint = process.env.NEXT_PUBLIC_TRANSLATE_ENDPOINT || 
        ((typeof window !== 'undefined' && window.location.pathname.startsWith('/hahahaEnglish'))
          ? phpProxy 
          : apiRoute);

      // 절대 URL로 변환
      const buildUrl = (path: string) => {
        if (path.startsWith('http')) return path;
        if (typeof window !== 'undefined') {
          return window.location.origin + path;
        }
        return path;
      };

      const fullUrl = buildUrl(endpoint);
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          source: 'en',
          target: 'ko',
          // optional: allow insecure SSL on some shared hosts when enabled via env
          insecure: (process.env.NEXT_PUBLIC_TRANSLATE_INSECURE === '1') ? true : undefined,
        }),
      });

      if (!response.ok) {
        // 응답 본문을 텍스트로 먼저 읽기
        const errorText = await response.text();
        let errorData = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // JSON 파싱 실패 시 텍스트 그대로 사용
          errorData = { raw: errorText };
        }
        
        console.error('번역 API 응답 오류:', {
          status: response.status,
          statusText: response.statusText,
          url: fullUrl,
          error: errorData,
          rawText: errorText.substring(0, 500),
        });
        return null;
      }

      const data = await response.json();
      if (!data?.translatedText) {
        console.warn('번역 응답에 translatedText가 없습니다:', data);
        return null;
      }
      return data.translatedText;
    } catch (error) {
      console.error('번역 호출 중 오류:', error);
      return null;
    }
  };

  const formatExampleText = async (input: string): Promise<string> => {
    const sanitized = input.replace(/\s*\([^)]+\)\s*$/, '').trim();
    if (!sanitized) return '';

    let englishSentence = sanitized;
    if (!/[.!?]"?$/.test(englishSentence)) {
      englishSentence = `${englishSentence}.`;
    }

    const translation = await translateToKorean(sanitized);
    if (!translation) {
      return englishSentence;
    }

    return `${englishSentence} (${translation})`;
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

    setIsLoadingWordData(true);
    setWordDataList([]);
    setCurrentWordIndex(0);

    // catch 블록에서도 접근할 수 있도록 함수 스코프로 선언
    let allWordData: any[] = [];

    try {
      // 단어들을 원형으로 변환하고 중복 제거
      const lemmatizedWords = Array.from(new Set(selectedWords.map(item => getLemma(item.word))));

      // 단어를 배치로 나누기 (한 번에 1개씩 처리)
      const BATCH_SIZE = 1;
      const totalBatches = Math.ceil(lemmatizedWords.length / BATCH_SIZE);
      
      setBatchProgress({ current: 0, total: totalBatches });

      // 단어 하나씩 처리
      for (let i = 0; i < lemmatizedWords.length; i += BATCH_SIZE) {
        const batch = lemmatizedWords.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        
        setBatchProgress({ current: batchNum, total: totalBatches });
        console.log(`단어 ${batchNum}/${totalBatches} 처리 중...`);

        const word = batch[0]; // BATCH_SIZE가 1이므로 첫 번째 단어만 사용
        
        // AI 프롬프트 생성 (단어 하나씩 처리)
        const prompt = `For the word "${word}", provide Korean meaning and English example sentence with Korean translation in the JSON format below.

IMPORTANT: The example sentence format must be: "English sentence.(Korean translation)"
- English sentence comes FIRST
- Korean translation comes SECOND inside parentheses
- Example: "I like apples.(나는 사과를 좋아한다.)"

{
  "meanings": {
    "${word}": {
      "meanings": [
        {
          "definition": "Korean meaning here",
          "examples": ["English sentence here.(Korean translation here)"],
          "frequency": 1,
          "updatedAt": "2025-10-24T15:00:00Z"
        }
      ],
      "updatedAt": "2025-10-24T15:00:00Z"
    }
  }
}

Please respond with only JSON, without any additional explanation.`;

        // API 엔드포인트 설정 (page.tsx와 동일한 방식)
        const phpProxy = '/hahahaEnglish/llm-proxy.php';
        const apiRoute = '/api/llm';
        const endpoint = process.env.NEXT_PUBLIC_LLM_ENDPOINT || 
          ((typeof window !== 'undefined' && window.location.pathname.startsWith('/hahahaEnglish'))
            ? phpProxy 
            : apiRoute);

        const buildUrl = (path: string) => {
          if (path.startsWith('http')) return path;
          if (typeof window !== 'undefined') {
            return window.location.origin + path;
          }
          return path;
        };

        const tryFetch = async (url: string, currentPrompt: string) => {
          const fullUrl = buildUrl(url);
          
          // AbortController로 타임아웃 처리 (30초 - 단어 1개씩 처리하므로)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초
          
          try {
            const res = await fetch(fullUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: currentPrompt }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            const text = await res.text();
            return { res, text };
          } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
              throw new Error('요청 시간이 초과되었습니다.');
            }
            throw error;
          }
        };

        let { res, text } = await tryFetch(endpoint, prompt);

        // Fallback 로직
        if (!res.ok && (res.status === 404 || res.status === 405)) {
          if (endpoint === apiRoute) {
            try {
              const second = await tryFetch(phpProxy, prompt);
              res = second.res;
              text = second.text;
            } catch (e) {
              console.error('PHP proxy also failed:', e);
            }
          }
        }

        if (!res.ok) {
          if (res.status === 504) {
            throw new Error(`단어 "${word}" (${batchNum}/${totalBatches}) 처리 중 타임아웃 발생`);
          } else if (res.status === 502 || res.status === 503) {
            throw new Error(`단어 "${word}" (${batchNum}/${totalBatches}) 처리 중 서버 오류 발생`);
          } else {
            throw new Error(`단어 "${word}" (${batchNum}/${totalBatches}) AI 요청 실패 (HTTP ${res.status})`);
          }
        }

        // JSON 추출 (마크다운 코드 블록 제거)
        let jsonText = text.trim();
        console.log(`단어 "${word}" (${batchNum}/${totalBatches}) 원본 응답:`, text.substring(0, 500));
        
        // ```json ... ``` 형태의 마크다운 코드 블록 제거
        if (jsonText.startsWith('```')) {
          console.log(`단어 "${word}": 마크다운 코드 블록 감지됨`);
          // 첫 번째 줄(```json 또는 ```) 제거
          jsonText = jsonText.replace(/^```[a-z]*\n?/i, '');
          // 마지막 줄(```) 제거
          jsonText = jsonText.replace(/\n?```\s*$/i, '');
          jsonText = jsonText.trim();
        }
        
        // JSON 앞뒤의 불필요한 텍스트 제거 (JSON 객체만 추출)
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
        
        console.log(`단어 "${word}" 정제된 JSON:`, jsonText);

        // JSON 파싱 시도 (오류 처리 개선)
        let wordData;
        try {
          wordData = JSON.parse(jsonText);
        } catch (parseError) {
          console.error(`JSON 파싱 오류 (단어: "${word}"):`, parseError);
          console.error(`문제가 있는 JSON:`, jsonText);
          
          // 일반적인 JSON 오류 자동 수정 시도
          try {
            let fixedJson = jsonText;
            
            // 1. 마지막 쉼표 제거 (배열이나 객체의 마지막 요소 뒤)
            fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');
            
            // 2. 배열 내부의 쉼표 문제 수정 (예: [item1 item2] -> [item1, item2])
            fixedJson = fixedJson.replace(/\[\s*"([^"]+)"\s+"([^"]+)"\s*\]/g, '["$1", "$2"]');
            fixedJson = fixedJson.replace(/\[\s*"([^"]+)"\s+([^,\[\]{}"]+)\s*\]/g, '["$1", "$2"]');
            
            // 3. 따옴표 누락 수정 시도 (키 이름)
            fixedJson = fixedJson.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
            
            // 4. 문자열 내부의 줄바꿈 문제 수정 (예: "text\n" -> "text\\n")
            fixedJson = fixedJson.replace(/("(?:[^"\\]|\\.)*")\s*\n\s*(")/g, '$1,\n$2');
            
            // 5. 여러 번 시도 (점진적 수정)
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                wordData = JSON.parse(fixedJson);
                console.log(`JSON 자동 수정 성공 (시도 ${attempt + 1})`);
                break;
              } catch (e) {
                if (attempt < 2) {
                  // 추가 수정 시도
                  fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');
                } else {
                  throw e;
                }
              }
            }
          } catch (retryError) {
            // 자동 수정 실패 시 상세 오류 메시지
            const errorMsg = parseError instanceof Error ? parseError.message : '알 수 없는 JSON 오류';
            const positionMatch = errorMsg.match(/position (\d+)/);
            const position = positionMatch ? parseInt(positionMatch[1]) : -1;
            
            let errorDetails = `JSON 파싱 실패\n\n단어: "${word}"\n오류: ${errorMsg}`;
            
            if (position > 0 && position < jsonText.length) {
              const start = Math.max(0, position - 50);
              const end = Math.min(jsonText.length, position + 50);
              const context = jsonText.substring(start, end);
              const relativePos = position - start;
              errorDetails += `\n\n문제 위치 주변:\n${context}\n${' '.repeat(relativePos)}^`;
            }
            
            errorDetails += `\n\n전체 JSON 응답:\n${jsonText}`;
            
            throw new Error(errorDetails);
          }
        }
        
        // meanings 객체 형식 처리
        if (wordData.meanings && typeof wordData.meanings === 'object') {
          // meanings 객체를 배열로 변환
          const wordsArray = Object.entries(wordData.meanings).map(([w, data]: [string, any]) => ({
            word: w,
            meanings: data.meanings || []
          }));
          if (wordsArray.length > 0) {
            allWordData.push(wordsArray[0]);
            // 배치 완료 시마다 실시간으로 UI 업데이트
            setWordDataList([...allWordData]);
          }
        } else if (wordData.words && Array.isArray(wordData.words) && wordData.words.length > 0) {
          allWordData.push(wordData.words[0]);
          // 배치 완료 시마다 실시간으로 UI 업데이트
          setWordDataList([...allWordData]);
        } else {
          console.warn(`단어 "${word}"의 데이터를 가져올 수 없습니다.`);
        }

        // 단어 간 짧은 대기 (API 과부하 방지)
        if (i + BATCH_SIZE < lemmatizedWords.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // 모든 배치 처리 완료 확인
      if (allWordData.length === 0) {
        throw new Error('단어 데이터를 가져올 수 없습니다');
      }
    } catch (error) {
      console.error('단어 정리 오류:', error);
      
      let errorMessage = '알 수 없는 오류';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // JSON 파싱 오류인 경우 더 자세한 정보 제공
        if (error.message.includes('JSON')) {
          errorMessage = `JSON 파싱 오류\n\nAI 응답 형식이 올바르지 않습니다.\n처리된 단어: ${batchProgress.current}/${batchProgress.total}\n\n원본 오류: ${error.message}`;
        }
      }
      
      alert(`단어 정리 중 오류가 발생했습니다:\n\n${errorMessage}\n\n해결 방법:\n- 단어 수를 줄여서 다시 시도해보세요\n- 몇 분 후 다시 시도해보세요${allWordData.length > 0 ? `\n- ${allWordData.length}개 단어는 성공적으로 처리되었습니다` : ''}`);
    } finally {
      setIsLoadingWordData(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  };

  // 파일을 이미지로 읽는 함수
  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setPastedImage(result);
        // 이미지를 드래그 앤 드롭하면 자동으로 OCR 실행
        setShowText(true);
        setIsProcessingOCR(true);
        setOcrText('');
        setSelectedWords([]);

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
    reader.readAsDataURL(file);
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
      // Tesseract.js 동적 import (클라이언트 사이드에서만 로드)
      const Tesseract = await import('tesseract.js');
      
      // Worker 생성 및 언어 설정 (영어 + 한국어)
      const worker = await Tesseract.createWorker('eng+kor');
      
      // 이미지에서 텍스트 추출
      const { data: { text } } = await worker.recognize(pastedImage);
      
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
  };

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
      if (isDirectInputOpen || editingMeaning) {
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
  }, [isOpen, initialImage, isDirectInputOpen, editingMeaning]);

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

          {/* 단어 카드 영역 - 클릭한 단어 또는 로딩 중이거나 데이터가 있을 때 표시 */}
          {(isLoadingClickedWord || clickedWordData || clickedWordNotFound || isLoadingWordData || wordDataList.length > 0) && (
            <div className="w-96 flex-shrink-0">
              <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6 sticky top-6">
                {/* 클릭한 단어 정보 표시 */}
                {isLoadingClickedWord ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                    <p className="text-gray-600 font-semibold">단어 정보를 가져오는 중...</p>
                  </div>
                ) : clickedWordNotFound ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-800">
                        단어 정보 없음
                      </h3>
                      <button
                        onClick={() => {
                          setClickedWordData(null);
                          setClickedWordNotFound(false);
                          setClickedWordForInput(null);
                        }}
                        className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                      >
                        ×
                      </button>
                    </div>
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-4">
                        Firebase에 해당 단어 정보가 없습니다.
                      </p>
                      <p className="text-sm text-gray-400 mb-6">
                        직접 입력하여 단어장에 추가할 수 있습니다.
                      </p>
                      <button
                        onClick={() => {
                          // 마지막으로 더블 클릭한 단어 사용
                          const wordToInput = lastDoubleClickedWord || clickedWordData?.word || selectedWords[selectedWords.length - 1]?.word || '';
                          if (wordToInput) {
                            setClickedWordForInput(wordToInput);
                            setIsDirectInputOpen(true);
                          }
                        }}
                        className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl"
                      >
                        직접 입력하기
                      </button>
                    </div>
                  </>
                ) : clickedWordData ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-800">
                        {clickedWordData.word}
                      </h3>
                      <button
                        onClick={() => setClickedWordData(null)}
                        className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                      >
                        ×
                      </button>
                    </div>
                    {clickedWordData.pos && clickedWordData.pos.length > 0 && (
                      <div className="mb-3">
                        <span className="text-xs text-gray-500">
                          {clickedWordData.pos.join(', ')}
                        </span>
                      </div>
                    )}
                    {clickedWordData.meanings && clickedWordData.meanings.length > 0 ? (
                      <div className="space-y-4 max-h-[60vh] overflow-y-auto overscroll-contain">
                        {(() => {
                          // 유사도가 계산된 경우 가장 유사한 뜻을 맨 위로 정렬
                          let sortedMeanings = [...clickedWordData.meanings];
                          if (highlightedMeaningIndex !== null && highlightedMeaningIndex >= 0) {
                            const mostSimilar = sortedMeanings[highlightedMeaningIndex];
                            sortedMeanings = [
                              mostSimilar,
                              ...sortedMeanings.filter((_, idx) => idx !== highlightedMeaningIndex)
                            ];
                          }
                          
                          return sortedMeanings.map((meaning: any, displayIdx: number) => {
                            // 원본 인덱스 찾기
                            const originalIdx = clickedWordData.meanings.indexOf(meaning);
                            const isHighlighted = originalIdx === highlightedMeaningIndex;
                            
                            return (
                              <div 
                                key={meaning.id || originalIdx} 
                                className={`border-b border-gray-100 pb-4 last:border-b-0 last:pb-0 rounded-lg p-3 transition-all relative ${
                                  isHighlighted 
                                    ? 'bg-yellow-100 border-yellow-300 shadow-md' 
                                    : ''
                                }`}
                              >
                                {/* 편집 아이콘 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingMeaning({ 
                                      word: clickedWordData.word, 
                                      meaningIndex: originalIdx, 
                                      source: 'clicked' 
                                    });
                                  }}
                                  className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-gray-200 transition-colors z-10"
                                  title="뜻 편집"
                                >
                                  <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    className="h-4 w-4 text-gray-600" 
                                    fill="none" 
                                    viewBox="0 0 24 24" 
                                    stroke="currentColor"
                                  >
                                    <path 
                                      strokeLinecap="round" 
                                      strokeLinejoin="round" 
                                      strokeWidth={2} 
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
                                    />
                                  </svg>
                                </button>
                                <div className="font-semibold text-gray-700 mb-2 pr-8">
                                  {meaning.definition}
                                </div>
                                {meaning.examples && meaning.examples.length > 0 && (
                                  <div className="text-sm text-gray-600 space-y-1 mb-3">
                                    {meaning.examples.map((example: string, exIdx: number) => (
                                      <div key={exIdx} className="italic">
                                        {example}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* 단어장에 추가 버튼 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddMeaningToWordsAndFlashcard(
                                      clickedWordData.word,
                                      meaning,
                                      clickedWordData.pronunciation
                                    );
                                  }}
                                  disabled={isSavingMeaning}
                                  className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold text-xs shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                  {isSavingMeaning ? '저장 중...' : '단어장에 추가'}
                                </button>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        단어 정보 없음
                      </div>
                    )}
                    
                    {/* ChatGPT에서 받아온 단어인 경우 저장 버튼 표시 */}
                    {clickedWordData.isFromChatGPT && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        {/* words 컬렉션에만 저장 */}
                        <button
                          onClick={handleSaveNewWordToWords}
                          disabled={isSavingMeaning}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          {isSavingMeaning ? '저장 중...' : 'words 컬렉션에만 저장'}
                        </button>
                      </div>
                    )}
                  </>
                ) : isLoadingWordData && wordDataList.length === 0 ? (
                  // 초기 로딩 상태
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
                    <p className="text-gray-600 font-semibold">단어 정보를 가져오는 중...</p>
                    {batchProgress.total > 1 && (
                      <div className="mt-4 w-full">
                        <div className="text-sm text-gray-500 text-center mb-2">
                          단어 {batchProgress.current} / {batchProgress.total}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div 
                            className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : wordDataList.length > 0 ? (
                  <>
                    {/* 로딩 중이면서 데이터가 있을 때 진행 상태 표시 */}
                    {isLoadingWordData && batchProgress.total > 1 && (
                      <div className="mb-4 pb-4 border-b border-gray-200">
                        <div className="text-xs text-gray-500 text-center mb-2">
                          단어 {batchProgress.current} / {batchProgress.total} 처리 중...
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-800">
                        {wordDataList[currentWordIndex]?.word || ''}
                      </h3>
                      <div className="text-sm text-gray-500">
                        {currentWordIndex + 1} / {wordDataList.length}
                      </div>
                    </div>

                    {wordDataList[currentWordIndex]?.meanings && (
                      <div className="space-y-4">
                        {wordDataList[currentWordIndex].meanings.map((meaning: any, idx: number) => (
                          <div key={idx} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0 relative">
                            {/* 편집 아이콘 */}
                            <button
                              onClick={() => setEditingMeaning({ 
                                word: wordDataList[currentWordIndex].word, 
                                meaningIndex: idx, 
                                source: 'list' 
                              })}
                              className="absolute top-0 right-0 p-1.5 rounded-full hover:bg-gray-200 transition-colors"
                              title="뜻 편집"
                            >
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                className="h-4 w-4 text-gray-600" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                              >
                                <path 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round" 
                                  strokeWidth={2} 
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
                                />
                              </svg>
                            </button>
                            <div className="font-semibold text-gray-700 mb-2 pr-8">
                              {meaning.definition}
                            </div>
                            {meaning.examples && meaning.examples.length > 0 && (
                              <div className="text-sm text-gray-600 space-y-1">
                                {meaning.examples.map((example: string, exIdx: number) => (
                                  <div key={exIdx} className="italic">
                                    {example}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {wordDataList.length > 1 && (
                      <div className="flex justify-between mt-6 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => setCurrentWordIndex((prev) => Math.max(0, prev - 1))}
                          disabled={currentWordIndex === 0}
                          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
                        >
                          ← 이전
                        </button>
                        <button
                          onClick={() => setCurrentWordIndex((prev) => Math.min(wordDataList.length - 1, prev + 1))}
                          disabled={currentWordIndex === wordDataList.length - 1}
                          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
                        >
                          다음 →
                        </button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}
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

  if (embedded) {
    return contentComponent;
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

      {/* 직접 입력 모달 */}
      {isDirectInputOpen && clickedWordForInput && (
        <DirectWordInputModal
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

// 직접 입력 모달 컴포넌트
interface DirectWordInputModalProps {
  word: string;
  onClose: () => void;
  onSave: (pos: string, definition: string, example: string) => Promise<void>;
  isSaving: boolean;
}

function DirectWordInputModal({
  word,
  onClose,
  onSave,
  isSaving
}: DirectWordInputModalProps) {
  const [pos, setPos] = useState('noun');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');

  const handleSave = async () => {
    if (!pos.trim() || !definition.trim() || !example.trim()) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    await onSave(pos, definition, example);
  };

  const handleClose = () => {
    setPos('noun');
    setDefinition('');
    setExample('');
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      onPaste={(e) => {
        // 직접 입력 모달 내부에서 붙여넣기 이벤트 전파 방지
        e.stopPropagation();
      }}
      onClick={(e) => {
        // 모달 배경 클릭 시 이벤트 전파 방지
        if (e.target === e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              단어 직접 입력: {word}
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 bg-white">
          {/* 품사 선택 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              품사
            </label>
            <select
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="noun">명사 (noun)</option>
              <option value="verb">동사 (verb)</option>
              <option value="adjective">형용사 (adjective)</option>
              <option value="adverb">부사 (adverb)</option>
              <option value="pronoun">대명사 (pronoun)</option>
              <option value="preposition">전치사 (preposition)</option>
              <option value="conjunction">접속사 (conjunction)</option>
              <option value="interjection">감탄사 (interjection)</option>
              <option value="determiner">한정사 (determiner)</option>
              <option value="article">관사 (article)</option>
            </select>
          </div>

          {/* 뜻 입력 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              뜻 정의
            </label>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="뜻을 입력하세요 (품사 태그는 자동으로 추가됩니다)"
            />
          </div>

          {/* 예문 입력 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              예문
            </label>
            <textarea
              value={example}
              onChange={(e) => setExample(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="예문을 입력하세요 (예: I like apples.(나는 사과를 좋아한다.))"
            />
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="px-6 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !pos.trim() || !definition.trim() || !example.trim()}
              className="px-6 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ChatGPT 새 단어 저장 다이얼로그 컴포넌트
interface NewWordSaveDialogProps {
  wordData: any;
  onSaveToWords: () => void;
  onSaveToFlashcard: () => void;
  onClose: () => void;
  isSaving: boolean;
}

function NewWordSaveDialog({
  wordData,
  onSaveToWords,
  onSaveToFlashcard,
  onClose,
  isSaving
}: NewWordSaveDialogProps) {
  const selectedWord = wordData.word || '';
  const pronunciation = wordData.pronunciation || '';
  const meanings = (wordData.meanings || []).slice(0, 3); // 최대 3개만 표시

  const definitionPreview = (definition: any): string => {
    if (!definition) return '';
    if (Array.isArray(definition)) {
      return definition.map((e: any) => e.toString()).join(' · ');
    }
    return definition.toString();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          {/* 제목 */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            새 단어 저장
          </h2>

          {/* 단어 정보 미리보기 */}
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl p-5 border border-slate-200 mb-5">
            {/* 단어 */}
            <h3 className="text-3xl font-extrabold text-gray-900 mb-2">
              {selectedWord}
            </h3>

            {/* 발음 */}
            {pronunciation && (
              <p className="text-base text-gray-600 mb-4">
                {pronunciation}
              </p>
            )}

            {/* 의미 미리보기 */}
            <div className="space-y-3">
              {meanings.map((meaning: any, index: number) => {
                const definition = definitionPreview(meaning.definition);
                return (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-indigo-500/10 rounded-lg">
                      <span className="text-sm font-bold text-indigo-600">
                        {index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed flex-1 pt-0.5">
                      {definition}
                    </p>
                  </div>
                );
              })}
              {wordData.meanings && wordData.meanings.length > 3 && (
                <p className="text-xs text-gray-500 pl-10">
                  + {wordData.meanings.length - 3}개의 의미 더 있음
                </p>
              )}
            </div>
          </div>

          {/* 안내 텍스트 */}
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            어디에 저장할까요?
          </h3>

          {/* 버튼 그룹 */}
          <div className="space-y-3">
            {/* words 컬렉션에 저장 */}
            <button
              onClick={onSaveToWords}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              words 컬렉션에 저장
            </button>

            {/* 단어장에 바로 저장 */}
            <button
              onClick={onSaveToFlashcard}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              단어장에 바로 저장
            </button>

            {/* 취소 버튼 */}
            <button
              onClick={onClose}
              disabled={isSaving}
              className="w-full py-3 text-gray-600 hover:text-gray-800 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음에 할게요
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}