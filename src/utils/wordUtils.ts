import nlp from 'compromise';

export const POS_MAP: Record<string, string> = {
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
export const getPosTag = (pos: string): string => {
  return POS_MAP[pos.toLowerCase()] || '';
};

// 단어 원형 변환 함수 (compromise 사용)
export const getLemma = (word: string): string => {
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

export const stripPunctuation = (input: string) => {
  return (input || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
};

export const generateLookupCandidates = (rawWord: string, getLemmaFn: (word: string) => string): string[] => {
  const candidates = new Set<string>();
  const cleaned = stripPunctuation(rawWord || '').toLowerCase();
  if (!cleaned) {
    return [];
  }

  candidates.add(cleaned);
  candidates.add(getLemmaFn(cleaned));

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
        candidates.add(getLemmaFn(seg));
      }
    });
  }

  return Array.from(candidates).map((item) => item.trim()).filter(Boolean);
};

export const decodeHtmlEntities = (text: string): string => {
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

export const translateToKorean = async (text: string): Promise<string | null> => {
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

export const formatExampleText = async (input: string): Promise<string> => {
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

/**
 * 사용자 레벨에 맞는 예문을 반환합니다 (Flutter 앱과 동일한 로직)
 * @param examples - 예문 데이터 (Map 형태 또는 배열/문자열)
 * @param englishLevel - 사용자 영어 레벨 (elementary, middle, high)
 * @returns 레벨에 맞는 예문 배열 또는 null
 */
export const getExamplesByLevel = (
  examples: any,
  englishLevel?: string
): string[] | null => {
  if (!examples) return null;
  
  // Map 형태인지 확인 (레벨별 예문)
  if (typeof examples === 'object' && !Array.isArray(examples) && examples !== null) {
    const userLevel = englishLevel || 'elementary'; // 기본값: elementary
    
    let examplesForLevel: any;
    
    // 사용자 레벨에 맞는 예문 가져오기
    if (examples[userLevel]) {
      examplesForLevel = examples[userLevel];
    } else if (examples['elementary']) {
      // 레벨에 맞는 예문이 없으면 elementary 사용
      examplesForLevel = examples['elementary'];
    } else if (Object.keys(examples).length > 0) {
      // elementary도 없으면 첫 번째 값 사용
      examplesForLevel = Object.values(examples)[0];
    } else {
      return null;
    }
    
    // String이면 배열로 변환
    if (typeof examplesForLevel === 'string') {
      return [examplesForLevel];
    }
    // List면 그대로 반환
    if (Array.isArray(examplesForLevel)) {
      return examplesForLevel.map((e: any) => String(e));
    }
    // 다른 형태면 빈 배열 반환
    return [];
  }
  
  // 기존 형태 (List 또는 String) 처리
  if (typeof examples === 'string') {
    return [examples];
  }
  if (Array.isArray(examples)) {
    return examples.map((e: any) => String(e));
  }
  return null;
};

/**
 * 관심분야별 예문을 가져오는 함수 (Flutter 앱과 동일한 로직)
 * @param examples - 예문 데이터 (Map 형태)
 * @param studyFields - 사용자 관심분야 배열 (KSAT, Toeic, Toefl)
 * @returns {field: string, examples: string[]} 형태의 배열
 */
export const getExamplesByStudyFields = (
  examples: any,
  studyFields?: string[]
): Array<{ field: string; examples: string[] }> => {
  if (!studyFields || studyFields.length === 0) return [];
  
  // Map 형태인지 확인 (관심분야별 예문)
  if (typeof examples === 'object' && !Array.isArray(examples) && examples !== null) {
    const result: Array<{ field: string; examples: string[] }> = [];
    
    for (const field of studyFields) {
      if (examples[field]) {
        let fieldExamples = examples[field];
        
        // String이면 배열로 변환
        if (typeof fieldExamples === 'string') {
          fieldExamples = [fieldExamples];
        }
        
        // List인 경우에만 추가
        if (Array.isArray(fieldExamples) && fieldExamples.length > 0) {
          result.push({
            field,
            examples: fieldExamples.map((e: any) => String(e)),
          });
        }
      }
    }
    
    return result;
  }
  
  return [];
};

/**
 * 관심분야 이름을 한글로 변환
 */
export const getStudyFieldName = (field: string): string => {
  switch (field) {
    case 'KSAT':
      return '수능';
    case 'Toeic':
      return '토익';
    case 'Toefl':
      return '토플';
    default:
      return field;
  }
};

