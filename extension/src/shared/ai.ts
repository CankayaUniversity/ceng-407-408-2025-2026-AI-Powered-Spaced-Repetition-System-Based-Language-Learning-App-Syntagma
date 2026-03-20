import type { LearnerLevel } from './types';
import { getSettings } from './storage';

export interface AIRequest {
  type: 'explain-word' | 'explain-sentence' | 'translate-sentence';
  payload: Record<string, string>;
  stream: boolean;
  requestId: string;
}

function buildMessages(request: AIRequest): Array<{ role: string; content: string }> {
  const systemPrompt = `Sen Türkçe konuşan bir İngilizce öğrencisine yardım eden bir dil asistanısın.
Cevaplarını her zaman Türkçe ver. Kısa, net ve pratik ol.`;

  let userContent: string;

  if (request.type === 'explain-word') {
    const { word, sentence, context, level } = request.payload;
    userContent = `Kelime: "${word}"
Cümle: "${sentence}"
${context ? `Paragraf bağlamı: "${context}"` : ''}
Öğrenci seviyesi: ${level}

Lütfen şu formatta cevap ver:
**Türkçe anlamı (bu bağlamda):** ...
**Kelime türü (POS):** ...
**Kullanım notu:** ...
**Türk öğrencilerin sık yaptığı hata:** ...`;
  } else if (request.type === 'explain-sentence') {
    const { sentence, level } = request.payload;
    userContent = `Cümle: "${sentence}"
Öğrenci seviyesi: ${level}

Aşağıdaki şablona göre cevap ver:

**Cümle Parçaları:**
(her kelime grubunu ve işlevini listele)

**Türkçe Anlamı (bölüm bölüm):**
...

**Gramer Yapısı:**
(tense, aspect, voice, clause structure)

**Bu yapı neden kullanılmış?**
...

**Türk öğrenciler için ipuçları:**
...`;
  } else {
    const { sentence } = request.payload;
    userContent = `Şu İngilizce cümleyi Türkçeye çevir: "${sentence}"

Şu formatta ver:
**Doğal Türkçe çeviri:** ...
**Birebir çeviri:** ...
**Alternatif çeviri (varsa):** ...`;
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
}

export async function callAI(request: AIRequest): Promise<ReadableStream<string> | string> {
  const settings = await getSettings();
  const apiKey = settings.aiApiKey;

  if (!apiKey) {
    throw new Error('Coming soon');
  }

  const maxTokens = request.type === 'explain-sentence' ? 800 : 400;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Title': 'Syntagma',
    },
    body: JSON.stringify({
      model: settings.aiModel,
      max_tokens: maxTokens,
      stream: request.stream,
      messages: buildMessages(request),
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('AI quota reached. Please try again later.');
    }
    throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
  }

  if (!request.stream) {
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  // Return a readable stream of text chunks
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<string>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            controller.close();
            return;
          }
          try {
            const parsed = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> };
            const chunk = parsed.choices[0]?.delta?.content;
            if (chunk) {
              controller.enqueue(chunk);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}
