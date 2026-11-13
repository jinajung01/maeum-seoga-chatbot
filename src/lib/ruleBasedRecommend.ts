// 규칙 기반 책 추천 (AI 없이 키워드로 감정을 찾아 책을 고른다)
// - 서버: Gemini 키가 없거나 응답이 없을 때 대신 사용
// - 화면: GitHub Pages처럼 서버가 없는 곳에 배포했을 때 사용
import { BOOKS_CATALOG, GENRES, EmotionType, GenreType } from '../data/books.ts';

// Fallback rule-based matching if Gemini API is unreachable or key is not configured
export function ruleBasedRecommend(
  text: string,
  shownIds: number[] = [],
  maxPicks: number = 3
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
