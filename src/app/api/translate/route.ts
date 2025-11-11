import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/api-config';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, source = 'en', target = 'ko' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: '텍스트가 필요합니다.' },
        { status: 400 }
      );
    }

    // API 키 확인
    if (!API_CONFIG.GOOGLE_TRANSLATE_API_KEY) {
      console.error('Google Translate API 키가 설정되지 않았습니다.');
      return NextResponse.json(
        { error: '번역 API 키가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    console.log('번역 요청:', { text: text.substring(0, 50), source, target });

    // Google Translate API 호출
    const apiUrl = `${API_CONFIG.GOOGLE_TRANSLATE_API_URL}?key=${API_CONFIG.GOOGLE_TRANSLATE_API_KEY}`;
    console.log('Google Translate API 호출:', apiUrl.replace(/key=[^&]+/, 'key=***'));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: [text],
        source: source,
        target: target,
        format: 'text',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Translate API 오류:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return NextResponse.json(
        { error: `번역 실패: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Google Translate API 응답:', {
      hasData: !!data,
      hasTranslations: !!data?.data?.translations,
      translationCount: data?.data?.translations?.length || 0,
    });

    const translated = data?.data?.translations?.[0]?.translatedText;

    if (!translated) {
      console.error('번역 결과를 찾을 수 없습니다:', data);
      return NextResponse.json(
        { error: '번역 결과를 찾을 수 없습니다.', receivedData: data },
        { status: 500 }
      );
    }

    // HTML 엔티티 디코딩
    const decodeHtmlEntities = (text: string): string => {
      if (!text) return text;
      const entities: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
        '&#x2F;': '/',
        '&#96;': '`',
      };
      return text.replace(
        /&(?:amp|lt|gt|quot|#39|#x27|#x2F|#96);/g,
        (match) => entities[match] || match
      );
    };

    const decodedText = decodeHtmlEntities(translated).trim();
    console.log('번역 완료:', { original: text.substring(0, 50), translated: decodedText.substring(0, 50) });

    return NextResponse.json({
      translatedText: decodedText,
    });
  } catch (error) {
    console.error('번역 API 라우트 오류:', error);
    return NextResponse.json(
      {
        error: '번역 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

