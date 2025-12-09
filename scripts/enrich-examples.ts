/**
 * Firebase words 컬렉션의 단어들에 대해
 * 각 뜻별로 6가지 수준의 예문을 생성하여 저장하는 스크립트
 * 
 * 실행 방법:
 * npx tsx scripts/enrich-examples.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, query, limit, startAfter, DocumentSnapshot } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// .env 파일 로드 (여러 경로 시도)
const envPaths = [
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✅ 환경 변수 로드: ${envPath}`);
    break;
  }
}

// Firebase 설정 (기존 firebase.ts와 동일한 설정 사용)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 예문 수준 정의
const LEVELS = [
  { key: 'elementary', name: '초등학교 수준' },
  { key: 'middle', name: '중학교 수준' },
  { key: 'high', name: '고등학교 수준' },
  { key: 'KSAT', name: '수능 영어 스타일' },
  { key: 'Toeic', name: '토익 스타일' },
  { key: 'Toefl', name: '토플 스타일' },
] as const;

type LevelKey = typeof LEVELS[number]['key'];

// 예문을 map 구조로 저장: { 'elementary': ["예문"], 'middle': ["예문"], ... }
interface ExamplesMap {
  [key: string]: string[]; // key는 level (elementary, middle, high, KSAT, Toeic, Toefl), value는 배열
}

interface WordMeaning {
  id: string;
  definition: string;
  examples?: string[] | ExamplesMap; // 기존은 string[], 새로는 ExamplesMap (각 값이 배열)
  keywords?: string[];
  difficulty?: number;
  frequency?: number;
  updatedAt?: string;
}

interface WordDocument {
  word: string;
  meanings: WordMeaning[];
  pos?: string[];
  pronunciation?: string;
  updatedAt?: string;
}

/**
 * ChatGPT API를 호출하여 6가지 수준의 예문을 한 번에 생성 (배치 처리)
 */
