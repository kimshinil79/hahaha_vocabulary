// API 설정 파일
export const API_CONFIG = {
  // Gemini API 키
  GEMINI_API_KEY: 'AIzaSyAi-Zojk2xgpXE1P0Lgybgb93D_zCB8fVw',
  
  // 사용할 Gemini 모델
  GEMINI_MODEL: 'gemini-2.5-flash',
  
  // Google Translate API 키
  GOOGLE_TRANSLATE_API_KEY: 'AIzaSyDy1t9mJ-pGfLOHXihLTKmMoGr52nM19oE',
  
  // API 엔드포인트
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  GOOGLE_TRANSLATE_API_URL: 'https://translation.googleapis.com/language/translate/v2',
  
  // Free Dictionary API (무료 영영사전, API 키 불필요)
  DICTIONARY_API_URL: 'https://api.dictionaryapi.dev/api/v2/entries/en',
} as const;
