import { NextResponse } from 'next/server';

const ENDPOINT = 'https://israel-semigeometrical-malignly.ngrok-free.dev/api/chat';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Forward incoming Authorization or use fallback key
    const incomingAuth = req.headers.get('authorization');
    const fallbackKey = process.env.LLM_API_KEY || 'your-secret-key-1';
    const authHeader = incomingAuth || `Bearer ${fallbackKey}`;

    // Convert to AI server expected format
    // If client sends simple { "message": "..." }, convert to { "messages": [{ "role": "user", "content": "..." }] }
    // If client already sends proper format with "messages", use it as-is
    let requestBody: any;
    if (!body || Object.keys(body).length === 0) {
      // Default: empty payload -> use default message
      requestBody = {
        messages: [{ role: 'user', content: '안녕' }],
      };
    } else if ('message' in body && !('messages' in body)) {
      // Convert simple "message" field to "messages" array format
      requestBody = {
        ...body,
        messages: [{ role: 'user', content: body.message }],
      };
      delete requestBody.message;
    } else if (!('messages' in body)) {
      // If payload exists but no "messages" field, wrap content in messages array
      requestBody = {
        ...body,
        messages: [{ role: 'user', content: body.content || JSON.stringify(body) }],
      };
    } else {
      // Already has messages format, use as-is
      requestBody = body;
    }

    console.log('LLM API: Sending request to', ENDPOINT);
    console.log('LLM API: Request body:', requestBody);

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NextJS-Proxy/1.0',
        'Authorization': authHeader,
        'ngrok-skip-browser-warning': 'true',  // Skip ngrok browser warning page
      },
      body: JSON.stringify(requestBody),
    });

    console.log('LLM API: Response status:', res.status);
    const rawText = await res.text();
    console.log('LLM API: Raw response preview:', rawText.substring(0, 200));

    // Parse SSE (Server-Sent Events) format: data: {"content": "..."}
    let outputText = '';
    if (rawText && rawText.trim() !== '') {
      const lines = rawText.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Handle SSE format: data: {...}
        const dataMatch = trimmedLine.match(/^data:\s*(.+)$/);
        if (dataMatch) {
          const dataStr = dataMatch[1];

          // Check for [DONE] marker
          if (dataStr === '[DONE]') {
            break;
          }

          // Try to parse JSON
          try {
            const data = JSON.parse(dataStr);
            if (data && typeof data === 'object') {
              // Format: {"content": "..."}
              if (data.content && typeof data.content === 'string') {
                outputText += data.content;
              }
              // Alternative format: {"choices": [{"delta": {"content": "..."}}]}
              else if (data.choices?.[0]?.delta?.content) {
                outputText += data.choices[0].delta.content;
              }
              // Another alternative: {"choices": [{"message": {"content": "..."}}]}
              else if (data.choices?.[0]?.message?.content) {
                outputText += data.choices[0].message.content;
              }
            }
          } catch (e) {
            // Not valid JSON, skip this line
            continue;
          }
        } else if (!trimmedLine.startsWith('data:')) {
          // Not SSE format, treat as plain text (fallback)
          outputText += trimmedLine;
        }
      }

      // If no content was extracted, use raw response as fallback
      if (!outputText && rawText) {
        outputText = rawText;
      }
    }

    console.log('LLM API: Parsed output preview:', outputText.substring(0, 200));

    return new NextResponse(outputText, {
      status: res.status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    console.error('LLM API: Error:', e);
    return new NextResponse(
      `프록시 오류: ${e?.message || 'unknown error'}\n\nLLM 서버가 실행 중인지 확인해주세요.`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }
    );
  }
}
