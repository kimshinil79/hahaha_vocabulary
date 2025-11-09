const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
} = require('firebase/firestore');
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

let transformersExtractorPromise = null;

async function getTransformersExtractor() {
  if (!transformersExtractorPromise) {
    transformersExtractorPromise = pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }
  return transformersExtractorPromise;
}

// Transformers.js로 embedding 생성
async function generateTransformersEmbedding(text) {
  try {
    const extractor = await getTransformersExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    
    // Tensor를 배열로 변환
    let embedding = [];
    if (Array.isArray(output)) {
      embedding = output;
    } else if (output.data) {
      if (Array.isArray(output.data)) {
        embedding = output.data;
      } else if (output.data && typeof output.data === 'object' && 'length' in output.data) {
        embedding = Array.from(output.data);
      }
    } else if (typeof output === 'object' && 'length' in output) {
      embedding = Array.from(output);
    }
    
    return embedding;
  } catch (error) {
    console.error('Transformers.js Embedding 생성 오류:', error);
    throw error;
  }
}

// TensorFlow.js 스타일의 embedding 생성 (해싱 기반)
// 참고: 실제 프로덕션에서는 Universal Sentence Encoder를 사용하는 것이 좋습니다
function generateTensorFlowEmbedding(text, embeddingSize) {
  try {
    const words = text.toLowerCase().split(/\s+/);
    const tfEmbedding = new Array(embeddingSize).fill(0);
    
    // 단어의 위치와 문맥을 고려한 embedding 생성
    words.forEach((word, wordIdx) => {
      for (let i = 0; i < word.length; i++) {
        const charCode = word.charCodeAt(i);
        // 단어의 위치와 문맥을 고려한 인덱스 계산
        const pos = (charCode + wordIdx * 100) % embeddingSize;
        // 사인 함수를 사용하여 부드러운 분포 생성
        tfEmbedding[pos] += Math.sin(charCode * 0.01) * (1.0 / (wordIdx + 1));
      }
    });
    
    // 정규화 (L2 norm)
    const norm = Math.sqrt(tfEmbedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      return tfEmbedding.map(val => val / norm);
    }
    
    return tfEmbedding;
  } catch (error) {
    console.error('TensorFlow.js Embedding 생성 오류:', error);
    throw error;
  }
}

// 단어의 embedding 구조 업데이트
function hasExistingEmbedding(embedding) {
  if (!embedding) return false;
  if (Array.isArray(embedding)) {
    return embedding.length > 0;
  }
  if (typeof embedding === 'object') {
    const transformers = embedding.transformers;
    const tensorflow = embedding.tensorflow;
    if (Array.isArray(transformers) && transformers.length > 0) return true;
    if (Array.isArray(tensorflow) && tensorflow.length > 0) return true;
  }
  return false;
}

function needsStructureUpgrade(embedding) {
  if (!embedding) return false;
  if (Array.isArray(embedding)) return true;
  if (typeof embedding === 'object') {
    if (!('transformers' in embedding) || !('tensorflow' in embedding)) {
      return true;
    }
  }
  return false;
}

