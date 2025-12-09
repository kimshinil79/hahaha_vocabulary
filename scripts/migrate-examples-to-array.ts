/**
 * Firebase words 컬렉션의 예문을 배열 형태로 마이그레이션하는 스크립트
 * 
 * 기존: { elementary: "문장", middle: "문장", ... }
 * 변경: { elementary: ["문장"], middle: ["문장"], ... }
 * 
 * 이미 배열로 되어 있는 경우는 그대로 유지
 * 
 * 실행 방법:
 * npx tsx scripts/migrate-examples-to-array.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, query, limit, startAfter, DocumentSnapshot } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// .env 파일 로드
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
  [key: string]: string | string[]; // 기존은 string, 새로는 string[]
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

/**
 * 예문을 배열 형태로 변환
 */
function convertExamplesToArray(examples: string[] | ExamplesMap | undefined): ExamplesMap | undefined {
  if (!examples) {
    return undefined;
  }

  // 이미 배열 형태면 그대로 반환
  if (Array.isArray(examples)) {
    return undefined; // 배열 형태는 변환 불필요
  }

  // Map 형태인지 확인
  const exampleMap = examples as ExamplesMap;
  const convertedMap: ExamplesMap = {};
  let hasChanges = false;

  for (const level of LEVELS) {
    const value = exampleMap[level];
    
    if (value === undefined || value === null) {
      continue;
    }

    // 이미 배열이면 그대로 사용
    if (Array.isArray(value)) {
      convertedMap[level] = value;
    } else if (typeof value === 'string') {
      // 문자열이면 배열로 변환
      convertedMap[level] = [value];
      hasChanges = true;
    }
  }

  // 변경사항이 없으면 undefined 반환
  return hasChanges ? convertedMap : undefined;
}

/**
 * 메인 마이그레이션 함수
 */
async function migrateExamplesToArray() {
  console.log('🔄 예문 배열 형태로 마이그레이션 시작\n');

  const wordsRef = collection(db, 'words');
  let lastDoc: DocumentSnapshot | null = null;
  const batchSize = 100;
  
  let totalWords = 0;
  let totalMeanings = 0;
  let migratedMeanings = 0;
  let updatedWords = 0;

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

      console.log(`📖 ${snapshot.size}개 단어 확인 중... (총 ${totalWords + snapshot.size}개)`);

      for (const wordDoc of snapshot.docs) {
        const wordData = wordDoc.data() as WordDocument;
        const word = wordData.word || wordDoc.id;
        totalWords++;

        if (!wordData.meanings || wordData.meanings.length === 0) {
          continue;
        }

        let hasUpdate = false;
        const updatedMeanings: WordMeaning[] = [];

        // 각 뜻별로 확인
        for (let i = 0; i < wordData.meanings.length; i++) {
          const meaning = wordData.meanings[i];
          totalMeanings++;

          const convertedExamples = convertExamplesToArray(meaning.examples);

          if (convertedExamples) {
            // 변환이 필요한 경우
            updatedMeanings.push({
              ...meaning,
              examples: convertedExamples,
            } as WordMeaning);
            migratedMeanings++;
            hasUpdate = true;
          } else {
            // 변환 불필요 (이미 배열이거나 없음)
            updatedMeanings.push(meaning);
          }
        }

        // 업데이트가 있으면 Firebase에 저장
        if (hasUpdate) {
          const wordDocRef = doc(db, 'words', wordDoc.id);
          await setDoc(wordDocRef, {
            ...wordData,
            meanings: updatedMeanings,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          
          updatedWords++;
          console.log(`  ✅ "${word}" 업데이트 완료`);
        }
      }

      // 마지막 문서 저장
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      // 배치 간 딜레이
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error('❌ 배치 처리 중 오류:', error);
      break;
    }
  }

  // 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('📊 마이그레이션 통계');
  console.log('='.repeat(60));
  console.log(`\n📝 전체 단어 수: ${totalWords.toLocaleString()}개`);
  console.log(`📚 전체 뜻 수: ${totalMeanings.toLocaleString()}개`);
  console.log(`🔄 마이그레이션된 뜻 수: ${migratedMeanings.toLocaleString()}개`);
  console.log(`✅ 업데이트된 단어 수: ${updatedWords.toLocaleString()}개`);
  console.log('\n' + '='.repeat(60));
  console.log('✅ 마이그레이션 완료!');
  console.log('='.repeat(60) + '\n');
}

// 스크립트 실행
if (require.main === module) {
  migrateExamplesToArray()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 스크립트 실행 중 오류:', error);
      process.exit(1);
    });
}

export { migrateExamplesToArray };

