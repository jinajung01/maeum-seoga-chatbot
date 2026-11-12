import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { BOOKS_CATALOG, EMOTIONS, GENRES, EmotionType, GenreType } from './src/data/books.ts';
import { DEFAULT_AI_CONFIG } from './src/data/presets.ts';
import { AdminAiConfig } from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// In-memory admin AI configuration (persisted while server is running)
let currentAiConfig: AdminAiConfig = { ...DEFAULT_AI_CONFIG };

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Book catalog representation for prompt
const catalogText = BOOKS_CATALOG.map(
  (c) => `${c.id}|${c.emotion}|${c.genre}|${c.title}|${c.author}`
).join('\n');

const EXPERIENCE_EXAMPLES = [
  '시험 앞두고 잠이 안 와 -> 불안',
  '10년 키운 강아지를 떠나보냈어 -> 슬픔',
  '이사 왔는데 아는 사람이 하나도 없어 -> 외로움',
  '기다리던 합격 문자 받았어! -> 기쁨',
  '팀장이 내 기획안을 자기 이름으로 냈어 -> 분노',
  '야근만 3주째야 -> 지침',
  '내일 첫 데이트야 -> 설렘',
  '알람 끄고 하루 종일 누워만 있었어 -> 무기력',
].map((s) => `- ${s}`).join('\n');

function buildPrompt(
  text: string,
  history: Array<{ user: string; emotions: string[]; genre: string | null }> = [],
  shownIds: number[] = [],
  config: AdminAiConfig = currentAiConfig
): string {
  const past = history
    .slice(-6)
    .map(
      (h) =>
        `사용자: ${h.user}\n(파악: 감정=${h.emotions.join(',') || '없음'}, 장르=${h.genre || '없음'})`
    )
    .join('\n');

  const shownList = shownIds.join(', ');

  const reasonRequirement =
    config.reasonStyle === 'brief'
      ? '20~35자 내외의 아주 간결하고 핵심적인 한국어 존댓말 한 문장'
      : config.reasonStyle === 'deep'
      ? '70~110자 내외로 사연과 책의 가치를 깊이 있게 엮은 서정적 존댓말 문장'
      : '40~60자 내외의 공감과 메시지를 담은 다정한 한국어 존댓말';

  const crossEmotionRule = config.allowCrossEmotion
    ? '[소진 대처] 사용자 감정에 해당하는 책을 모두 이미 소개했거나 맞는 도서가 부족하다면, 사용자 상황에 맞는 다른 감정의 책으로 유연하게 채워줘.'
    : '[엄격 매칭] 사용자 감정에 부합하는 책으로만 선별해.';

  return `너의 사서 페르소나 및 핵심 지침:
${config.systemInstruction}

사용자 문장의 숨은 뜻(부정 표현, 비유, 겪은 일, 앞 대화 맥락)을 깊이 이해하여 감정과 원하는 장르를 파악하고, 아래 도서 목록에서만 책을 골라줘.

감정 분류: ${EMOTIONS.join(', ')}
장르 분류: ${GENRES.join(', ')}

[규칙]
1. 책은 반드시 아래 도서 목록의 id로만 골라야 해. 목록에 없는 가상의 책을 지어내면 절대 안 돼.
2. 추천은 최대 ${config.maxPicks}권까지. 사용자가 특정 장르(소설/에세이/인문·심리/자기계발)를 언급했으면 그 장르 책을 우선 골라줘.
3. [중복 금지] "이미 소개한 책 id"에 적힌 책은 제외해. 단, 감정은 그대로 두고 장르만 좁히는 경우(예: "소설로만 줘")에는 이미 소개한 책도 포함할 수 있으며 이때 genre_only를 true로 해.
4. ${crossEmotionRule}
5. "안 슬퍼", "외롭지 않아" 처럼 부정한 감정은 감정으로 분류하지 마.
6. [경험 기반 추론] 감정 낱말을 직접 말하지 않고 겪은 일이나 일상을 말해도 맥락에서 감정을 섬세하게 유추해.
예시:
${EXPERIENCE_EXAMPLES}
7. 사용자가 "(감정 고침)"을 요청한 경우, 사용자가 명시한 새로운 감정을 최우선으로 적용해.
8. [출력 필드 설명]
- understanding: 사용자의 기분과 상황을 사서의 다정한 존댓말로 공감하는 1~2문장. 겪은 일에서 감정을 파악했다면 어떤 맥락에서 그렇게 느꼈는지 자연스럽게 짚어줘.
- emotions: 파악된 감정 배열 (예: ["불안"])
- genre: 사용자가 원하는 장르가 있다면 해당 장르, 없으면 null
- genre_only: 감정은 유지하고 장르만 변경하는 요청인지 여부
- picks: 추천할 책 id와 사용자의 사연에 꼭 맞춘 다정한 추천 이유 (reason: ${reasonRequirement})
- question: 감정을 파악할 단서가 전혀 없거나 일상 인사인 경우 기분을 되묻는 다정한 질문 (책 추천이 있을 땐 null)
- note: 참고할 안내사항이 있을 경우 1문장, 없으면 null

도서 목록 (id|감정|장르|제목|저자):
${catalogText}

이미 소개한 책 id:
${shownList || '없음'}

이전 대화 맥락:
${past || '없음'}

이번 사용자 문장:
${text}`;
}

