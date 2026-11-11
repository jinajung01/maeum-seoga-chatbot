import { BookItem, EmotionType, GenreType } from './data/books';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text?: string;
  recommendation?: RecommendationResult;
  timestamp: string;
}

export interface RecommendationPick {
  id: number;
  reason?: string;
  book?: BookItem;
}

export interface RecommendationResult {
  emotions: EmotionType[];
  genre: GenreType | null;
  genreOnly?: boolean;
  understanding: string;
  question?: string | null;
  note?: string | null;
  picks: RecommendationPick[];
  exhausted?: EmotionType[];
}

export interface ApiRecommendRequest {
  message: string;
  history?: Array<{
    user: string;
    emotions: string[];
    genre: string | null;
  }>;
  shownIds?: number[];
  lastUserText?: string;
}

export interface ApiRecommendResponse {
  success: boolean;
  data?: RecommendationResult;
  error?: string;
  isFallback?: boolean;
}
