// 단어 정리 관련 유틸리티 함수들
import { getLemma } from './wordUtils';

// 단어 뜻/예문 정리 함수 - 단어별 개별 처리
export const organizeWords = async (
  selectedWords: Array<{word: string; meaning: any; wordData: any}>,
  setStateCallbacks: {
    setIsLoadingWordData: (loading: boolean) => void;
    setWordDataList: (data: any[]) => void;
    setCurrentWordIndex: (index: number) => void;
    setBatchProgress: (progress: { current: number; total: number }) => void;
  }
): Promise<any[]> => {
  if (selectedWords.length === 0) {
    return [];
  }

  const {
    setIsLoadingWordData,
    setWordDataList,
    setCurrentWordIndex,
    setBatchProgress
  } = setStateCallbacks;

  setIsLoadingWordData(true);
  setWordDataList([]);
  setCurrentWordIndex(0);

  // catch 블록에서도 접근할 수 있도록 함수 스코프로 선언
  const allWordData: any[] = [];

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

      // API 엔드포인트 설정
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

    return allWordData;
  } catch (error) {
    console.error('단어 정리 오류:', error);
    
    let errorMessage = '알 수 없는 오류';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // JSON 파싱 오류인 경우 더 자세한 정보 제공
      if (error.message.includes('JSON')) {
        const currentProgress = { current: 0, total: 0 }; // 실제로는 state에서 가져와야 함
        errorMessage = `JSON 파싱 오류\n\nAI 응답 형식이 올바르지 않습니다.\n처리된 단어: ${currentProgress.current}/${currentProgress.total}\n\n원본 오류: ${error.message}`;
      }
    }
    
    throw new Error(`단어 정리 중 오류가 발생했습니다:\n\n${errorMessage}\n\n해결 방법:\n- 단어 수를 줄여서 다시 시도해보세요\n- 몇 분 후 다시 시도해보세요${allWordData.length > 0 ? `\n- ${allWordData.length}개 단어는 성공적으로 처리되었습니다` : ''}`);
  } finally {
    setIsLoadingWordData(false);
    setBatchProgress({ current: 0, total: 0 });
  }
};