// Fallback rule-based matching if Gemini API is unreachable or key is not configured
function ruleBasedRecommend(
  text: string,
  shownIds: number[] = [],
  maxPicks: number = currentAiConfig.maxPicks
) {
  const shownSet = new Set(shownIds);
  let detectedEmotions: EmotionType[] = [];
  let detectedGenre: GenreType | null = null;

  for (const g of GENRES) {
    if (text.includes(g)) {
      detectedGenre = g;
      break;
    }
  }

  const keywordMap: Record<EmotionType, string[]> = {
    슬픔: ['슬프', '슬픔', '우울', '눈물', '상실', '이별', '헤어', '서러', '속상', '떠나보냈'],
    불안: ['불안', '걱정', '초조', '긴장', '두려', '무서', '잠이 안', '떨려', '공황'],
    외로움: ['외로', '고독', '쓸쓸', '혼자', '아는 사람', '고립', '친구 없'],
    기쁨: ['기쁨', '기뻐', '행복', '신나', '즐거', '좋아', '합격', '축하', '웃음'],
    분노: ['분노', '화나', '화가', '짜증', '억울', '열받', '답답', '부당'],
    지침: ['지침', '지쳐', '피곤', '번아웃', '야근', '힘들', '쉬고 싶', '탈진'],
    설렘: ['설렘', '설레', '두근', '데이트', '고백', '첫사랑', '짝사랑', '호감'],
    무기력: ['무기력', '의욕', '귀찮', '누워', '멍하', '막막', '아무것도', '의미 없'],
  };

  for (const [emo, keywords] of Object.entries(keywordMap) as [EmotionType, string[]][]) {
    if (keywords.some((kw) => text.includes(kw))) {
      detectedEmotions.push(emo);
    }
  }

  if (detectedEmotions.length === 0) {
    detectedEmotions = ['지침'];
  }

  const targetEmotion = detectedEmotions[0];
  const candidates = BOOKS_CATALOG.filter(
    (b) =>
      b.emotion === targetEmotion &&
      (!detectedGenre || b.genre === detectedGenre) &&
      !shownSet.has(b.id)
  );

  const fallbackPool = candidates.length >= maxPicks ? candidates : BOOKS_CATALOG.filter((b) => !shownSet.has(b.id));
  const picks = fallbackPool.slice(0, maxPicks).map((b) => ({
    id: b.id,
    reason: `${b.why} 지금 마음에 따뜻한 쉼표가 되어줄 거예요.`,
  }));

  return {
    emotions: detectedEmotions,
    genre: detectedGenre,
    genreOnly: false,
    understanding: `말씀해 주신 이야기에서 ${targetEmotion}의 마음이 느껴집니다. 그 마음에 머물며 읽기 좋은 책들을 골랐어요.`,
    question: null,
    note: null,
    picks,
  };
}

// ─────────── Admin Endpoints ───────────

// 1. Get current AI tuning configuration
app.get('/api/admin/config', (req, res) => {
  res.json({
    success: true,
    config: currentAiConfig,
    default: DEFAULT_AI_CONFIG,
    catalogTotal: BOOKS_CATALOG.length,
  });
});

// 2. Save updated AI tuning configuration
app.post('/api/admin/config', (req, res) => {
  try {
    const body = req.body || {};
    currentAiConfig = {
      personaPreset: body.personaPreset || currentAiConfig.personaPreset,
      systemInstruction: String(body.systemInstruction || currentAiConfig.systemInstruction).slice(0, 800),
      maxPicks: Math.min(5, Math.max(1, Number(body.maxPicks) || 3)),
      thinkingLevel: body.thinkingLevel === 'MEDIUM' ? 'MEDIUM' : 'LOW',
      reasonStyle: ['brief', 'balanced', 'deep'].includes(body.reasonStyle) ? body.reasonStyle : 'balanced',
      timeoutMs: Math.min(10000, Math.max(2500, Number(body.timeoutMs) || 4500)),
      allowCrossEmotion: Boolean(body.allowCrossEmotion ?? true),
    };
    res.json({ success: true, config: currentAiConfig });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '설정 저장에 실패했습니다.' });
  }
});

