require('dotenv').config();
const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
} = require('firebase/firestore');
const { pipeline, AutoTokenizer } = require('@xenova/transformers');

// Firebase 설정
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Firebase 설정이 누락되었습니다. .env 파일에 Firebase 설정을 추가하세요.');
  process.exit(1);
}

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let transformersExtractorPromise = null;
let tokenizerPromise = null;

async function getTransformersExtractor() {
  if (!transformersExtractorPromise) {
    transformersExtractorPromise = pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }
  return transformersExtractorPromise;
}

async function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = AutoTokenizer.from_pretrained('Xenova/all-MiniLM-L6-v2');
  }
  return tokenizerPromise;
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

// 특정 단어의 토큰 임베딩 생성 (문맥 기반)
async function generateTokenEmbeddingForWord(text, targetWord) {
  try {
    // 입력을 문자열로 강제 변환
    const inputText = (typeof text === 'string')
      ? text
      : (text && typeof text.toString === 'function')
        ? text.toString()
        : String(text ?? '');
    const targetStr = (typeof targetWord === 'string')
      ? targetWord
      : (targetWord && typeof targetWord.toString === 'function')
        ? targetWord.toString()
        : String(targetWord ?? '');

    const extractor = await getTransformersExtractor();
    // 토큰별 히든 상태 추출
    const output = await extractor(inputText, { pooling: 'none', normalize: false });

    // tokenVectors를 [tokens, hidden] 형태의 2차원 배열로 정규화
    let tokenVectors = null;
    if (Array.isArray(output) && output.length > 0) {
      // 이미 2차원 배열인 경우
      if (Array.isArray(output[0])) {
        tokenVectors = output;
      } else if (typeof output[0] === 'number') {
        // 드문 경우: 1차원만 온다면 변환 불가
        console.warn('feature-extraction 결과가 1차원 배열입니다. 토큰 임베딩 생성을 건너뜁니다.');
        return [];
      }
    } else if (output && typeof output === 'object') {
      // Tensor 형태 처리 (dims, data 기반)
      // 예상 dims: [seq, hidden] 또는 [1, seq, hidden]
      const dims = Array.isArray(output.dims) ? output.dims : null;
      const data = output.data;
      if (dims && data && (Array.isArray(data) || (data.BYTES_PER_ELEMENT !== undefined))) {
        const flat = Array.isArray(data) ? data : Array.from(data);
        let seq = 0;
        let hidden = 0;
        if (dims.length === 2) {
          seq = dims[0];
          hidden = dims[1];
        } else if (dims.length === 3) {
          const batch = dims[0];
          seq = dims[1];
          hidden = dims[2];
          if (batch !== 1) {
            console.warn(`예상치 못한 batch 크기: ${batch}. batch=1 가정으로 진행합니다.`);
          }
        }
        if (seq > 0 && hidden > 0 && flat.length === seq * hidden) {
          tokenVectors = new Array(seq);
          for (let i = 0; i < seq; i++) {
            const start = i * hidden;
            tokenVectors[i] = flat.slice(start, start + hidden);
          }
        }
      } else if (typeof output.tolist === 'function') {
        const list = output.tolist();
        if (Array.isArray(list) && Array.isArray(list[0])) {
          tokenVectors = list;
        }
      }
    }
    if (!tokenVectors || !Array.isArray(tokenVectors) || tokenVectors.length === 0 || !Array.isArray(tokenVectors[0])) {
      console.warn('feature-extraction 결과가 토큰 차원 배열이 아닙니다. 토큰 임베딩 생성을 건너뜁니다.');
      return [];
    }

    // 토큰 문자열 목록 (모델/토크나이저에 따라 special tokens 제외됨)
    let tokens = [];
    try {
      const tokenizer = await getTokenizer();
      // encode 선호: special tokens 제외하여 정렬 용이
      if (tokenizer && typeof tokenizer.encode === 'function') {
        const enc = await tokenizer.encode(inputText, { add_special_tokens: false });
        if (enc && Array.isArray(enc.tokens) && enc.tokens.length > 0) {
          tokens = enc.tokens;
        }
      }
      if (tokens.length === 0 && tokenizer && typeof tokenizer.tokenize === 'function') {
        tokens = tokenizer.tokenize(inputText) || [];
      } else if (tokenizer && typeof tokenizer.encode === 'function') {
        // 일부 구현에서는 encode 결과에 tokens가 있음
        const enc = await tokenizer.encode(inputText, { add_special_tokens: false });
        if (enc && Array.isArray(enc.tokens)) {
          tokens = enc.tokens;
        }
      }
    } catch (e) {
      console.warn('토크나이저 토큰 추출 실패, 휴리스틱으로 진행합니다:', e?.message || e);
      tokens = (inputText && typeof inputText === 'string') ? (inputText.match(/\S+/g) || []) : [];
    }

    // special token 보정치 추정
    let offset = 0;
    if (tokens.length > 0 && (tokenVectors.length - tokens.length === 2)) {
      // [CLS], [SEP]가 추가된 전형적인 경우
      offset = 1; // tokenVectors에서 실제 첫 토큰 위치
    }

    const clean = (t) => (t || '').replace(/^##/, '').replace(/^▁/, '').toLowerCase();
    const target = String(targetStr || '').toLowerCase();

    const matchIndices = [];

    if (tokens.length > 0) {
      // 1) 간단 포함/동등 매칭
      for (let i = 0; i < tokens.length; i++) {
        const tok = clean(tokens[i]);
        if (!tok) continue;
        if (tok === target || tok.includes(target) || target.includes(tok)) {
          const tvIdx = i + offset;
          if (tvIdx >= 0 && tvIdx < tokenVectors.length) {
            matchIndices.push(tvIdx);
          }
        }
      }

      // 2) 연속 서브워드 매칭 (fallback)
      if (matchIndices.length === 0) {
        try {
          const tokenizer = await getTokenizer();
          let targetTokens = [];
          if (tokenizer && typeof tokenizer.encode === 'function') {
            const enc = await tokenizer.encode(targetStr, { add_special_tokens: false });
            if (enc && Array.isArray(enc.tokens) && enc.tokens.length > 0) {
              targetTokens = enc.tokens;
            }
          }
          if (targetTokens.length === 0 && tokenizer && typeof tokenizer.tokenize === 'function') {
            targetTokens = tokenizer.tokenize(targetStr) || [];
          }
          const cleanedTargetTokens = targetTokens.map(clean);
          for (let i = 0; i <= tokens.length - cleanedTargetTokens.length; i++) {
            let ok = true;
            for (let j = 0; j < cleanedTargetTokens.length; j++) {
              if (clean(tokens[i + j]) !== cleanedTargetTokens[j]) {
                ok = false;
                break;
              }
            }
            if (ok) {
              for (let j = 0; j < cleanedTargetTokens.length; j++) {
                const tvIdx = i + j + offset;
                if (tvIdx >= 0 && tvIdx < tokenVectors.length) {
                  matchIndices.push(tvIdx);
                }
              }
              break;
            }
          }
        } catch (_) {
          // ignore
        }
      }
    } else {
      // 토큰 문자열을 얻지 못한 경우, 전체 토큰을 스캔하며 간단 휴리스틱 적용 불가 → 건너뜀
      console.warn('토큰 문자열을 얻지 못했습니다. 토큰 임베딩 생성을 건너뜁니다.');
    }

    if (matchIndices.length === 0) {
      // 매칭 실패
      return [];
    }

    const hiddenSize = tokenVectors[0].length;
    const sum = new Array(hiddenSize).fill(0);
    for (const idx of matchIndices) {
      const vec = tokenVectors[idx];
      for (let d = 0; d < hiddenSize; d++) {
        sum[d] += vec[d];
      }
    }
    // 평균 + L2 정규화
    const avg = sum.map((v) => v / matchIndices.length);
    const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? avg.map((v) => v / norm) : avg;
  } catch (error) {
    console.warn('토큰 임베딩 생성 중 오류:', error?.message || error);
    return [];
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

          // 토큰 임베딩 (문맥 내 target 단어 기준)
          let tokenEmbedding = [];
          if (textToEmbed) {
            const targetWord = String(wordData.word || wordKey || '').toLowerCase();
            console.log(`   🔎 Token embedding 생성 대상 단어: "${targetWord}"`);
            tokenEmbedding = await generateTokenEmbeddingForWord(textToEmbed, targetWord);
            if (Array.isArray(tokenEmbedding) && tokenEmbedding.length > 0) {
              console.log(`   ✅ Token embedding 생성 완료 (차원: ${tokenEmbedding.length})`);
            } else {
              console.log(`   ⚠️  Token embedding을 생성하지 못했습니다.`);
            }
          }

          updatedMeanings.push({
            ...meaning,
            embedding: {
              transformers: transformersEmbedding,
              tensorflow: tensorflowEmbedding,
              tokenEmbedding: Array.isArray(tokenEmbedding) ? tokenEmbedding : [],
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
        let tokenEmbedding = [];

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
          tokenEmbedding = Array.isArray(existingEmbedding.tokenEmbedding)
            ? existingEmbedding.tokenEmbedding
            : [];
        }

        // tokenEmbedding이 비어있고, 예문이 있으면 생성 시도
        if ((!Array.isArray(tokenEmbedding) || tokenEmbedding.length === 0) && textToEmbed) {
          const targetWord = String(wordData.word || wordKey || '').toLowerCase();
          console.log(`   🔎 Token embedding 생성 대상 단어: "${targetWord}"`);
          const generated = await generateTokenEmbeddingForWord(textToEmbed, targetWord);
          if (Array.isArray(generated) && generated.length > 0) {
            tokenEmbedding = generated;
            console.log(`   ✅ Token embedding 생성 완료 (차원: ${tokenEmbedding.length})`);
          }
        }

        updatedMeanings.push({
          ...meaning,
          embedding: {
            transformers,
            tensorflow,
            tokenEmbedding: Array.isArray(tokenEmbedding) ? tokenEmbedding : [],
          },
        });
        hasChanges = true;
      } else {
        // 기존 구조가 이미 새 구조인 경우에도 tokenEmbedding이 없으면 생성/추가
        let nextMeaning = { ...meaning };
        if (!nextMeaning.embedding || typeof nextMeaning.embedding !== 'object') {
          nextMeaning.embedding = { transformers: [], tensorflow: [], tokenEmbedding: [] };
        } else if (!('tokenEmbedding' in nextMeaning.embedding)) {
          nextMeaning.embedding.tokenEmbedding = [];
        }

        const needToken = !Array.isArray(nextMeaning.embedding.tokenEmbedding) || nextMeaning.embedding.tokenEmbedding.length === 0;
        if (needToken && textToEmbed) {
          const targetWord = String(wordData.word || wordKey || '').toLowerCase();
          console.log(`   🔎 Token embedding 생성 대상 단어: "${targetWord}"`);
          const generated = await generateTokenEmbeddingForWord(textToEmbed, targetWord);
          if (Array.isArray(generated) && generated.length > 0) {
            nextMeaning.embedding.tokenEmbedding = generated;
            hasChanges = true;
            console.log(`   ✅ Token embedding 생성 완료 (차원: ${generated.length})`);
          }
        }

        updatedMeanings.push(nextMeaning);
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

