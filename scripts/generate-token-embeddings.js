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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let extractorPromise = null;
let tokenizerPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
}

async function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = AutoTokenizer.from_pretrained('Xenova/all-MiniLM-L6-v2');
  }
  return tokenizerPromise;
}

async function generateTokenEmbeddingForWord(text, targetWord) {
  try {
    const inputText = typeof text === 'string' ? text : String(text ?? '');
    const target = typeof targetWord === 'string' ? targetWord : String(targetWord ?? '');

    const extractor = await getExtractor();
    const output = await extractor(inputText, { pooling: 'none', normalize: false });

    let tokenVectors = null;
    if (Array.isArray(output) && output.length > 0) {
      if (Array.isArray(output[0])) {
        tokenVectors = output;
      }
    } else if (output && typeof output === 'object') {
      const dims = Array.isArray(output.dims) ? output.dims : null;
      const data = output.data;
      if (dims && data && (Array.isArray(data) || data.BYTES_PER_ELEMENT !== undefined)) {
        const flat = Array.isArray(data) ? data : Array.from(data);
        let seq = 0;
        let hidden = 0;
        if (dims.length === 2) {
          [seq, hidden] = dims;
        } else if (dims.length === 3) {
          seq = dims[1];
          hidden = dims[2];
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

    if (!tokenVectors || !Array.isArray(tokenVectors[0])) {
      console.warn('토큰 벡터를 추출하지 못했습니다.');
      return [];
    }

    let tokens = [];
    try {
      const tokenizer = await getTokenizer();
      if (tokenizer && typeof tokenizer.encode === 'function') {
        const enc = await tokenizer.encode(inputText, { add_special_tokens: false });
        if (enc && Array.isArray(enc.tokens) && enc.tokens.length > 0) {
          tokens = enc.tokens;
        }
      }
      if (!tokens.length && tokenizer && typeof tokenizer.tokenize === 'function') {
        tokens = tokenizer.tokenize(inputText) || [];
      }
    } catch (error) {
      console.warn('토큰 문자열 추출 실패, 휴리스틱 적용:', error?.message || error);
      tokens = inputText ? (inputText.match(/\S+/g) || []) : [];
    }

    let offset = 0;
    if (tokens.length && tokenVectors.length - tokens.length === 2) {
      offset = 1;
    }

    const clean = (value) => (value || '').replace(/^##/, '').replace(/^▁/, '').toLowerCase();
    const targetLower = String(target ?? '').toLowerCase();
    const matchIndices = [];

    if (tokens.length) {
      for (let i = 0; i < tokens.length; i++) {
        const tok = clean(tokens[i]);
        if (!tok) continue;
        if (tok === targetLower || tok.includes(targetLower) || targetLower.includes(tok)) {
          const vectorIndex = i + offset;
          if (vectorIndex >= 0 && vectorIndex < tokenVectors.length) {
            matchIndices.push(vectorIndex);
          }
        }
      }

      if (!matchIndices.length) {
        try {
          const tokenizer = await getTokenizer();
          let targetTokens = [];
          if (tokenizer && typeof tokenizer.encode === 'function') {
            const encoded = await tokenizer.encode(target, { add_special_tokens: false });
            if (encoded && Array.isArray(encoded.tokens) && encoded.tokens.length > 0) {
              targetTokens = encoded.tokens;
            }
          }
          if (!targetTokens.length && tokenizer && typeof tokenizer.tokenize === 'function') {
            targetTokens = tokenizer.tokenize(target) || [];
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
                const vectorIndex = i + j + offset;
                if (vectorIndex >= 0 && vectorIndex < tokenVectors.length) {
                  matchIndices.push(vectorIndex);
                }
              }
              break;
            }
          }
        } catch (error) {
          console.warn('서브워드 매칭 실패:', error?.message || error);
        }
      }
    }

    if (!matchIndices.length) {
      console.warn('대상 단어와 매칭되는 토큰을 찾지 못했습니다.');
      return [];
    }

    const hiddenSize = tokenVectors[0].length;
    const sum = new Array(hiddenSize).fill(0);
    for (const idx of matchIndices) {
      const vector = tokenVectors[idx];
      for (let d = 0; d < hiddenSize; d++) {
        sum[d] += vector[d];
      }
    }

    const avg = sum.map((value) => value / matchIndices.length);
    const norm = Math.sqrt(avg.reduce((acc, value) => acc + value * value, 0));
    return norm > 0 ? avg.map((value) => value / norm) : avg;
  } catch (error) {
    console.warn('토큰 임베딩 생성 오류:', error?.message || error);
    return [];
  }
}

function normalizeExample(example) {
  if (!example || typeof example !== 'string') return '';
  const englishPart = example.split('(')[0] || example;
  return englishPart.replace(/\*\*/g, '').trim();
}

function embeddingsEqual(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-8) {
      return false;
    }
  }
  return true;
}