// 3. Reset AI tuning configuration to default
app.post('/api/admin/config/reset', (req, res) => {
  currentAiConfig = { ...DEFAULT_AI_CONFIG };
  res.json({ success: true, config: currentAiConfig });
});

// 4. Test playground simulation with specific draft config
app.post('/api/admin/test', async (req, res) => {
  const startTime = Date.now();
  try {
    const { message = '시험 앞두고 잠이 안 와', config = currentAiConfig } = req.body || {};
    const testConfig: AdminAiConfig = {
      ...currentAiConfig,
      ...config,
    };

    const targetMaxPicks = testConfig.maxPicks || 3;
    const prompt = buildPrompt(message, [], [], testConfig);

    if (apiKey) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT_EXCEEDED')), testConfig.timeoutMs || 4500)
        );

        const geminiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction: testConfig.systemInstruction,
            responseMimeType: 'application/json',
            thinkingConfig: {
              thinkingLevel: testConfig.thinkingLevel === 'MEDIUM' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
            },
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                emotions: { type: Type.ARRAY, items: { type: Type.STRING } },
                genre: { type: Type.STRING },
                genre_only: { type: Type.BOOLEAN },
                understanding: { type: Type.STRING },
                question: { type: Type.STRING },
                note: { type: Type.STRING },
                picks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      reason: { type: Type.STRING },
                    },
                    required: ['id', 'reason'],
                  },
                },
              },
              required: ['emotions', 'understanding', 'picks'],
            },
          },
        });

        const response = await Promise.race([geminiPromise, timeoutPromise]);
        const rawText = response.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          const enrichedPicks = (Array.isArray(parsed.picks) ? parsed.picks : [])
            .map((p: { id: number; reason?: string }) => ({
              id: p.id,
              reason: p.reason,
              book: BOOKS_CATALOG.find((b) => b.id === Number(p.id)),
            }))
            .filter((p: { book?: any }) => !!p.book)
            .slice(0, targetMaxPicks);

          return res.json({
            success: true,
            isAi: true,
            latencyMs: Date.now() - startTime,
            data: {
              emotions: parsed.emotions || [],
              genre: parsed.genre || null,
              understanding: parsed.understanding || '',
              picks: enrichedPicks,
              note: parsed.note || null,
            },
          });
        }
      } catch (geminiError: any) {
        // Fall through to fallback
      }
    }

    const fallback = ruleBasedRecommend(message, [], targetMaxPicks);
    const enrichedPicks = fallback.picks.map((p) => ({
      ...p,
      book: BOOKS_CATALOG.find((b) => b.id === p.id),
    }));

    return res.json({
      success: true,
      isAi: false,
      latencyMs: Date.now() - startTime,
      data: {
        ...fallback,
        picks: enrichedPicks,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '테스트 중 오류가 발생했습니다.' });
  }
});

// ─────────── User Recommendation Endpoint ───────────

