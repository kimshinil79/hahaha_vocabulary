/**
 * Firebase words 컬렉션의 모든 단어/뜻마다
 * 6가지 수준의 예문이 모두 있는지 확인하는 스크립트
 * 
 * 실행 방법:
 * npx tsx scripts/check-examples.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, startAfter, DocumentSnapshot } from 'firebase/firestore';
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

// Firebase 설정
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
  'elementary',
  'middle',
  'high',
  'KSAT',
  'Toeic',
  'Toefl',
] as const;

interface ExamplesMap {
  [key: string]: string | string[]; // 배열 형태로 변경됨
}

interface WordMeaning {
  id: string;
  definition: string;
  examples?: string[] | ExamplesMap;
}

interface WordDocument {
  word: string;
  meanings: WordMeaning[];
}

interface Statistics {
  totalWords: number;
  totalMeanings: number;
  completeMeanings: number; // 6개 수준 모두 있는 뜻
  incompleteMeanings: number; // 일부 수준만 있거나 없는 뜻
  noExamplesMeanings: number; // 예문이 전혀 없는 뜻
  wordsWithoutExamples: string[]; // 예문이 없는 단어들
  noExamplesList: Array<{ word: string; meaningIndex: number; definition: string }>; // 예문이 없는 뜻 목록
  incompleteWords: Array<{ word: string; meaningIndex: number; definition: string; missingLevels: string[] }>;
}

/**
 * 예문이 완전한지 확인 (6가지 수준 모두 있는지)
 * 각 수준의 예문이 배열 형태이고 비어있지 않은지 확인
 */
function checkExamplesComplete(examples: string[] | ExamplesMap | undefined): {
  isComplete: boolean;
  missingLevels: string[];
} {
  if (!examples) {
    return { isComplete: false, missingLevels: [...LEVELS] };
  }

  // 배열 형태면 불완전 (기존 배열 형태의 예문)
  if (Array.isArray(examples)) {
    return { isComplete: false, missingLevels: [...LEVELS] };
  }

  // Map 형태인지 확인
  const exampleMap = examples as ExamplesMap;
  const missingLevels: string[] = [];

  for (const level of LEVELS) {
    const exampleValue = exampleMap[level];
    
    if (!exampleValue) {
      missingLevels.push(level);
      continue;
    }

    // 배열 형태인 경우
    if (Array.isArray(exampleValue)) {
      // 배열이 비어있거나, 모든 요소가 빈 문자열이면 누락으로 간주
      const hasValidExample = exampleValue.length > 0 && 
        exampleValue.some((item: any) => 
          typeof item === 'string' && String(item).trim().length > 0
        );
      if (!hasValidExample) {
        missingLevels.push(level);
      }
    } 
    // 문자열 형태인 경우 (기존 형태, 마이그레이션 전 데이터)
    else if (typeof exampleValue === 'string') {
      if (exampleValue.trim().length === 0) {
        missingLevels.push(level);
      }
    } 
    // 그 외 타입은 누락으로 간주
    else {
      missingLevels.push(level);
    }
  }

  return {
    isComplete: missingLevels.length === 0,
    missingLevels,
  };
}

/**
 * 메인 확인 함수
 */