async function updateTokenEmbeddingsForWord(wordKey) {
  const wordDocRef = doc(db, 'words', wordKey.toLowerCase());
  const wordDocSnap = await getDoc(wordDocRef);

  if (!wordDocSnap.exists()) {
    console.warn(`단어 "${wordKey}" 문서를 찾을 수 없습니다.`);
    return;
  }

  const wordData = wordDocSnap.data();
  const word = (wordData.word || wordKey || '').toLowerCase();
  const meanings = Array.isArray(wordData.meanings) ? wordData.meanings : [];

  if (!meanings.length) {
    console.log(`⚠️  "${wordKey}" 문서에 meanings가 없습니다.`);
    return;
  }

  console.log(`📄 단어: ${wordData.word || wordKey}`);
  console.log(`   meanings: ${meanings.length}개`);

  let hasChanges = false;
  const updatedMeanings = [];

  for (let i = 0; i < meanings.length; i++) {
    const meaning = meanings[i];
    const exampleText = normalizeExample(meaning.examples && meaning.examples[0]);
    const newMeaning = { ...meaning };

    if (!newMeaning.embedding || typeof newMeaning.embedding !== 'object') {
      newMeaning.embedding = { transformers: [], tensorflow: [], tokenEmbedding: [] };
    } else if (!('tokenEmbedding' in newMeaning.embedding)) {
      newMeaning.embedding.tokenEmbedding = [];
    }

    if (!exampleText) {
      console.log(`   (${i + 1}/${meanings.length}) 예문이 없어 token embedding을 건너뜁니다.`);
      updatedMeanings.push(newMeaning);
      continue;
    }

    console.log(`   (${i + 1}/${meanings.length}) 예문 기반 token embedding 생성 중...`);
    const tokenEmbedding = await generateTokenEmbeddingForWord(exampleText, word);
    if (tokenEmbedding.length) {
      if (!embeddingsEqual(tokenEmbedding, newMeaning.embedding.tokenEmbedding)) {
        newMeaning.embedding.tokenEmbedding = tokenEmbedding;
        hasChanges = true;
        console.log('      ✅ token embedding 업데이트 완료');
      } else {
        console.log('      ℹ️ 기존 token embedding과 동일하여 변경 없음');
      }
    } else {
      console.log('      ⚠️ token embedding을 생성하지 못했습니다.');
      if (!Array.isArray(newMeaning.embedding.tokenEmbedding)) {
        newMeaning.embedding.tokenEmbedding = [];
        hasChanges = true;
      }
    }

    updatedMeanings.push(newMeaning);
  }

  if (hasChanges) {
    console.log('💾 Firestore 업데이트 중...');
    await updateDoc(wordDocRef, {
      meanings: updatedMeanings,
      updatedAt: new Date().toISOString(),
    });
    console.log('✅ 저장 완료\n');
  } else {
    console.log('ℹ️ 변경 사항이 없어 저장을 건너뜁니다.\n');
  }
}

async function processAllWords() {
  const wordsCol = collection(db, 'words');
  const snapshot = await getDocs(wordsCol);

  console.log(`🔢 총 ${snapshot.size}개의 단어 문서를 처리합니다.\n`);

  let processed = 0;
  for (const docSnap of snapshot.docs) {
    processed += 1;
    const wordKey = docSnap.id;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`(${processed}/${snapshot.size}) "${wordKey}" 처리 시작`);
    await updateTokenEmbeddingsForWord(wordKey);
  }

  console.log('\n🎉 모든 단어의 token embedding 처리를 완료했습니다.');
}

async function main() {
  const wordKey = process.argv[2];
  console.log('🚀 Token embedding 생성 스크립트 시작\n');

  if (wordKey) {
    console.log(`📘 단일 단어 "${wordKey}" 처리\n`);
    await updateTokenEmbeddingsForWord(wordKey);
  } else {
    await processAllWords();
  }
}

main().catch((error) => {
  console.error('스크립트 실행 오류:', error);
  process.exit(1);
});