async function updateWordEmbeddings(wordKey) {
  try {
    console.log(`🔥 Firebase에서 "${wordKey}" 단어 데이터 가져오는 중...\n`);
    
    // Firebase에서 단어 가져오기
    const wordDocRef = doc(db, 'words', wordKey.toLowerCase());
    const wordDocSnap = await getDoc(wordDocRef);
    
    if (!wordDocSnap.exists()) {
      console.error(`❌ "${wordKey}" 단어를 찾을 수 없습니다.`);
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
    let hasChanges = false;
    
    for (let i = 0; i < wordData.meanings.length; i++) {
      const meaning = wordData.meanings[i];
      console.log(`📝 처리 중: ${i + 1}/${wordData.meanings.length} - ${meaning.id || `meaning_${i}`}`);

      const existingEmbedding = meaning.embedding;
      const hasEmbedding = hasExistingEmbedding(existingEmbedding);
      const upgradeStructure = needsStructureUpgrade(existingEmbedding);

      // examples의 첫 번째 문장을 사용 (영어 부분만 추출)
      let textToEmbed = '';
      if (meaning.examples && meaning.examples.length > 0) {
        const example = meaning.examples[0];
        const englishPart = example.split('(')[0].trim();
        textToEmbed = englishPart.replace(/\*\*/g, '').trim();
      }

      const canGenerate = Boolean(textToEmbed) && !hasEmbedding;

      if (canGenerate) {
        console.log(`   텍스트: "${textToEmbed}"`);
        try {
          console.log(`   🔄 Transformers.js embedding 생성 중...`);
          const transformersEmbedding = await generateTransformersEmbedding(textToEmbed);
          console.log(`   ✅ Transformers.js embedding 완료 (차원: ${transformersEmbedding.length})`);

          console.log(`   🔄 TensorFlow.js embedding 생성 중...`);
          const tensorflowEmbedding = generateTensorFlowEmbedding(textToEmbed, transformersEmbedding.length);
          console.log(`   ✅ TensorFlow.js embedding 완료 (차원: ${tensorflowEmbedding.length})`);

          updatedMeanings.push({
            ...meaning,
            embedding: {
              transformers: transformersEmbedding,
              tensorflow: tensorflowEmbedding,
            },
          });
          hasChanges = true;
          console.log(`   ✅ Embedding 구조 업데이트 완료\n`);
          continue;
        } catch (error) {
          console.error(`   ❌ Embedding 생성 실패:`, error.message);
        }
      }

      if (upgradeStructure) {
        let transformers = [];
        let tensorflow = [];

        if (Array.isArray(existingEmbedding)) {
          transformers = existingEmbedding;
          console.log('   ℹ️ 기존 배열 구조를 새 구조로 변환합니다.');
        } else if (existingEmbedding && typeof existingEmbedding === 'object') {
          transformers = Array.isArray(existingEmbedding.transformers)
            ? existingEmbedding.transformers
            : [];
          tensorflow = Array.isArray(existingEmbedding.tensorflow)
            ? existingEmbedding.tensorflow
            : [];
        }

        updatedMeanings.push({
          ...meaning,
          embedding: {
            transformers,
            tensorflow,
          },
        });
        hasChanges = true;
      } else {
        updatedMeanings.push(meaning);
      }

      if (!canGenerate) {
        if (!textToEmbed) {
          console.log('   ⚠️  예문이 없어 embedding을 생성하지 않습니다.');
        } else if (hasEmbedding) {
          console.log('   ✅ 이미 embedding이 존재하여 건너뜁니다.');
        }
      }

      console.log('');
    }
    
    if (hasChanges) {
      console.log('💾 Firebase에 업데이트 중...');
      await updateDoc(wordDocRef, {
        meanings: updatedMeanings,
        updatedAt: new Date().toISOString(),
      });
      
      console.log('✅ 업데이트 완료!\n');
      console.log('📊 요약:');
      console.log(`   - 처리된 meanings: ${updatedMeanings.length}개`);
      const withTransformers = updatedMeanings.filter(
        (m) =>
          m.embedding &&
          m.embedding.transformers &&
          Array.isArray(m.embedding.transformers) &&
          m.embedding.transformers.length > 0
      ).length;
      const withTensorflow = updatedMeanings.filter(
        (m) =>
          m.embedding &&
          m.embedding.tensorflow &&
          Array.isArray(m.embedding.tensorflow) &&
          m.embedding.tensorflow.length > 0
      ).length;
      console.log(`   - Transformers.js embedding이 있는 meanings: ${withTransformers}개`);
      console.log(`   - TensorFlow.js embedding이 있는 meanings: ${withTensorflow}개`);
    } else {
      console.log('ℹ️ 변경 사항이 없어 업데이트를 건너뜁니다.\n');
    }
    
  } catch (error) {
    console.error('💥 오류 발생:', error);
    process.exit(1);
  }
}

async function processAllWordsSequentially() {
  try {
    console.log('📚 words 컬렉션의 모든 단어를 순차적으로 처리합니다.\n');
    const wordsCol = collection(db, 'words');
    const snapshot = await getDocs(wordsCol);

    console.log(`🔢 총 ${snapshot.size}개의 단어 문서를 불러왔습니다.\n`);

    let processed = 0;
    for (const docSnap of snapshot.docs) {
      processed += 1;
      const wordKey = docSnap.id;
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`(${processed}/${snapshot.size}) "${wordKey}" 처리 시작`);
      await updateWordEmbeddings(wordKey);
    }

    console.log('\n🎉 words 컬렉션의 모든 문서를 처리했습니다!');
  } catch (error) {
    console.error('💥 전체 단어 처리 중 오류 발생:', error);
    process.exit(1);
  }
}

// 메인 실행
async function main() {
  const wordKey = process.argv[2];

  console.log('🚀 Embedding 구조 업데이트 스크립트 시작\n');
  console.log('   새로운 구조:');
  console.log('   {');
  console.log('     "embedding": {');
  console.log('       "transformers": [0.12, -0.23, 0.45, ...],');
  console.log('       "tensorflow": [0.09, 0.17, -0.05, ...]');
  console.log('     }');
  console.log('   }\n');

  if (wordKey) {
    console.log(`📋 "${wordKey}" 단어의 embedding을 업데이트합니다.\n`);
    await updateWordEmbeddings(wordKey);
    console.log('🎉 완료!');
  } else {
    await processAllWordsSequentially();
  }
}

main();

