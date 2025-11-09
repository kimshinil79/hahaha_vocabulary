const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const { readFileSync } = require('fs');
const { join } = require('path');

// Firebase 설정
const firebaseConfig = {
  apiKey: 'AIzaSyAQY-tXbLL-u1MLGDo_keO2HmSnmaAOlF0',
  authDomain: 'memorizewholetext.firebaseapp.com',
  projectId: 'memorizewholetext',
  storageBucket: 'memorizewholetext.appspot.com',
  messagingSenderId: '1017620600279',
  appId: '1:1017620600279:web:1ef89648b5c2d17f56e792',
  measurementId: 'G-HYV1GDPW35',
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 커맨드 라인 인자에서 파일명 가져오기
const fileName = process.argv[2];

if (!fileName) {
  console.error('❌ 사용법: node scripts/upload-words.js <파일명>');
  console.error('   예: node scripts/upload-words.js words4.json');
  process.exit(1);
}

// JSON 파일 경로
const jsonPath = join(__dirname, '..', fileName);

// JSON 파일 읽기
function readWordsFromJSON() {
  try {
    const jsonContent = readFileSync(jsonPath, 'utf-8');
    const wordsData = JSON.parse(jsonContent);
    console.log(`📄 JSON에서 ${Object.keys(wordsData).length}개의 단어를 읽었습니다.`);
    return wordsData;
  } catch (error) {
    console.error('❌ JSON 파일 읽기 실패:', error);
    if (error.code === 'ENOENT') {
      console.error(`   파일을 찾을 수 없습니다: ${jsonPath}`);
    } else if (error instanceof SyntaxError) {
      console.error(`   JSON 형식 오류: ${error.message}`);
      console.error(`   파일이 완전한지 확인해주세요.`);
    }
    process.exit(1);
  }
}

// 단어들을 개별적으로 Firebase에 업로드 (한 단어씩)
async function uploadWordsOneByOne(wordKeys, wordsData) {
  let totalSuccess = 0;
  let totalFail = 0;
  const failedWords = [];

  console.log(`🚀 총 ${wordKeys.length}개 단어를 한 단어씩 업로드합니다.\n`);
  console.log(`⚠️  Firebase 할당량 초과 방지를 위해 개별 업로드 모드를 사용합니다.\n`);

  // 한 단어씩 업로드
  for (let i = 0; i < wordKeys.length; i++) {
    const wordKey = wordKeys[i];
    
    // 진행 상황 표시 (10개마다 또는 처음/마지막)
    if (i % 10 === 0 || i === 0 || i === wordKeys.length - 1) {
      const percentage = Math.round((i / wordKeys.length) * 100);
      console.log(`📦 진행 중: ${i + 1}/${wordKeys.length} (${percentage}%) - 현재: ${wordKey}`);
    }

    let retryCount = 0;
    const maxRetries = 3;
    let uploadSuccess = false;

    while (!uploadSuccess && retryCount < maxRetries) {
      try {
        const wordData = wordsData[wordKey];
        if (!wordData) {
          console.warn(`⚠️  단어 데이터 없음: ${wordKey}`);
          failedWords.push(wordKey);
          totalFail++;
          uploadSuccess = true;
          continue;
        }

        // 문서 ID는 단어의 소문자 버전 사용
        const docId = wordKey.toLowerCase();
        const docRef = doc(db, 'words', docId);
        
        // words4.json의 구조 그대로 업로드 (word, pos, meanings, updatedAt)
        // merge: true로 설정하여 기존 단어가 있으면 업데이트, 없으면 생성
        await setDoc(docRef, wordData, { merge: true });
        
        totalSuccess++;
        uploadSuccess = true;

      } catch (error) {
        retryCount++;
        
        if (error.code === 'resource-exhausted' || error.message.includes('RESOURCE_EXHAUSTED')) {
          if (retryCount < maxRetries) {
            // 지수 백오프: 5초, 10초, 20초
            const backoffDelay = 5000 * Math.pow(2, retryCount - 1);
            console.log(`   ⚠️  할당량 초과 - ${wordKey} 업로드 재시도 ${retryCount}/${maxRetries} (${backoffDelay/1000}초 대기)`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          } else {
            console.error(`   ❌ 업로드 실패 (최대 재시도 초과): ${wordKey}`);
            failedWords.push(wordKey);
            totalFail++;
            uploadSuccess = true;
          }
        } else {
          console.error(`   ❌ 업로드 실패: ${wordKey} - ${error.message}`);
          failedWords.push(wordKey);
          totalFail++;
          uploadSuccess = true;
        }
      }
    }

    // 각 업로드 간 딜레이 (할당량 초과 방지) - 1초 대기
    if (i < wordKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return { totalSuccess, totalFail, failedWords };
}

// 메인 실행 함수
async function main() {
  console.log(`🔥 Firebase 단어 업로드 스크립트 시작 (${fileName}에서)`);
  console.log('📋 전체 단어를 한 단어씩 업로드합니다.\n');

  try {
    // 1. JSON에서 단어 데이터 읽기
    const wordsData = readWordsFromJSON();
    
    // 2. 모든 단어 키 가져오기
    const wordKeys = Object.keys(wordsData);
    console.log(`📋 총 ${wordKeys.length}개 단어를 업로드합니다.\n`);

    // 3. 한 단어씩 Firebase에 업로드
    const { totalSuccess, totalFail, failedWords } = await uploadWordsOneByOne(wordKeys, wordsData);

    console.log(`\n📊 최종 업로드 통계:`);
    console.log(`   ✅ 성공: ${totalSuccess}개`);
    console.log(`   ❌ 실패: ${totalFail}개`);

    if (totalFail > 0 && failedWords.length > 0) {
      console.log(`\n⚠️  실패한 단어 목록 (${failedWords.length}개):`);
      failedWords.slice(0, 20).forEach(word => {
        console.log(`   - ${word}`);
      });
      if (failedWords.length > 20) {
        console.log(`   ... 외 ${failedWords.length - 20}개 더`);
      }
      
      // 실패한 단어들을 파일로 저장
      const { writeFileSync } = require('fs');
      const baseFileName = fileName.replace('.json', '');
      const failedWordsPath = join(__dirname, '..', `failed-${baseFileName}.json`);
      writeFileSync(failedWordsPath, JSON.stringify(failedWords, null, 2));
      console.log(`\n💾 실패한 단어 목록이 ${failedWordsPath}에 저장되었습니다.`);
    }

    if (totalFail === 0) {
      console.log('\n🎉 모든 단어 업로드 완료!');
    } else {
      console.log(`\n⚠️  ${totalFail}개 단어 업로드 실패. 로그를 확인해주세요.`);
    }

  } catch (error) {
    console.error('💥 스크립트 실행 실패:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();

