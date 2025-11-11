import express from 'express';
import { pipeline, AutoTokenizer } from '@xenova/transformers';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Caches for expensive model/tokenizer initialisation
let extractorPromise = null;
let tokenizerPromise = null;

const getExtractor = () => {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
};

const getTokenizer = () => {
  if (!tokenizerPromise) {
    tokenizerPromise = AutoTokenizer.from_pretrained('Xenova/all-MiniLM-L6-v2');
  }
  return tokenizerPromise;
};

const tensorToArray = (tensor) => {
  if (!tensor) return [];
  if (Array.isArray(tensor)) return tensor;
  if (typeof tensor.tolist === 'function') {
    const result = tensor.tolist();
    console.log('[tensorToArray] tolist result:', Array.isArray(result) ? `array[${result.length}]` : typeof result);
    // If result is a 3D array (batch, tokens, hidden), extract first batch
    if (Array.isArray(result) && result.length === 1 && Array.isArray(result[0])) {
      console.log('[tensorToArray] extracting first batch, inner length:', result[0].length);
      return result[0];
    }
    return result;
  }
  const dims = tensor.dims || tensor.shape;
  const data = tensor.data;
  console.log('[tensorToArray] dims:', dims, 'data type:', data ? (Array.isArray(data) ? 'array' : typeof data) : 'null');
  
  if (dims && data) {
    const dimsArray = Array.isArray(dims) ? dims : Array.from(dims);
    const dataArray = Array.isArray(data) ? data : Array.from(data);
    
    console.log('[tensorToArray] dimsArray:', dimsArray, 'dataArray length:', dataArray.length);
    
    if (dimsArray.length === 2) {
      const [rows, cols] = dimsArray;
      const out = [];
      for (let r = 0; r < rows; r += 1) {
        out.push(dataArray.slice(r * cols, (r + 1) * cols));
      }
      console.log('[tensorToArray] 2D result:', out.length, 'rows');
      return out;
    }
    if (dimsArray.length === 3) {
      const [batch, rows, cols] = dimsArray;
      const out = [];
      // Assume batch=1, extract first batch
      for (let r = 0; r < rows; r += 1) {
        out.push(dataArray.slice(r * cols, (r + 1) * cols));
      }
      console.log('[tensorToArray] 3D result:', out.length, 'rows');
      return out;
    }
  }
  console.warn('[tensorToArray] fallback to empty array');
  return [];
};

const toJsArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.length === 'number') {
    return Array.from(value);
  }
  return [];
};

const computeMeanVector = (vectors) => {
  if (!Array.isArray(vectors) || vectors.length === 0) return [];
  const dim = vectors[0].length;
  const sum = new Array(dim).fill(0);
  vectors.forEach((vec) => {
    for (let i = 0; i < dim; i += 1) {
      sum[i] += vec[i];
    }
  });
  const mean = sum.map((val) => val / vectors.length);
  const norm = Math.sqrt(mean.reduce((acc, val) => acc + val * val, 0));
  return norm > 0 ? mean.map((val) => val / norm) : mean;
};

const getTokensAndOffsets = async (text) => {
  const tokenizer = await getTokenizer();
  console.log('[token-match] tokenizer loaded:', !!tokenizer);
  console.log('[token-match] tokenizer methods:', {
    hasEncode: !!tokenizer.encode,
    hasTokenize: !!tokenizer.tokenize,
    hasCall: !!tokenizer._call,
  });
  
  const safeText = typeof text === 'string' ? text : String(text ?? '');
  let tokens = [];
  let offsets = [];

  // Try direct call (some transformers.js tokenizers work this way)
  if (typeof tokenizer._call === 'function') {
    try {
      const result = await tokenizer._call(safeText);
      console.log('[token-match] _call result keys:', result ? Object.keys(result) : 'null');
      if (result?.input_ids) {
        const idsArray = toJsArray(result.input_ids);
        if (idsArray.length && tokenizer.model?.convert_ids_to_tokens) {
          tokens = tokenizer.model.convert_ids_to_tokens(idsArray);
        }
      }
      if (result?.offset_mapping) {
        offsets = toJsArray(result.offset_mapping);
      }
    } catch (err) {
      console.warn('[token-match] _call failed:', err.message);
    }
  }

  // Try encode
  if (!tokens.length && tokenizer.encode) {
    try {
      const encoding = await tokenizer.encode(safeText);
      console.log('[token-match] encode result:', encoding ? (typeof encoding === 'object' ? Object.keys(encoding) : typeof encoding) : 'null');
      
      if (typeof encoding === 'number' || Array.isArray(encoding)) {
        // Some tokenizers return just input_ids
        const idsArray = Array.isArray(encoding) ? encoding : [encoding];
        if (idsArray.length && tokenizer.model?.convert_ids_to_tokens) {
          tokens = tokenizer.model.convert_ids_to_tokens(idsArray);
        }
      } else if (encoding && typeof encoding === 'object') {
        if (Array.isArray(encoding.tokens) && encoding.tokens.length) {
          tokens = encoding.tokens;
        }
        if (!tokens.length && encoding.input_ids) {
          const idsArray = toJsArray(encoding.input_ids);
          if (idsArray.length && tokenizer.model?.convert_ids_to_tokens) {
            tokens = tokenizer.model.convert_ids_to_tokens(idsArray);
          }
        }
        if (encoding.offsets) offsets = toJsArray(encoding.offsets);
        if (!offsets.length && encoding.offsets_mapping) offsets = toJsArray(encoding.offsets_mapping);
        if (!offsets.length && encoding.offset_mapping) offsets = toJsArray(encoding.offset_mapping);
      }
    } catch (err) {
      console.warn('[token-match] encode failed:', err.message);
    }
  }

  // Try tokenize method
  if (!tokens.length && tokenizer.tokenize) {
    try {
      const tokenized = await tokenizer.tokenize(safeText);
      console.log('[token-match] tokenize result:', Array.isArray(tokenized) ? `array[${tokenized.length}]` : typeof tokenized);
      if (Array.isArray(tokenized)) {
        tokens = tokenized;
      }
    } catch (err) {
      console.warn('[token-match] tokenize failed:', err.message);
    }
  }

  return { tokens, offsets };
};

