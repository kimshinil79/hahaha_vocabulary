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