async function checkAllExamples() {
  console.log('🔍 예문 완성도 확인 시작\n');

  const wordsRef = collection(db, 'words');
  let lastDoc: DocumentSnapshot | null = null;
  const batchSize = 100;
  
  const stats: Statistics = {
    totalWords: 0,
    totalMeanings: 0,
    completeMeanings: 0,
    incompleteMeanings: 0,
    noExamplesMeanings: 0,
    wordsWithoutExamples: [],
    noExamplesList: [],
    incompleteWords: [],
  };

  while (true) {
    try {
      // 100개씩 단어 읽기
      let q = query(wordsRef, limit(batchSize));
      if (lastDoc) {
        q = query(wordsRef, startAfter(lastDoc), limit(batchSize));
      }

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        break;
      }

      console.log(`📖 ${snapshot.size}개 단어 확인 중... (총 ${stats.totalWords + snapshot.size}개)`);

      for (const wordDoc of snapshot.docs) {
        const wordData = wordDoc.data() as WordDocument;
        const word = wordData.word || wordDoc.id;
        
        stats.totalWords++;

        if (!wordData.meanings || wordData.meanings.length === 0) {
          stats.wordsWithoutExamples.push(word);
          continue;
        }

        let hasAnyExample = false;

        // 각 뜻별로 확인
        for (let i = 0; i < wordData.meanings.length; i++) {
          const meaning = wordData.meanings[i];
          stats.totalMeanings++;

          const { isComplete, missingLevels } = checkExamplesComplete(meaning.examples);

          if (isComplete) {
            stats.completeMeanings++;
            hasAnyExample = true;
          } else if (missingLevels.length === LEVELS.length) {
            // 예문이 전혀 없음
            stats.noExamplesMeanings++;
            stats.noExamplesList.push({
              word,
              meaningIndex: i + 1,
              definition: meaning.definition || '',
            });
          } else {
            // 일부 수준만 있음
            stats.incompleteMeanings++;
            stats.incompleteWords.push({
              word,
              meaningIndex: i + 1,
              definition: meaning.definition || '',
              missingLevels,
            });
            hasAnyExample = true;
          }
        }

        if (!hasAnyExample) {
          stats.wordsWithoutExamples.push(word);
        }
      }

      // 마지막 문서 저장
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

    } catch (error) {
      console.error('❌ 배치 처리 중 오류:', error);
      break;
    }
  }

  // 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('📊 예문 완성도 통계');
  console.log('='.repeat(60));
  console.log(`\n📝 전체 단어 수: ${stats.totalWords.toLocaleString()}개`);
  console.log(`📚 전체 뜻 수: ${stats.totalMeanings.toLocaleString()}개`);
  console.log(`\n✅ 완전한 예문 (6개 수준 모두): ${stats.completeMeanings.toLocaleString()}개 (${((stats.completeMeanings / stats.totalMeanings) * 100).toFixed(2)}%)`);
  console.log(`⚠️  불완전한 예문 (일부 수준만): ${stats.incompleteMeanings.toLocaleString()}개 (${((stats.incompleteMeanings / stats.totalMeanings) * 100).toFixed(2)}%)`);
  console.log(`❌ 예문 없음: ${stats.noExamplesMeanings.toLocaleString()}개 (${((stats.noExamplesMeanings / stats.totalMeanings) * 100).toFixed(2)}%)`);

  if (stats.noExamplesList.length > 0) {
    console.log(`\n📋 예문이 전혀 없는 뜻: ${stats.noExamplesList.length}개`);
    console.log(`\n전체 목록:`);
    stats.noExamplesList.forEach((item, index) => {
      const definitionShort = item.definition.length > 50 
        ? item.definition.substring(0, 50) + '...' 
        : item.definition;
      console.log(`   ${index + 1}. "${item.word}" (뜻 ${item.meaningIndex}): ${definitionShort}`);
    });
  } else {
    console.log(`\n📋 예문이 전혀 없는 뜻은 없습니다.`);
  }

  if (stats.wordsWithoutExamples.length > 0) {
    console.log(`\n📋 예문이 전혀 없는 단어 (모든 뜻에 예문 없음): ${stats.wordsWithoutExamples.length}개`);
    console.log(`\n전체 목록:`);
    stats.wordsWithoutExamples.forEach((word, index) => {
      console.log(`   ${index + 1}. ${word}`);
    });
  } else {
    console.log(`\n📋 예문이 전혀 없는 단어는 없습니다.`);
  }

  if (stats.incompleteWords.length > 0) {
    console.log(`\n📋 불완전한 예문이 있는 단어/뜻: ${stats.incompleteWords.length}개`);
    console.log('\n처음 20개:');
    stats.incompleteWords.slice(0, 20).forEach((item) => {
      const definitionShort = item.definition.length > 30 
        ? item.definition.substring(0, 30) + '...' 
        : item.definition;
      console.log(`   - "${item.word}" (뜻 ${item.meaningIndex}): ${definitionShort}`);
      console.log(`     누락된 수준: ${item.missingLevels.join(', ')}`);
    });
    if (stats.incompleteWords.length > 20) {
      console.log(`   ... 외 ${stats.incompleteWords.length - 20}개`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 확인 완료!');
  console.log('='.repeat(60) + '\n');
}

// 스크립트 실행
if (require.main === module) {
  checkAllExamples()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 스크립트 실행 중 오류:', error);
      process.exit(1);
    });
}

export { checkAllExamples };

