// API 설정 파일
const requiredEnv = (value: string | undefined, envName: string) => {
  if (!value) {
    throw new Error(`환경 변수 ${envName}가 설정되지 않았습니다.`);
  }
  return value;
};

export const API_CONFIG = {
  // Gemini API 키
  GEMINI_API_KEY: requiredEnv(process.env.NEXT_PUBLIC_GEMINI_API_KEY, 'NEXT_PUBLIC_GEMINI_API_KEY'),

  // 사용할 Gemini 모델
  GEMINI_MODEL: process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash',

  // Google Translate API 키
  GOOGLE_TRANSLATE_API_KEY: requiredEnv(process.env.NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY, 'NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY'),

  // API 엔드포인트
  GEMINI_API_URL: process.env.NEXT_PUBLIC_GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  GOOGLE_TRANSLATE_API_URL: process.env.NEXT_PUBLIC_GOOGLE_TRANSLATE_API_URL || 'https://translation.googleapis.com/language/translate/v2',

  // Free Dictionary API (무료 영영사전, API 키 불필요)
  DICTIONARY_API_URL: 'https://api.dictionaryapi.dev/api/v2/entries/en',
} as const;