async function generateAllLevelExamplesBatch(
  word: string,
  definition: string
): Promise<ExamplesMap> {
  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey === 'YOUR_OPENAI_API_KEY_HERE') {
    throw new Error('OpenAI API 키가 설정되지 않았습니다.');
  }

  const prompt = `다음 영어 단어와 뜻에 대해 6가지 수준의 예문을 각각 하나씩 만들어주세요.

단어: "${word}"
뜻: "${definition}"

요구사항:
1. 각 수준에 맞는 난이도와 표현을 사용하세요.
2. 예문은 자연스럽고 실제로 사용할 수 있는 문장이어야 합니다.
3. JSON 형식으로만 반환하세요. 다른 설명은 포함하지 마세요.
4. 각 예문 형식: "영어 예문. (한국어 번역)"

수준별 특징:
- elementary (초등학교 수준): 초등학생이 이해할 수 있는 간단한 단어와 문장 구조, 일상적인 상황에서 사용되는 표현
- middle (중학교 수준): 중학생 수준의 기본적인 문법과 어휘, 간단한 복문 구조 사용 가능
- high (고등학교 수준): 고등학생 수준의 복잡한 문장 구조, 추상적 개념 표현 가능
- KSAT (수능 영어 스타일): 수능 영어 시험에 나올 수 있는 긴 문장, 다양한 문법 구조와 고급 어휘 사용
- Toeic (토익 스타일): 토익 시험에 나올 수 있는 비즈니스/일상 상황, 실용적이고 자연스러운 표현
- Toefl (토플 스타일): 토플 시험에 나올 수 있는 학술적 표현, 복잡한 논리 구조와 고급 어휘 사용

응답 형식 (JSON만 반환):
{
  "elementary": "영어 예문. (한국어 번역)",
  "middle": "영어 예문. (한국어 번역)",
  "high": "영어 예문. (한국어 번역)",
  "KSAT": "영어 예문. (한국어 번역)",
  "Toeic": "영어 예문. (한국어 번역)",
  "Toefl": "영어 예문. (한국어 번역)"
}

주의: 각 값은 문자열로 반환하되, 스크립트에서 배열로 변환됩니다.`;

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
            content: 'You are a helpful assistant that creates example sentences for English words. Always respond with valid JSON only, no additional text or explanation.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 800, // 6개 예문을 위한 충분한 토큰
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ChatGPT API 호출 실패: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    const content = responseData.choices[0].message.content.trim();
    
    // JSON 파싱
    let examplesData: any;
    try {
      examplesData = JSON.parse(content);
    } catch (parseError) {
      // JSON 파싱 실패 시 텍스트에서 추출 시도
      console.warn('JSON 파싱 실패, 텍스트에서 추출 시도:', content);
      throw new Error('JSON 파싱 실패');
    }
    
    // ExamplesMap 형식으로 변환 (각 값은 배열)
    const examples: ExamplesMap = {};
    
    for (const level of LEVELS) {
      const exampleValue = examplesData[level.key];
      
      if (exampleValue === undefined || exampleValue === null) {
        console.warn(`${level.key} 예문이 없음`);
        continue;
      }

      // 이미 배열이면 그대로 사용
      if (Array.isArray(exampleValue)) {
        examples[level.key] = exampleValue.map((item: any) => 
          typeof item === 'string' ? item.replace(/^["']|["']$/g, '').trim() : String(item).trim()
        ).filter((item: string) => item.length > 0);
      } else if (typeof exampleValue === 'string') {
        // 문자열이면 배열로 변환
        const cleanedText = exampleValue.replace(/^["']|["']$/g, '').trim();
        if (cleanedText.length > 0) {
          examples[level.key] = [cleanedText];
        }
      } else {
        console.warn(`${level.key} 예문 형식이 잘못됨: ${typeof exampleValue}`);
      }
    }
    
    return examples;
  } catch (error) {
    console.error(`예문 생성 실패 (${word}):`, error);
    throw error;
  }
}

/**
 * 단어의 특정 뜻에 대해 모든 수준의 예문 생성 (배치 처리)
 * 이제 한 번의 API 호출로 6가지 수준의 예문을 모두 생성합니다.
 */
async function generateAllLevelExamples(
  word: string,
  definition: string
): Promise<ExamplesMap> {
  try {
    console.log(`     모든 수준의 예문을 한 번에 생성 중...`);
    const examples = await generateAllLevelExamplesBatch(word, definition);
    
    // API 호출 간 딜레이 (rate limit 방지)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return examples;
  } catch (error) {
    console.error(`  ❌ 예문 생성 실패:`, error);
    // 실패 시 빈 객체 반환
    return {};
  }
}

/**
 * 단어 문서 업데이트
 */
async function updateWordDocument(wordKey: string, wordData: WordDocument): Promise<void> {
  try {
    const wordDocRef = doc(db, 'words', wordKey);
    await setDoc(wordDocRef, wordData, { merge: true });
    console.log(`✅ "${wordData.word}" 업데이트 완료`);
  } catch (error) {
    console.error(`❌ "${wordData.word}" 업데이트 실패:`, error);
    throw error;
  }
}

/**
 * 메인 처리 함수
 */
async function processWords(batchSize: number = 10, startFromWord?: string) {
  console.log('🚀 예문 생성 스크립트 시작\n');
  if (startFromWord) {
    console.log(`📍 "${startFromWord}" 단어부터 시작합니다.\n`);
  }
  
  const wordsRef = collection(db, 'words');
  let lastDoc: DocumentSnapshot | null = null;
  let processedCount = 0;
  let updatedCount = 0;
  let foundStartWord = !startFromWord; // 시작 단어를 찾았는지 여부
  
  while (true) {
    try {
      // 10개씩 단어 읽기
      let q = query(wordsRef, limit(batchSize));
      if (lastDoc) {
        q = query(wordsRef, startAfter(lastDoc), limit(batchSize));
      }
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        console.log('\n✅ 모든 단어 처리 완료!');
        break;
      }
      
      console.log(`\n📖 ${snapshot.size}개 단어 읽기 (총 ${processedCount + snapshot.size}개 처리됨)`);
      
      for (const wordDoc of snapshot.docs) {
        const wordData = wordDoc.data() as WordDocument;
        const wordKey = wordDoc.id;
        const word = wordData.word || wordKey;
        
        // 시작 단어를 찾을 때까지 스킵
        if (startFromWord && !foundStartWord) {
          const wordLower = word.toLowerCase();
          const startWordLower = startFromWord.toLowerCase();
          
          if (wordLower < startWordLower) {
            console.log(`⏭️  "${word}" 스킵 (시작 단어 찾는 중...)`);
            processedCount++;
            continue;
          } else if (wordLower === startWordLower || wordLower > startWordLower) {
            foundStartWord = true;
            console.log(`\n✅ 시작 단어 "${word}" 찾음! 이제부터 처리합니다.\n`);
          }
        }
        
        // 시작 단어를 찾지 못했으면 스킵
        if (startFromWord && !foundStartWord) {
          continue;
        }
        
        console.log(`\n📝 단어: "${word}"`);
        
        if (!wordData.meanings || wordData.meanings.length === 0) {
          console.log('  ⚠️  뜻이 없어서 스킵');
          processedCount++;
          continue;
        }
        
        let hasUpdate = false;
        const updatedMeanings: WordMeaning[] = [];
        
        // 각 뜻별로 처리
        for (let i = 0; i < wordData.meanings.length; i++) {
          const meaning = wordData.meanings[i];
          const definition = meaning.definition || '';
          
          if (!definition) {
            console.log(`  ⚠️  뜻 ${i + 1}: 정의가 없어서 스킵`);
            updatedMeanings.push(meaning);
            continue;
          }
          
          // definition에서 한글 부분만 추출 (예: "[명사] 떠나다" -> "떠나다")
          const koreanDefinition = definition.replace(/^\[[^\]]+\]\s*/, '').trim();
          
          if (!koreanDefinition) {
            console.log(`  ⚠️  뜻 ${i + 1}: 한글 정의가 없어서 스킵`);
            updatedMeanings.push(meaning);
            continue;
          }
          
          // 이미 ExamplesMap 형태인지 확인 (객체이고 모든 level 키들이 있는지)
          const existingExamples = meaning.examples;
          const isAlreadyMapFormat = existingExamples && 
            typeof existingExamples === 'object' && 
            !Array.isArray(existingExamples);
          
          if (isAlreadyMapFormat) {
            const exampleMap = existingExamples as any; // ExamplesMap 또는 기존 형태
            const exampleKeys = Object.keys(exampleMap);
            
            // 모든 6가지 수준이 있는지 확인 (배열 또는 문자열 모두 허용)
            const hasAllLevels = LEVELS.every(level => {
              const exampleValue = exampleMap[level.key];
              
              if (!exampleValue) {
                return false;
              }
              
              // 배열인 경우
              if (Array.isArray(exampleValue)) {
                return exampleValue.length > 0 && 
                       exampleValue.some((item: any) => 
                         typeof item === 'string' && String(item).trim().length > 0
                       );
              }
              
              // 문자열인 경우 (기존 형태)
              if (typeof exampleValue === 'string') {
                return String(exampleValue).trim().length > 0;
              }
              
              return false;
            });
            
            if (hasAllLevels) {
              console.log(`  ✓ 뜻 ${i + 1}: 이미 모든 수준의 예문이 업데이트됨 (${exampleKeys.length}개 수준)`);
              updatedMeanings.push(meaning);
              continue;
            } else {
              // 일부 수준만 있으면 다시 생성
              const missingLevels = LEVELS.filter(level => {
                const exampleValue = exampleMap[level.key];
                
                if (!exampleValue) {
                  return true;
                }
                
                // 배열인 경우
                if (Array.isArray(exampleValue)) {
                  return exampleValue.length === 0 || 
                         !exampleValue.some((item: any) => 
                           typeof item === 'string' && String(item).trim().length > 0
                         );
                }
                
                // 문자열인 경우
                if (typeof exampleValue === 'string') {
                  return String(exampleValue).trim().length === 0;
                }
                
                return true;
              });
              console.log(`  ⚠️  뜻 ${i + 1}: 일부 수준의 예문이 없음 (누락: ${missingLevels.map(l => l.name).join(', ')})`);
              // 계속 진행하여 예문 생성
            }
          }
          
          console.log(`  📚 뜻 ${i + 1}: "${koreanDefinition}"`);
          console.log(`     예문 생성 중...`);
          
          try {
            // 6가지 수준의 예문 생성
            const newExamples = await generateAllLevelExamples(word, koreanDefinition);
            
            const exampleCount = Object.keys(newExamples).length;
            if (exampleCount > 0) {
              const updatedMeaning: WordMeaning = {
                ...meaning,
                examples: newExamples,
                updatedAt: new Date().toISOString(),
              };
              
              updatedMeanings.push(updatedMeaning);
              hasUpdate = true;
              
              console.log(`     ✅ ${exampleCount}개 수준의 예문 생성 완료`);
            } else {
              console.log(`     ⚠️  예문 생성 실패`);
              updatedMeanings.push(meaning);
            }
          } catch (error) {
            console.error(`     ❌ 예문 생성 중 오류:`, error);
            updatedMeanings.push(meaning);
          }
        }
        
        // 업데이트가 있으면 Firebase에 저장
        if (hasUpdate) {
          const updatedWordData: WordDocument = {
            ...wordData,
            meanings: updatedMeanings,
            updatedAt: new Date().toISOString(),
          };
          
          await updateWordDocument(wordKey, updatedWordData);
          updatedCount++;
        }
        
        processedCount++;
        
        // 단어 간 딜레이
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 마지막 문서 저장 (다음 배치를 위해)
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      
      // 배치 간 딜레이
      console.log(`\n⏸️  ${batchSize}개 처리 완료. 잠시 대기...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('❌ 배치 처리 중 오류:', error);
      console.log('계속 진행합니다...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`\n📊 처리 완료 통계:`);
  console.log(`   - 총 처리된 단어: ${processedCount}개`);
  console.log(`   - 업데이트된 단어: ${updatedCount}개`);
}

// 스크립트 실행
if (require.main === module) {
  // 명령줄 인자에서 시작 단어 읽기 (예: npx tsx scripts/enrich-examples.ts agricultural)
  const startFromWord = process.argv[2] || undefined;
  
  processWords(10, startFromWord)
    .then(() => {
      console.log('\n🎉 스크립트 완료!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 스크립트 실행 중 오류:', error);
      process.exit(1);
    });
}

export { processWords, generateAllLevelExamples };

