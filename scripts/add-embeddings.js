const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');
const { pipeline } = require('@xenova/transformers');

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

// Embedding 생성 함수
async function generateEmbedding(text) {
  try {
    // sentence-transformers 모델 사용 (영어 텍스트용)
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    
    // 텍스트에서 embedding 추출
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    
    // Tensor를 배열로 변환
    const embedding = Array.from(output.data);
    return embedding;
  } catch (error) {
    console.error('Embedding 생성 오류:', error);
    throw error;
  }
}

// 'a' 단어의 embedding 업데이트
async function updateWordEmbeddings() {
  try {
    console.log('🔥 Firebase에서 "a" 단어 데이터 가져오는 중...\n');
    
    // Firebase에서 'a' 단어 가져오기
    const wordDocRef = doc(db, 'words', 'above');
    const wordDocSnap = await getDoc(wordDocRef);
    
    if (!wordDocSnap.exists()) {
      console.error('❌ "a" 단어를 찾을 수 없습니다.');
      return;
    }
    
    const wordData = wordDocSnap.data();
    console.log(`📄 단어: ${wordData.word}`);
    console.log(`📊 meanings 개수: ${wordData.meanings?.length || 0}\n`);
    
    if (!wordData.meanings || wordData.meanings.length === 0) {
      console.log('⚠️  meanings가 없습니다.');
      return;
    }
    
    // Transformers.js 모델 로드
    console.log('🤖 Transformers.js 모델 로딩 중...');
    console.log('   (첫 실행 시 모델 다운로드로 시간이 걸릴 수 있습니다)\n');
    
    // 각 meaning에 대해 embedding 생성
    const updatedMeanings = [];
    
    for (let i = 0; i < wordData.meanings.length; i++) {
      const meaning = wordData.meanings[i];
      console.log(`📝 처리 중: ${i + 1}/${wordData.meanings.length} - ${meaning.id}`);
      
      // examples의 첫 번째 문장을 사용 (영어 부분만 추출)
      let textToEmbed = '';
      
      if (meaning.examples && meaning.examples.length > 0) {
        // 예문에서 영어 부분만 추출 (괄호 이전 부분)
        const example = meaning.examples[0];
        const englishPart = example.split('(')[0].trim();
        // ** 표시 제거
        textToEmbed = englishPart.replace(/\*\*/g, '').trim();
      } else if (meaning.definition) {
        // 예문이 없으면 definition 사용
        textToEmbed = meaning.definition;
      }
      
      if (textToEmbed) {
        console.log(`   텍스트: "${textToEmbed}"`);
        
        try {
          const embedding = await generateEmbedding(textToEmbed);
          console.log(`   ✅ Embedding 생성 완료 (차원: ${embedding.length})`);
          
          updatedMeanings.push({
            ...meaning,
            embedding: embedding
          });
        } catch (error) {
          console.error(`   ❌ Embedding 생성 실패:`, error.message);
          // 실패해도 기존 데이터 유지
          updatedMeanings.push({
            ...meaning,
            embedding: meaning.embedding || []
          });
        }
      } else {
        console.log(`   ⚠️  텍스트가 없어 embedding을 생성할 수 없습니다.`);
        updatedMeanings.push({
          ...meaning,
          embedding: meaning.embedding || []
        });
      }
      
      console.log('');
    }
    
    // Firebase에 업데이트
    console.log('💾 Firebase에 업데이트 중...');
    await updateDoc(wordDocRef, {
      meanings: updatedMeanings,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ 업데이트 완료!\n');
    console.log('📊 요약:');
    console.log(`   - 처리된 meanings: ${updatedMeanings.length}개`);
    const withEmbedding = updatedMeanings.filter(m => m.embedding && m.embedding.length > 0).length;
    console.log(`   - Embedding이 있는 meanings: ${withEmbedding}개`);
    
  } catch (error) {
    console.error('💥 오류 발생:', error);
    process.exit(1);
  }
}

// 메인 실행
async function main() {
  console.log('🚀 Embedding 추가 스크립트 시작\n');
  await updateWordEmbeddings();
  console.log('🎉 완료!');
}

main();