app.post('/api/recommend', async (req, res) => {
  try {
    const { message, history = [], shownIds = [] } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: '메시지를 입력해 주세요.' });
    }

    const shownSet = new Set<number>(shownIds);
    const config = currentAiConfig;
    const targetMaxPicks = config.maxPicks || 3;

    // Call Gemini API if API key is present
    if (apiKey) {
      try {
        const prompt = buildPrompt(message, history, shownIds, config);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT_EXCEEDED')), config.timeoutMs || 4500)
        );

        const geminiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction: config.systemInstruction,
            responseMimeType: 'application/json',
            thinkingConfig: {
              thinkingLevel: config.thinkingLevel === 'MEDIUM' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
            },
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                emotions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '감정 목록 (슬픔, 불안, 외로움, 기쁨, 분노, 지침, 설렘, 무기력 중 선택)',
                },
                genre: {
                  type: Type.STRING,
                  description: '언급된 장르 (소설, 에세이, 인문·심리, 자기계발) 또는 null',
                },
                genre_only: {
                  type: Type.BOOLEAN,
                  description: '이전 감정을 유지하고 장르만 변경하는지 여부',
                },
                understanding: {
                  type: Type.STRING,
                  description: '사용자 상태와 맥락에 대한 사서의 따뜻한 공감 문장',
                },
                question: {
                  type: Type.STRING,
                  description: '감정 파악이 안 될 때 기분을 묻는 질문, 책이 추천되면 null',
                },
                note: {
                  type: Type.STRING,
                  description: '부가 설명 또는 null',
                },
                picks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER, description: '도서 id (1-72)' },
                      reason: { type: Type.STRING, description: '사연에 맞춤화된 추천 이유' },
                    },
                    required: ['id', 'reason'],
                  },
                  description: '추천 도서 목록 (최대 N권)',
                },
              },
              required: ['emotions', 'understanding', 'picks'],
            },
          },
        });

        const response = await Promise.race([geminiPromise, timeoutPromise]);
        const rawText = response.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);

          // Validate and enrich picks
          const emotions = (Array.isArray(parsed.emotions) ? parsed.emotions : []).filter(
            (e: string): e is EmotionType => (EMOTIONS as readonly string[]).includes(e)
          );
          const genre = (GENRES as readonly string[]).includes(parsed.genre)
            ? (parsed.genre as GenreType)
            : null;
          const genreOnly = parsed.genre_only === true && !!genre;

          const fitsGenre = (b: (typeof BOOKS_CATALOG)[0]) => !genre || b.genre === genre;

          // Check if books for this emotion are exhausted
          const exhausted = genreOnly
            ? []
            : emotions.filter((e: EmotionType) =>
                BOOKS_CATALOG.filter((c) => c.emotion === e && fitsGenre(c)).every((c) =>
                  shownSet.has(c.id)
                )
              );

          type PickItem = { id: number; book?: (typeof BOOKS_CATALOG)[0]; reason?: string };

          const used = new Set<number>();
          let picks: PickItem[] = (Array.isArray(parsed.picks) ? parsed.picks : [])
            .map((p: { id: number; reason?: string }) => {
              const book = BOOKS_CATALOG.find((c) => c.id === Number(p?.id));
              return { id: p?.id, book, reason: p?.reason };
            })
            .filter((p: PickItem) => {
              if (!p.book) return false;
              if (!fitsGenre(p.book)) return false;
              if (used.has(p.book.id)) return false;
              if (!genreOnly && shownSet.has(p.book.id)) return false;
              used.add(p.book.id);
              return true;
            })
            .slice(0, targetMaxPicks);

          // Supplement if needed and allowed
          if (config.allowCrossEmotion && emotions.length && picks.length < targetMaxPicks) {
            const free = (c: (typeof BOOKS_CATALOG)[0]) =>
              !used.has(c.id) && (genreOnly || !shownSet.has(c.id)) && fitsGenre(c);
            const add = (c: (typeof BOOKS_CATALOG)[0]) => {
              used.add(c.id);
              picks.push({ id: c.id, book: c, reason: c.why });
            };

            BOOKS_CATALOG.filter((c) => emotions.includes(c.emotion) && free(c)).forEach(
              (c) => picks.length < targetMaxPicks && add(c)
            );

            if (picks.length < targetMaxPicks && exhausted.length && !genre) {
              BOOKS_CATALOG.filter((c) => free(c)).forEach((c) => picks.length < targetMaxPicks && add(c));
            }
          }

          // Populate book data
          picks.forEach((p: PickItem) => {
            if (!p.book) {
              p.book = BOOKS_CATALOG.find((c) => c.id === p.id);
            }
          });

          return res.json({
            success: true,
            data: {
              emotions,
              genre,
              genreOnly,
              understanding: parsed.understanding || '말씀해 주신 감정에 귀 기울여 보았어요.',
              question: parsed.question || null,
              note: parsed.note || null,
              picks,
              exhausted,
            },
          });
        }
      } catch (geminiError: any) {
        // Fall through to fallback
      }
    }

    // Graceful fallback if Gemini is not responding or key is missing
    const fallbackResult = ruleBasedRecommend(message, shownIds, targetMaxPicks);
    const enrichedPicks = fallbackResult.picks.map((p) => ({
      ...p,
      book: BOOKS_CATALOG.find((c) => c.id === p.id),
    }));

    return res.json({
      success: true,
      isFallback: !apiKey,
      data: {
        ...fallbackResult,
        picks: enrichedPicks,
        exhausted: [],
      },
    });
  } catch (error: any) {
    console.error('Server error:', error);
    res.status(500).json({ success: false, error: '추천 도서를 가져오는 중 오류가 발생했습니다.' });
  }
});

// Setup Vite middleware or static serving
async function setupServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} on 0.0.0.0 (mode: ${isProduction ? 'production' : 'development'})`);
  });
}

setupServer();