const alignTokenIndices = (sentence, word, tokens, offsets, tokenVectorsLength, targetPieces = []) => {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  const safeOffsets = Array.isArray(offsets) ? offsets : [];
  const safeTargetPieces = Array.isArray(targetPieces) ? targetPieces : [];
  console.log('[token-match] align inputs:', {
    tokensLength: safeTokens.length,
    offsetsLength: safeOffsets.length,
    targetPiecesLength: safeTargetPieces.length,
    sentenceLength: sentence.length,
  });
  const indices = [];
  const clean = (tok) => tok.replace(/^##/, '').replace(/^▁/, '').toLowerCase();
  const target = word.toLowerCase();
  const cleanedTokens = safeTokens.map(clean);
  const cleanedTargetPieces = safeTargetPieces.map(clean).filter(Boolean);

  // 0. Subword sequence match if tokenizer splits the word
  if (cleanedTargetPieces.length > 0) {
    for (let i = 0; i <= cleanedTokens.length - cleanedTargetPieces.length; i += 1) {
      let matches = true;
      for (let j = 0; j < cleanedTargetPieces.length; j += 1) {
        if (cleanedTokens[i + j] !== cleanedTargetPieces[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        indices.push(i);
        for (let j = 1; j < cleanedTargetPieces.length; j += 1) {
          indices.push(i + j);
        }
        break;
      }
    }
  }

  if (safeTokens.length) {
    safeTokens.forEach((tok, idx) => {
      const cleaned = cleanedTokens[idx];
      if (cleaned === target) {
        indices.push(idx);
      }
    });
  }

  if (!indices.length && safeOffsets.length === safeTokens.length && safeOffsets.length) {
    const lowerSentence = sentence.toLowerCase();
    safeOffsets.forEach((offsetPair, idx) => {
      const [start, end] = Array.isArray(offsetPair) ? offsetPair : [null, null];
      if (typeof start !== 'number' || typeof end !== 'number') return;
      const slice = lowerSentence.slice(start, end);
      if (slice === target) indices.push(idx);
    });
  }

  if (!indices.length) {
    const lowerSentence = sentence.toLowerCase();
    const pos = lowerSentence.indexOf(target);
    if (pos >= 0) {
      const denom = Math.max(1, lowerSentence.length);
      const ratio = pos / denom;
      if (safeTokens.length) {
        const estimate = Math.round(ratio * Math.max(0, safeTokens.length - 1));
        indices.push(Math.max(0, Math.min(safeTokens.length - 1, estimate)));
      }
    }
  }

  if (!indices.length) {
    console.warn('[token-match] token indices empty despite fallbacks.');
  }

  // Adjust for special tokens if necessary
  if (safeTokens.length && tokenVectorsLength - safeTokens.length === 2) {
    const adjusted = indices.map((idx) => idx + 1); // [CLS] at 0, real tokens start at 1
    console.log('[token-match] adjusted indices:', adjusted);
    return adjusted;
  }
  console.log('[token-match] matched indices:', indices);
  return indices;
};

const computeTokenEmbedding = async (sentence, word) => {
  const extractor = await getExtractor();
  const tokenVectorsRaw = await extractor(sentence, { pooling: 'none', normalize: false });
  const tokenVectors = tensorToArray(tokenVectorsRaw).map((vec) => toJsArray(vec));
  if (!Array.isArray(tokenVectors) || tokenVectors.length === 0) {
    throw new Error('token_vectors_unavailable');
  }

  const { tokens, offsets } = await getTokensAndOffsets(sentence);
  console.log('[token-match] tokens length:', Array.isArray(tokens) ? tokens.length : 'n/a');
  if (Array.isArray(tokens)) {
    console.log('[token-match] tokens preview:', tokens.slice(0, 16));
  }
  if (Array.isArray(offsets) && offsets.length) {
    console.log('[token-match] offsets preview:', offsets.slice(0, 5));
  }
  const tokenizer = await getTokenizer();
  let targetPieces = [];
  if (tokenizer?.tokenize) {
    try {
      const tokenized = await tokenizer.tokenize(word);
      if (Array.isArray(tokenized)) {
        targetPieces = tokenized;
      }
    } catch (err) {
      console.warn('[token-match] target tokenize failed:', err.message);
    }
  }
  const indices = alignTokenIndices(sentence, word, tokens, offsets, tokenVectors.length, targetPieces);

  if (!indices.length) {
    console.warn('[token-match] no indices found for word:', word);
    return { embedding: [], indices: [], tokens };
  }

  console.log('[token-match] extracting vectors for indices:', indices);
  console.log('[token-match] tokenVectors length:', tokenVectors.length);
  console.log('[token-match] tokenVectors[0] type:', tokenVectors[0] ? (Array.isArray(tokenVectors[0]) ? 'array' : typeof tokenVectors[0]) : 'null');
  
  const matchedVectors = indices
    .map((idx) => {
      const vec = tokenVectors[idx];
      console.log(`[token-match] vector[${idx}]:`, vec ? (Array.isArray(vec) ? `array[${vec.length}]` : typeof vec) : 'null');
      return vec;
    })
    .filter((vec) => Array.isArray(vec) && vec.length);

  console.log('[token-match] matchedVectors count:', matchedVectors.length);
  if (matchedVectors.length === 0) {
    console.warn('[token-match] no valid vectors extracted');
    return { embedding: [], indices, tokens };
  }

  const embedding = computeMeanVector(matchedVectors);
  console.log('[token-match] computed embedding length:', embedding.length);
  return { embedding, indices, tokens };
};

// --- Firestore initialisation ---
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'memorizewholetext';
initializeApp({
  credential: applicationDefault(),
  projectId,
});
const db = getFirestore();

const fetchWordDoc = async (lemma) => {
  if (!lemma) return null;
  const docRef = db.collection('words').doc(lemma.toLowerCase());
  const snap = await docRef.get();
  if (!snap.exists) return null;
  return snap.data();
};

const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const compareWithMeanings = (meanings, tokenEmbedding) => {
  if (!Array.isArray(meanings)) return [];
  return meanings
    .map((meaning, idx) => {
      const embedding = meaning?.embedding?.tokenEmbedding;
      if (Array.isArray(embedding) && embedding.length === tokenEmbedding.length) {
        const similarity = cosineSimilarity(tokenEmbedding, embedding);
        return {
          meaning,
          similarity,
          index: idx,
        };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity);
};

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (!allowedOrigins.length || allowedOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  return next();
});

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/token-match', async (req, res) => {
  try {
    const { sentence, word } = req.body || {};

    if (typeof sentence !== 'string' || !sentence.trim()) {
      return res.status(400).json({ error: 'invalid_sentence' });
    }
    if (typeof word !== 'string' || !word.trim()) {
      return res.status(400).json({ error: 'invalid_word' });
    }

    console.log('[token-match] Request:', { sentence, word });

    const result = await computeTokenEmbedding(sentence.trim(), word.trim());
    if (!result.embedding.length) {
      return res.status(200).json({
        matches: [],
        info: 'token_embedding_not_found',
        tokens: result.tokens,
        tokenIndices: result.indices,
        lemma: word.trim().toLowerCase(),
      });
    }

    const lemma = word.trim().toLowerCase();
    const wordDoc = await fetchWordDoc(lemma);

    if (!wordDoc?.meanings) {
      return res.status(200).json({
        tokenEmbedding: result.embedding,
        tokenIndices: result.indices,
        tokens: result.tokens,
        matches: [],
        lemma,
        info: 'word_not_found_in_firestore',
      });
    }

    const ranked = compareWithMeanings(wordDoc.meanings, result.embedding)
      .map((item) => ({
        similarity: item.similarity,
        meaning: item.meaning,
        meaningIndex: item.index,
      }));

    res.json({
      lemma,
      tokenEmbedding: result.embedding,
      tokenIndices: result.indices,
      tokens: result.tokens,
      matches: ranked,
      wordData: {
        word: wordDoc.word || lemma,
        meaningsCount: Array.isArray(wordDoc.meanings) ? wordDoc.meanings.length : 0,
        pos: wordDoc.pos || [],
      },
    });
  } catch (error) {
    console.error('Token match error:', error);
    res.status(500).json({ error: 'internal_error', details: String(error) });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`[token-matcher] Listening on port ${port}`);
});


