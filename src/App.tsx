/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Send,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  Library,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  ExternalLink,
  X,
  Heart,
  ChevronRight,
  Info,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import AdminPanel from './components/AdminPanel';
import {
  BOOKS_CATALOG,
  EMOTIONS,
  GENRES,
  SAMPLE_PROMPTS,
  STORES,
  BookItem,
  EmotionType,
  GenreType,
} from './data/books';
import { ChatMessage, RecommendationResult } from './types';
import { ruleBasedRecommend } from './lib/ruleBasedRecommend';
import { STATIC_MODE } from './lib/staticMode';
import { loadConfig } from './lib/configStore';
import { DEFAULT_AI_CONFIG } from './data/presets';

const PERIODS = [
  { id: 'dawn', label: '새벽', icon: Moon, desc: '차분한 새벽 공기' },
  { id: 'morning', label: '아침', icon: Sunrise, desc: '화사한 아침 햇살' },
  { id: 'day', label: '낮', icon: Sun, desc: '나른하고 맑은 오후' },
  { id: 'night', label: '밤', icon: Sunset, desc: '깊고 아늑한 밤' },
] as const;

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shownBookIds, setShownBookIds] = useState<number[]>([]);
  const [savedBooks, setSavedBooks] = useState<BookItem[]>(() => {
    try {
      const cached = localStorage.getItem('maum_saved_books');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // Time-of-day theme state
  const [timePreviewIdx, setTimePreviewIdx] = useState<number>(-1);
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // Modals
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<EmotionType | '전체'>('전체');

  // 정적 모드: 관리자가 Firebase에 저장한 추천 권수를 불러와 추천에 반영
  const [maxPicks, setMaxPicks] = useState<number>(DEFAULT_AI_CONFIG.maxPicks);
  useEffect(() => {
    if (STATIC_MODE) {
      loadConfig().then((c) => setMaxPicks(c.maxPicks));
    }
  }, []);

  // Track conversation state for API
  const [lastUserText, setLastUserText] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Time cycle calculation
  const getNaturalPeriodIndex = (hour: number) => {
    if (hour < 6) return 0; // dawn
    if (hour < 11) return 1; // morning
    if (hour < 18) return 2; // day
    return 3; // night
  };

  const updateTimeTheme = () => {
    const now = new Date();
    const naturalIdx = getNaturalPeriodIndex(now.getHours());
    const activeIdx = timePreviewIdx >= 0 ? timePreviewIdx : naturalIdx;
    const period = PERIODS[activeIdx];

    document.documentElement.setAttribute('data-time', period.id);

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setCurrentTimeStr(
      timePreviewIdx >= 0 ? `${period.label} · 미리보기` : `${period.label} · ${hh}:${mm}`
    );
  };

  useEffect(() => {
    updateTimeTheme();
    const timer = setInterval(updateTimeTheme, 60000);
    return () => clearInterval(timer);
  }, [timePreviewIdx]);

  // Persist saved books
  useEffect(() => {
    try {
      localStorage.setItem('maum_saved_books', JSON.stringify(savedBooks));
    } catch (e) {
      console.error(e);
    }
  }, [savedBooks]);

  // Initialize welcoming chat message
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        sender: 'bot',
        text: STATIC_MODE
          ? `안녕하세요! **마음 서가**에 오신 것을 환영합니다.\n\n들려주신 문장 속 감정 표현을 찾아, 정선된 72권의 책 중에서 지금 내 마음에 와닿을 책을 골라드려요.\n\n오늘 있었던 일이나 기분, 고민을 편하게 들려주세요. 장르를 덧붙여도 좋고, 이미 소개해 드린 책은 다시 추천하지 않아요.`
          : `안녕하세요! **마음 서가**에 오신 것을 환영합니다.\n\n구글 **Gemini 3.8 Flash** AI가 문장의 숨은 뜻과 일상 맥락을 이해해서, 정선된 72권의 책 중에서 지금 내 마음에 가장 와닿는 책을 골라드려요.\n\n오늘 있었던 일이나 기분, 고민을 편하게 들려주세요. 장르를 덧붙여도 좋고, 이전 대화나 이미 소개해 드린 책도 기억합니다.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const toggleSaveBook = (book: BookItem) => {
    setSavedBooks((prev) => {
      const exists = prev.some((b) => b.id === book.id);
      if (exists) {
        return prev.filter((b) => b.id !== book.id);
      }
      return [...prev, book];
    });
  };

  const isBookSaved = (bookId: number) => savedBooks.some((b) => b.id === bookId);

  // Send message to Gemini recommendation backend
  const handleSendMessage = async (textToSend?: string) => {
    const userText = (textToSend ?? inputValue).trim();
    if (!userText || isLoading) return;

    setInputValue('');
    setLastUserText(userText);

    // Append user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Build conversation history for API by pairing user messages with recommendation results
      const historyPayload: Array<{ user: string; emotions: string[]; genre: string | null }> = [];
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].sender === 'user' && messages[i + 1]?.recommendation) {
          historyPayload.push({
            user: messages[i].text || '',
            emotions: messages[i + 1].recommendation?.emotions || [],
            genre: messages[i + 1].recommendation?.genre || null,
          });
        }
      }

      let json: { success: boolean; data?: RecommendationResult };

      if (STATIC_MODE) {
        // 서버가 없으므로 화면 안에서 바로 추천
        const local = ruleBasedRecommend(userText, shownBookIds, maxPicks);
        json = {
          success: true,
          data: {
            ...local,
            picks: local.picks.map((p) => ({ ...p, book: BOOKS_CATALOG.find((c) => c.id === p.id) })),
          },
        };
      } else {
        const controller = new AbortController();
        const fetchTimer = setTimeout(() => controller.abort(), 9000);

        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: userText,
            history: historyPayload.slice(-4),
            shownIds: shownBookIds,
            lastUserText,
          }),
        });

        clearTimeout(fetchTimer);
        json = await res.json();
      }

      if (json.success && json.data) {
        const result: RecommendationResult = json.data;

        // Collect new book IDs to prevent repeats
        if (result.picks && result.picks.length > 0) {
          const newIds = result.picks.map((p) => p.id);
          setShownBookIds((prev) => Array.from(new Set([...prev, ...newIds])));
        }

        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          recommendation: result,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, botMsg]);
      } else {
        // Fallback recommendations if server returns error
        const fallbackBooks = BOOKS_CATALOG.filter((b) => !shownBookIds.includes(b.id)).slice(0, 3);
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          recommendation: {
            emotions: ['지침'],
            genre: null,
            understanding: '말씀해 주신 상황을 가만히 헤아려보았어요. 지금 마음에 조용한 위로가 될 만한 책들을 골랐습니다.',
            picks: fallbackBooks.map((b) => ({
              id: b.id,
              book: b,
              reason: `${b.why} 천천히 읽으며 숨을 고르기 좋아요.`,
            })),
          },
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (err: any) {
      console.warn('Network or timeout issue, using instant book catalog response:', err);
      // Emergency client-side recommendation so user is never left without response
      const shownSet = new Set(shownBookIds);
      const available = BOOKS_CATALOG.filter((b) => !shownSet.has(b.id));
      const pool = available.length >= 3 ? available : BOOKS_CATALOG;
      const clientPicks = pool.slice(0, 3);
      setShownBookIds((prev) => Array.from(new Set([...prev, ...clientPicks.map((b) => b.id)])));

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        recommendation: {
          emotions: [clientPicks[0]?.emotion || '지침'],
          genre: null,
          understanding: '말씀해 주신 마음에 귀 기울여 보았어요. 서가에서 지금 곁에 두기 좋은 책들을 골랐습니다.',
          picks: clientPicks.map((b) => ({
            id: b.id,
            book: b,
            reason: `${b.why} 마음에 따뜻한 쉼표가 되어줄 책이에요.`,
          })),
        },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleFixEmotion = (emotion: EmotionType) => {
    const prompt = `(감정 고침) 내 감정은 ${emotion}이야. 직전에 말한 "${lastUserText || '상황'}"을 ${emotion} 기준으로 다시 추천해줘`;
    handleSendMessage(prompt);
  };

  const handleResetConversation = () => {
    setShownBookIds([]);
    setLastUserText('');
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'bot',
        text: `서가를 정돈했습니다. 새로운 마음이나 상황을 들려주시면, 다시 책 3권을 골라드릴게요.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const cycleTimePreview = () => {
    setTimePreviewIdx((prev) => (prev >= PERIODS.length - 1 ? -1 : prev + 1));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 md:p-6 transition-colors duration-500">
      {/* Main App Container */}
      <div className="w-full max-w-[620px] h-[94vh] max-h-[880px] flex flex-col rounded-2xl border border-[var(--line)] shadow-xl overflow-hidden bg-gradient-to-b from-[var(--sky1)] to-[var(--sky2)] transition-all duration-500 backdrop-blur-sm">
        {/* Header */}
        <header className="px-5 py-3.5 border-b border-[var(--line)] flex items-center gap-3 backdrop-blur-md bg-[var(--panel)]/40 z-10">
          <div className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center font-display font-bold text-lg shadow-sm shrink-0">
            책
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg text-[var(--ink)] tracking-tight">
                마음 서가
              </h1>
              {/* AI 모델 표시: AI 없이 동작하는 정적 배포(GitHub Pages)에서는 숨김 */}
              {!STATIC_MODE && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--chip)] text-[var(--accent)] border border-[var(--line)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Gemini 3.8 Flash
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--muted)] truncate">
              지금 감정과 일상을 들려주면 책 3권을 골라드려요
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Time-of-day switcher */}
            <button
              type="button"
              onClick={cycleTimePreview}
              className="text-xs px-2.5 py-1.5 rounded-full bg-[var(--chip)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)] transition-colors flex items-center gap-1 cursor-pointer font-medium"
              title="시간대별 서가 분위기 변경 (새벽/아침/낮/밤)"
            >
              {(() => {
                const now = new Date();
                const naturalIdx = getNaturalPeriodIndex(now.getHours());
                const activeIdx = timePreviewIdx >= 0 ? timePreviewIdx : naturalIdx;
                const Icon = PERIODS[activeIdx].icon;
                return <Icon className="w-3.5 h-3.5 text-[var(--muted)]" />;
              })()}
              <span className="tabular-nums">{currentTimeStr}</span>
            </button>

            {/* Saved Books Drawer Button */}
            <button
              type="button"
              onClick={() => setIsSavedOpen(true)}
              className="p-1.5 rounded-full bg-[var(--chip)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)] transition-colors relative cursor-pointer"
              title="내가 찜한 책갈피 보기"
            >
              <Bookmark className="w-4 h-4 text-[var(--accent)]" />
              {savedBooks.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] text-[10px] flex items-center justify-center font-bold">
                  {savedBooks.length}
                </span>
              )}
            </button>

            {/* Catalog list modal */}
            <button
              type="button"
              onClick={() => setIsCatalogOpen(true)}
              className="p-1.5 rounded-full bg-[var(--chip)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)] transition-colors cursor-pointer"
              title="72권 전체 서가 목록 둘러보기"
            >
              <Library className="w-4 h-4 text-[var(--muted)]" />
            </button>

            {/* Admin fine-tuning modal */}
            <button
              type="button"
              onClick={() => setIsAdminOpen(true)}
              className="p-1.5 rounded-full bg-[var(--chip)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              title="서가 AI 기능 세밀 조정 (관리자 콘솔)"
            >
              <Sliders className="w-4 h-4 text-[var(--muted)]" />
            </button>

            {/* Reset conversation */}
            <button
              type="button"
              onClick={handleResetConversation}
              className="p-1.5 rounded-full bg-[var(--chip)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)] transition-colors cursor-pointer"
              title="대화 새로 시작"
            >
              <RefreshCw className="w-4 h-4 text-[var(--muted)]" />
            </button>
          </div>
        </header>

        {/* Chat Thread */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 custom-scrollbar">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'bot' && (
                <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center font-display font-bold text-xs shrink-0 mt-1 shadow-xs">
                  책
                </div>
              )}

              <div
                className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-3 leading-relaxed text-sm break-words ${
                  msg.sender === 'user'
                    ? 'bg-[var(--user-bubble)] text-white rounded-br-xs shadow-sm font-medium'
                    : 'bg-[var(--bot-bubble)] text-[var(--ink)] rounded-bl-xs shadow-xs border border-[var(--line)]/40'
                }`}
              >
                {/* Standard Bot or User Text */}
                {msg.text && (
                  <div className="whitespace-pre-line text-[14px]">
                    {msg.text.split('**').map((part, i) =>
                      i % 2 === 1 ? (
                        <strong key={i} className="font-semibold text-[var(--accent)]">
                          {part}
                        </strong>
                      ) : (
                        part
                      )
                    )}
                  </div>
                )}

                {/* Initial Welcome Quick Prompts */}
                {msg.id.startsWith('welcome') && (
                  <div className="mt-4 pt-3 border-t border-[var(--line)]/50">
                    <p className="text-xs text-[var(--muted)] mb-2 font-medium">
                      이런 문장으로 대화를 시작해 보세요:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SAMPLE_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => handleSendMessage(prompt)}
                          className="text-xs px-3 py-1.5 rounded-full bg-[var(--chip)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors text-left cursor-pointer"
                        >
                          "{prompt}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Recommendation Result Block */}
                {msg.recommendation && (
                  <div className="flex flex-col gap-3">
                    {/* 1. Understood block */}
                    <div className="border-l-3 border-[var(--ai)] pl-3 py-0.5 bg-[var(--ai)]/5 rounded-r-md">
                      <span className="block text-[11px] font-bold text-[var(--ai)] tracking-wider">
                        AI가 이해한 내용
                      </span>
                      <p className="text-[13.5px] mt-0.5 text-[var(--ink)] font-medium">
                        {msg.recommendation.understanding}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-[var(--muted)]">
                        <span>
                          감정: <b className="text-[var(--ink)]">{msg.recommendation.emotions.join(', ') || '복합적 감정'}</b>
                        </span>
                        <span>·</span>
                        <span>
                          장르: <b className="text-[var(--ink)]">{msg.recommendation.genre || '지정 안 함'}</b>
                        </span>
                      </div>
                    </div>

                    {/* Notice if exhausted */}
                    {msg.recommendation.exhausted && msg.recommendation.exhausted.length > 0 && (
                      <div className="text-xs text-[var(--ai)] bg-[var(--ai)]/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {msg.recommendation.exhausted.join(', ')} 책은 이 대화에서 모두 소개해
                          드려서, 비슷한 다른 감정의 좋은 책들을 골랐어요.
                        </span>
                      </div>
                    )}

                    {/* Additional Note */}
                    {msg.recommendation.note && (
                      <p className="text-xs text-[var(--muted)] bg-[var(--panel)]/50 px-2.5 py-1 rounded-md">
                        {msg.recommendation.note}
                      </p>
                    )}

                    {/* 2. Book Cards */}
                    {msg.recommendation.picks && msg.recommendation.picks.length > 0 ? (
                      <div className="flex flex-col gap-2.5 mt-1">
                        {msg.recommendation.picks.map((pick, idx) => {
                          const book = pick.book || BOOKS_CATALOG.find((b) => b.id === pick.id);
                          if (!book) return null;
                          const saved = isBookSaved(book.id);

                          return (
                            <div
                              key={`${book.id}-${idx}`}
                              className="relative flex gap-3 p-3 bg-[var(--panel)] border border-[var(--line)] rounded-xl shadow-xs overflow-hidden transition-all hover:border-[var(--accent)]/60"
                            >
                              {/* Book Spine accent */}
                              <div className="w-1.5 self-stretch bg-[var(--spine)] rounded-full shrink-0" />

                              <div className="flex-1 min-w-0 pr-6">
                                <div className="text-[11px] text-[var(--muted)] font-medium tracking-wide">
                                  추천 {idx + 1} · {book.emotion} · {book.genre}
                                </div>
                                <h3 className="font-display font-bold text-base text-[var(--ink)] mt-0.5 leading-snug">
                                  『{book.title}』
                                </h3>
                                <div className="text-xs text-[var(--muted)] mt-0.5">
                                  {book.author}
                                </div>
                                <p className="text-[13px] text-[var(--ink)] mt-2 leading-relaxed bg-[var(--chip)]/40 p-2 rounded-lg">
                                  {pick.reason || book.why}
                                </p>

                                {/* Store links */}
                                <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-[var(--line)]/50 text-[11px]">
                                  <span className="text-[var(--muted)] font-medium">사러 가기</span>
                                  {STORES.map((store) => (
                                    <a
                                      key={store.name}
                                      href={`${store.url}${encodeURIComponent(book.title)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-colors flex items-center gap-0.5 font-medium"
                                    >
                                      {store.name}
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  ))}
                                </div>
                              </div>

                              {/* Bookmark button */}
                              <button
                                type="button"
                                onClick={() => toggleSaveBook(book)}
                                className={`absolute top-2.5 right-2.5 p-1.5 rounded-full transition-colors cursor-pointer ${
                                  saved
                                    ? 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                                    : 'text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--chip)]'
                                }`}
                                title={saved ? '책갈피 해제' : '내 책갈피에 저장'}
                              >
                                {saved ? (
                                  <BookmarkCheck className="w-4 h-4 fill-rose-500 text-rose-500" />
                                ) : (
                                  <Bookmark className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm mt-1">{msg.recommendation.question || '어떤 기분인지 조금 더 구체적으로 들려주세요.'}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {EMOTIONS.map((emo) => (
                            <button
                              key={emo}
                              type="button"
                              onClick={() => handleSendMessage(emo)}
                              className="text-xs px-2.5 py-1 rounded-full bg-[var(--chip)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)]"
                            >
                              {emo}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Action Chips */}
                    {msg.recommendation.picks && msg.recommendation.picks.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleSendMessage('다른 책도 알려줘')}
                          className="text-xs px-3 py-1.5 rounded-full bg-[var(--chip)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <RefreshCw className="w-3 h-3 text-[var(--accent)]" />
                          다른 책도 알려줘
                        </button>

                        {/* Emotion correction trigger */}
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[11px] text-[var(--muted)] ml-1">
                            감정이 다른가요?
                          </span>
                          {EMOTIONS.filter(
                            (e) => !msg.recommendation?.emotions.includes(e)
                          ).slice(0, 4).map((emo) => (
                            <button
                              key={emo}
                              type="button"
                              onClick={() => handleFixEmotion(emo)}
                              className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--panel)] text-[var(--muted)] border border-[var(--line)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                            >
                              {emo}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center font-display font-bold text-xs shrink-0 mt-1 shadow-xs">
                책
              </div>
              <div className="bg-[var(--bot-bubble)] border border-[var(--line)]/50 rounded-2xl rounded-bl-xs px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1 items-center">
                  <span className="w-2 h-2 rounded-full bg-[var(--muted)] typing-dot-1" />
                  <span className="w-2 h-2 rounded-full bg-[var(--muted)] typing-dot-2" />
                  <span className="w-2 h-2 rounded-full bg-[var(--muted)] typing-dot-3" />
                </div>
                <span className="text-xs text-[var(--muted)] font-medium">
                  {STATIC_MODE ? '문장의 감정을 읽고 서가를 찾는 중...' : 'Gemini AI가 문장의 감정을 읽고 서가를 찾는 중...'}
                </span>
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Input Dock */}
        <div className="p-3 sm:p-4 border-t border-[var(--line)] bg-[var(--panel)]/70 backdrop-blur-md">
          {/* Quick Emotion Shortcuts */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-1 text-xs no-scrollbar">
            <span className="text-[11px] text-[var(--muted)] shrink-0 font-medium">빠른 감정:</span>
            {EMOTIONS.map((emo) => (
              <button
                key={emo}
                type="button"
                onClick={() => handleSendMessage(`${emo}을 느껴`)}
                className="px-2.5 py-1 rounded-full bg-[var(--chip)]/70 text-[var(--ink)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-colors shrink-0 text-xs font-medium cursor-pointer"
              >
                {emo}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="예: 하나도 안 슬픈데 그냥 심심해, 야근 때문에 지쳐..."
              disabled={isLoading}
              className="flex-1 bg-[var(--panel)] text-[var(--ink)] border border-[var(--line)] rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all placeholder:text-[var(--muted)]/70"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="px-5 py-2.5 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] font-semibold text-sm hover:opacity-90 active:scale-98 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>보내기</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Bookmarks Drawer Modal */}
      {isSavedOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-md h-full bg-[var(--panel)] border-l border-[var(--line)] shadow-2xl flex flex-col p-5 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
              <div className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-[var(--accent)]" />
                <h2 className="font-display font-bold text-lg text-[var(--ink)]">
                  내 책갈피 ({savedBooks.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSavedOpen(false)}
                className="p-1 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--chip)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3 custom-scrollbar">
              {savedBooks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--muted)]">
                  <Bookmark className="w-10 h-10 opacity-30 mb-2 stroke-1" />
                  <p className="font-display font-medium text-base text-[var(--ink)]">
                    저장된 책이 없어요
                  </p>
                  <p className="text-xs mt-1">
                    추천된 책 카드 우측 상단의 책갈피 아이콘을 누르면 이곳에 보관됩니다.
                  </p>
                </div>
              ) : (
                savedBooks.map((book) => (
                  <div
                    key={book.id}
                    className="p-3.5 bg-[var(--bot-bubble)] border border-[var(--line)] rounded-xl relative group"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[11px] font-medium text-[var(--accent)] bg-[var(--chip)] px-2 py-0.5 rounded-full">
                          {book.emotion} · {book.genre}
                        </span>
                        <h4 className="font-display font-bold text-base text-[var(--ink)] mt-1.5">
                          『{book.title}』
                        </h4>
                        <p className="text-xs text-[var(--muted)]">{book.author}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSaveBook(book)}
                        className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                        title="책갈피에서 삭제"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-[var(--ink)] mt-2 leading-relaxed bg-[var(--panel)] p-2 rounded-lg border border-[var(--line)]/50">
                      {book.why}
                    </p>

                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-[var(--line)]/40 text-[11px]">
                      <span className="text-[var(--muted)]">구매처:</span>
                      {STORES.map((store) => (
                        <a
                          key={store.name}
                          href={`${store.url}${encodeURIComponent(book.title)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
                        >
                          {store.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Catalog Modal */}
      {isCatalogOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85vh] bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[var(--line)] flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-lg text-[var(--ink)] flex items-center gap-2">
                  <Library className="w-5 h-5 text-[var(--accent)]" />
                  마음 서가 72권 컬렉션
                </h2>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  8가지 감정과 4가지 장르로 정선된 도서 컬렉션
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCatalogOpen(false)}
                className="p-1 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--chip)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Pills */}
            <div className="px-5 py-2.5 bg-[var(--chip)]/40 border-b border-[var(--line)] flex gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setCatalogFilter('전체')}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                  catalogFilter === '전체'
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                    : 'bg-[var(--panel)] text-[var(--ink)] border border-[var(--line)]'
                }`}
              >
                전체 (72)
              </button>
              {EMOTIONS.map((emo) => (
                <button
                  key={emo}
                  type="button"
                  onClick={() => setCatalogFilter(emo)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors cursor-pointer shrink-0 ${
                    catalogFilter === emo
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'bg-[var(--panel)] text-[var(--ink)] border border-[var(--line)]'
                  }`}
                >
                  {emo} (9)
                </button>
              ))}
            </div>

            {/* Books Grid */}
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 custom-scrollbar">
              {BOOKS_CATALOG.filter(
                (b) => catalogFilter === '전체' || b.emotion === catalogFilter
              ).map((book) => (
                <div
                  key={book.id}
                  className="p-3 bg-[var(--bot-bubble)] border border-[var(--line)] rounded-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <span className="font-semibold text-[var(--accent)]">
                        #{book.id} · {book.emotion}
                      </span>
                      <span>{book.genre}</span>
                    </div>
                    <h4 className="font-display font-bold text-sm text-[var(--ink)] mt-1">
                      『{book.title}』
                    </h4>
                    <p className="text-xs text-[var(--muted)]">{book.author}</p>
                    <p className="text-xs text-[var(--ink)] mt-1.5 line-clamp-2 leading-relaxed">
                      {book.why}
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[var(--line)]/50 flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCatalogOpen(false);
                        handleSendMessage(`『${book.title}』 같은 책 추천해줘`);
                      }}
                      className="text-[var(--accent)] font-medium hover:underline cursor-pointer"
                    >
                      이 책과 대화하기 →
                    </button>
                    <div className="flex gap-1">
                      {STORES.map((s) => (
                        <a
                          key={s.name}
                          href={`${s.url}${encodeURIComponent(book.title)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--panel)] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--accent)]"
                        >
                          {s.name}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Admin Fine-tuning Console Modal */}
      <AdminPanel
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onConfigChanged={(c) => setMaxPicks(c.maxPicks)}
      />
    </div>
  );
}
