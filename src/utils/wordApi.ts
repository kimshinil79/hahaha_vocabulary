import nlp from 'compromise';
import { getPosTag, POS_MAP } from './wordUtils';

const TOKEN_MATCHER_BASE_URL = (process.env.NEXT_PUBLIC_TOKEN_MATCHER_URL || 'https://token-matcher-1017620600279.asia-northeast3.run.app').replace(/\/$/, '');

export const callTokenMatcher = async (contextSentence: string, targetWord: string) => {
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
export const getExtendedContext = (sentence: string, fullText: string, wordIndex: number): string => {
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
export const findMostSimilarMeaning = async (
  sentence: string, 
  meanings: any[], 
  fullText?: string, 
  word?: string, 
  wordPos?: string[]
): Promise<number | null> => {
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
export const fetchWordFromChatGPT = async (word: string, baseForm?: string): Promise<any | null> => {
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

