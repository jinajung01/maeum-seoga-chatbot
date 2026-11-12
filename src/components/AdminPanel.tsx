import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Sparkles,
  BookOpen,
  Cpu,
  FlaskConical,
  RotateCcw,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Clock,
  Layers,
  ChevronRight,
  Check,
  Zap,
  Lock,
  ShieldCheck,
  LogOut,
  User as UserIcon,
  Loader2,
} from 'lucide-react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import { AdminAiConfig, PersonaPresetId, RecommendationResult } from '../types';
import { PERSONA_PRESETS, DEFAULT_AI_CONFIG } from '../data/presets';
import { BOOKS_CATALOG, EMOTIONS, GENRES, EmotionType } from '../data/books';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (newConfig: AdminAiConfig) => void;
}

export default function AdminPanel({ isOpen, onClose, onConfigChanged }: AdminPanelProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'persona' | 'params' | 'playground' | 'catalog'>('persona');
  const [config, setConfig] = useState<AdminAiConfig>(DEFAULT_AI_CONFIG);
  const [initialConfig, setInitialConfig] = useState<AdminAiConfig>(DEFAULT_AI_CONFIG);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Playground state
  const [testInput, setTestInput] = useState('야근만 3주째라 번아웃 온 것 같아');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    isAi?: boolean;
    latencyMs?: number;
    data?: RecommendationResult;
    error?: string;
  } | null>(null);

  // Catalog search
  const [catalogFilter, setCatalogFilter] = useState<EmotionType | '전체'>('전체');
  const [searchKeyword, setSearchKeyword] = useState('');

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
      if (user) {
        // Record admin document in Firestore
        setDoc(
          doc(db, 'admins', user.uid),
          {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLoginAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((err) => {
          console.warn('Could not record admin session to firestore:', err);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch current server config on open (only if signed in)
  useEffect(() => {
    if (isOpen && currentUser) {
      loadServerConfig();
    }
  }, [isOpen, currentUser]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Google Sign-in failed', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError('로그인 창이 닫혔습니다. 다시 시도해 주세요.');
      } else if (err?.code === 'auth/popup-blocked') {
        setAuthError('브라우저에서 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
      } else {
        setAuthError(err?.message || '구글 로그인 중 문제가 발생했습니다.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast('로그아웃되었습니다.');
    } catch (err) {
      console.error('Sign-out failed', err);
    }
  };

  const loadServerConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch('/api/admin/config');
      const json = await res.json();
      if (json.success && json.config) {
        setConfig(json.config);
        setInitialConfig(json.config);
      }
    } catch (err) {
      console.error('Failed to load admin config', err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.config);
        setInitialConfig(json.config);
        onConfigChanged?.(json.config);
        showToast('AI 설정이 저장되었습니다. 사용자 대화에 즉시 적용됩니다.');
      } else {
        alert(json.error || '저장에 실패했습니다.');
      }
    } catch (err) {
      console.error(err);
      alert('설정 저장 중 통신 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!window.confirm('모든 AI 설정을 초기 기본값으로 되돌리시겠습니까?')) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/config/reset', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setConfig(json.config);
        setInitialConfig(json.config);
        onConfigChanged?.(json.config);
        showToast('기본 권장 설정으로 초기화되었습니다.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3500);
  };

  const selectPersonaPreset = (presetId: PersonaPresetId) => {
    const found = PERSONA_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setConfig((prev) => ({
      ...prev,
      personaPreset: presetId,
      systemInstruction: found.systemInstruction,
      reasonStyle: found.reasonStyle,
      thinkingLevel: found.thinkingLevel,
    }));
  };

  const handleRunPlaygroundTest = async () => {
    if (!testInput.trim() || isTesting) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: testInput,
          config,
        }),
      });
      const json = await res.json();
      setTestResult(json);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err?.message || '테스트 중 오류가 발생했습니다.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  if (isAuthChecking) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-2xl">
          <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mb-3" />
          <p className="text-sm font-medium text-[var(--ink)]">관리자 인증 상태 확인 중...</p>
          <p className="text-xs text-[var(--muted)] mt-1">Google 계정 연결을 확인하고 있습니다.</p>
        </div>
      </div>
    );
  }

  // Google Sign-In Gate: prompt user to sign in before seeing admin settings
  if (!currentUser) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-md bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-[var(--ink)]">
          {/* Top modal header */}
          <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--panel)]/90">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
              <Lock className="w-4 h-4 text-[var(--accent)]" />
              <span>관리자 전용 보안 인증</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded-lg hover:bg-[var(--chip)] transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Gate Content */}
          <div className="p-6 sm:p-8 flex flex-col items-center text-center">
            {/* Lock / Google shield icon */}
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center mb-4 border border-[var(--accent)]/20 shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--chip)] text-[var(--ink)] text-[11px] font-semibold mb-3 border border-[var(--line)]">
              <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>마음 서가 AI 제어 콘솔</span>
            </div>

            <h3 className="font-display font-bold text-xl text-[var(--ink)] mb-2">
              관리자 Google 로그인
            </h3>
            <p className="text-xs text-[var(--muted)] leading-relaxed max-w-xs mb-6">
              AI 페르소나 설정, 프롬프트 튜닝, 추천 알고리즘 가중치는 인가된 관리자만 변경할 수 있습니다.
            </p>

            {authError && (
              <div className="w-full mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-xs flex items-start gap-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {/* Google Sign-in Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="w-full py-3 px-4 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 font-medium text-sm flex items-center justify-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-700 active:scale-98 transition-all shadow-sm cursor-pointer disabled:opacity-60"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                  <span>Google 인증 진행 중...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="font-semibold text-xs sm:text-sm">Google 계정으로 로그인</span>
                </>
              )}
            </button>

            {/* Bottom Security Info */}
            <div className="mt-6 pt-4 border-t border-[var(--line)] w-full flex items-center justify-between text-[11px] text-[var(--muted)]">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                Firebase 보안 세션
              </span>
              <button
                type="button"
                onClick={onClose}
                className="hover:text-[var(--ink)] cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isDirty = JSON.stringify(config) !== JSON.stringify(initialConfig);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[92vh] max-h-[850px] bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--ink)]">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--panel)]/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shadow-xs">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-lg leading-tight">서가 AI 관리자 콘솔</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  실시간 튜닝 모드
                </span>
              </div>
              <p className="text-xs text-[var(--muted)]">
                페르소나 프롬프트, 도서 추천 규칙, 추론 깊이 및 타임아웃을 세밀하게 제어합니다
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium hidden sm:inline">
                ● 저장되지 않은 변경사항
              </span>
            )}
            <button
              type="button"
              onClick={handleResetToDefault}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--line)] rounded-lg hover:bg-[var(--chip)] transition-colors flex items-center gap-1 cursor-pointer"
              title="권장 기본 설정으로 초기화"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>기본값 복원</span>
            </button>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-4 py-1.5 text-xs font-semibold bg-[var(--accent)] text-[var(--accent-ink)] rounded-lg hover:opacity-90 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? '적용 중...' : '설정 저장'}</span>
            </button>

            {/* Admin User Badge & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-[var(--line)]">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Admin'}
                  className="w-7 h-7 rounded-full border border-[var(--line)] object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-xs font-bold">
                  {(currentUser.email || 'A').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden md:flex flex-col text-left">
                <span className="text-[11px] font-medium leading-none text-[var(--ink)] max-w-[120px] truncate" title={currentUser.email || ''}>
                  {currentUser.displayName || currentUser.email}
                </span>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  ● 인증됨
                </span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-1.5 text-[var(--muted)] hover:text-red-500 rounded-lg hover:bg-[var(--chip)] transition-colors cursor-pointer"
                title="로그아웃"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded-lg hover:bg-[var(--chip)] transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 border-b border-[var(--line)] flex gap-1 bg-[var(--chip)]/30 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('persona')}
            className={`py-3 px-3.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'persona'
                ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>페르소나 & 시스템 프롬프트</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('params')}
            className={`py-3 px-3.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'params'
                ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>AI 추천 파라미터 미세 조정</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('playground')}
            className={`py-3 px-3.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'playground'
                ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            <span>실시간 테스트 샌드박스</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`py-3 px-3.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'catalog'
                ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>서가 도서 72권 현황</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {/* TAB 1: Persona & System Instruction */}
          {activeTab === 'persona' && (
            <div className="flex flex-col gap-6 max-w-3xl mx-auto">
              <div>
                <h3 className="font-display font-bold text-base text-[var(--ink)] mb-1">
                  1. 사서 페르소나 프리셋 선택
                </h3>
                <p className="text-xs text-[var(--muted)] mb-3">
                  원하는 서가의 분위기와 어조를 선택하면 시스템 지침과 추천 문체 스타일이 자동 동기화됩니다.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PERSONA_PRESETS.map((preset) => {
                    const isSelected = config.personaPreset === preset.id;
                    return (
                      <div
                        key={preset.id}
                        onClick={() => selectPersonaPreset(preset.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]'
                            : 'border-[var(--line)] bg-[var(--bot-bubble)] hover:border-[var(--accent)]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-display font-bold text-sm text-[var(--ink)]">
                            {preset.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--chip)] text-[var(--accent)] font-semibold">
                            {preset.badge}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--muted)] leading-relaxed">
                          {preset.description}
                        </p>
                        {isSelected && (
                          <div className="absolute top-2 right-2 text-[var(--accent)]">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* System Instruction Editor */}
              <div className="pt-4 border-t border-[var(--line)]">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-display font-bold text-base text-[var(--ink)]">
                      2. 시스템 지침 (System Instruction) 직접 편집
                    </h3>
                    <p className="text-xs text-[var(--muted)]">
                      Gemini 모델이 사용자에게 답변할 때 가장 먼저 준수해야 할 사서의 핵심 정체성과 규칙입니다.
                    </p>
                  </div>
                  <span className="text-xs text-[var(--muted)] font-mono">
                    {config.systemInstruction.length}/800자
                  </span>
                </div>

                <textarea
                  value={config.systemInstruction}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      personaPreset: 'custom',
                      systemInstruction: e.target.value.slice(0, 800),
                    }))
                  }
                  rows={4}
                  className="w-full p-3.5 text-xs bg-[var(--bot-bubble)] border border-[var(--line)] rounded-xl text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] font-sans leading-relaxed resize-none"
                  placeholder="AI 사서의 역할과 어조, 지침을 작성하세요..."
                />

                <div className="mt-2.5 p-3 rounded-lg bg-[var(--chip)]/50 text-[11px] text-[var(--muted)] flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div>
                    <strong>작성 팁:</strong> "해요체(존댓말) 사용", "사연의 감정을 1문장으로 먼저 공감", "가상의 책을 지어내지 않고 서가 목록의 책만 소개" 등의 규칙이 시스템 레벨에서 결합되어 전송됩니다.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI Recommendation Parameters */}
          {activeTab === 'params' && (
            <div className="flex flex-col gap-6 max-w-3xl mx-auto">
              {/* Pick count */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-display font-bold text-sm text-[var(--ink)] flex items-center gap-1.5">
                    <span>추천 도서 권수 (Max Picks)</span>
                    <span className="text-xs text-[var(--accent)] font-mono font-bold">
                      {config.maxPicks}권
                    </span>
                  </label>
                  <span className="text-xs text-[var(--muted)]">1권 ~ 5권 선택</span>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, maxPicks: num }))}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                        config.maxPicks === num
                          ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] shadow-xs'
                          : 'bg-[var(--bot-bubble)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--accent)]'
                      }`}
                    >
                      {num}권 {num === 3 && '(기본 권장)'}
                    </button>
                  ))}
                </div>
                <p className="text-[11.5px] text-[var(--muted)] mt-1.5">
                  한 번에 추천할 책의 개수를 지정합니다. 기본값은 3권이며 모바일 화면에 가장 쾌적합니다.
                </p>
              </div>

              {/* Thinking Level */}
              <div className="pt-4 border-t border-[var(--line)]">
                <label className="font-display font-bold text-sm text-[var(--ink)] flex items-center gap-2 mb-1.5">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>Gemini 3.8 Flash 추론 깊이 (Thinking Level)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setConfig((prev) => ({ ...prev, thinkingLevel: 'LOW' }))}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      config.thinkingLevel === 'LOW'
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]'
                        : 'border-[var(--line)] bg-[var(--bot-bubble)] hover:border-[var(--accent)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[var(--ink)]">Thinking Level: LOW (고속 응답)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                        기본 권장
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      불필요한 생각 연쇄를 최소화하여 1~2초 내의 초고속 응답을 반환합니다.
                    </p>
                  </div>

                  <div
                    onClick={() => setConfig((prev) => ({ ...prev, thinkingLevel: 'MEDIUM' }))}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      config.thinkingLevel === 'MEDIUM'
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]'
                        : 'border-[var(--line)] bg-[var(--bot-bubble)] hover:border-[var(--accent)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[var(--ink)]">Thinking Level: MEDIUM (심층 분석)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold">
                        심층 사유
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      복합적이고 긴 사연에 대해 감정의 맥락을 깊이 있게 곱씹어 추천을 도출합니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* Recommendation Reason Style */}
              <div className="pt-4 border-t border-[var(--line)]">
                <label className="font-display font-bold text-sm text-[var(--ink)] mb-1.5 block">
                  추천 사유 상세도 (Reason Length & Style)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'brief', title: '간결형', desc: '20~35자 내외의 핵심 요약' },
                    { id: 'balanced', title: '표준 공감형', desc: '40~60자 내외의 다정한 문장 (권장)' },
                    { id: 'deep', title: '심층 해설형', desc: '70~110자 내외의 사연 연계 해설' },
                  ].map((style) => (
                    <div
                      key={style.id}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          reasonStyle: style.id as any,
                        }))
                      }
                      className={`p-3 rounded-xl border cursor-pointer text-center transition-all ${
                        config.reasonStyle === style.id
                          ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]'
                          : 'border-[var(--line)] bg-[var(--bot-bubble)] hover:border-[var(--accent)]/50'
                      }`}
                    >
                      <div className="text-xs font-bold text-[var(--ink)] mb-0.5">{style.title}</div>
                      <div className="text-[10.5px] text-[var(--muted)]">{style.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeout & Cross-emotion */}
              <div className="pt-4 border-t border-[var(--line)] grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Fast Timeout */}
                <div className="p-3.5 bg-[var(--bot-bubble)] border border-[var(--line)] rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>응답 타임아웃 제한</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-[var(--accent)]">
                      {(config.timeoutMs / 1000).toFixed(1)}초
                    </span>
                  </div>
                  <input
                    type="range"
                    min="3000"
                    max="10000"
                    step="500"
                    value={config.timeoutMs}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, timeoutMs: Number(e.target.value) }))
                    }
                    className="w-full accent-[var(--accent)] cursor-pointer mt-2"
                  />
                  <p className="text-[11px] text-[var(--muted)] mt-1.5">
                    Gemini 서버가 지정 시간 내에 응답하지 못할 경우, 즉시 서가 규칙 엔진으로 자동 전환하여 멈춤을 방지합니다.
                  </p>
                </div>

                {/* Cross-emotion */}
                <div className="p-3.5 bg-[var(--bot-bubble)] border border-[var(--line)] rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>감정 확장 추천 허용</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={config.allowCrossEmotion}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, allowCrossEmotion: e.target.checked }))
                      }
                      className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                    />
                  </div>
                  <p className="text-[11px] text-[var(--muted)] mt-2 leading-relaxed">
                    선택한 감정의 책을 모두 소개했거나 복합 감정인 경우, 상황에 도움이 될 만한 다른 감정의 책으로 유연하게 확장 추천합니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Playground Sandbox */}
          {activeTab === 'playground' && (
            <div className="flex flex-col gap-5 max-w-3xl mx-auto">
              <div className="bg-[var(--chip)]/30 border border-[var(--line)] p-4 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display font-bold text-sm text-[var(--ink)] flex items-center gap-1.5">
                    <FlaskConical className="w-4 h-4 text-[var(--accent)]" />
                    <span>실시간 프롬프트 테스트 (Playground)</span>
                  </h3>
                  <span className="text-xs text-[var(--muted)]">
                    현재 편집 중인 설정으로 가상 질의를 실행합니다
                  </span>
                </div>

                {/* Sample Prompt Quick Chips */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  <span className="text-[11px] text-[var(--muted)] mr-1 self-center">샘플 입력:</span>
                  {[
                    '야근만 3주째라 번아웃 온 것 같아',
                    '시험 앞두고 너무 긴장돼서 손이 떨려',
                    '이사 왔는데 아는 사람이 아무도 없어',
                    '하나도 안 슬픈데 그냥 심심해',
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setTestInput(sample)}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-[var(--panel)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                    >
                      {sample}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder="테스트할 사용자의 사연이나 기분을 입력하세요..."
                    className="flex-1 bg-[var(--panel)] text-[var(--ink)] border border-[var(--line)] rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={handleRunPlaygroundTest}
                    disabled={isTesting || !testInput.trim()}
                    className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-ink)] text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                  >
                    <span>{isTesting ? '테스트 실행 중...' : '테스트 실행'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Test Results Output */}
              {isTesting && (
                <div className="p-8 border border-[var(--line)] rounded-xl flex flex-col items-center justify-center gap-2 bg-[var(--bot-bubble)]">
                  <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-[var(--muted)]">
                    설정된 프롬프트와 파라미터로 도서를 선별하고 있습니다...
                  </p>
                </div>
              )}

              {testResult && !isTesting && (
                <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[var(--ink)]">테스트 응답 결과</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          testResult.isAi
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {testResult.isAi ? 'Gemini 3.8 Flash 연동' : '고속 서가 엔진'}
                      </span>
                    </div>
                    {testResult.latencyMs && (
                      <span className="text-xs font-mono text-[var(--muted)] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{testResult.latencyMs}ms</span>
                      </span>
                    )}
                  </div>

                  {testResult.error ? (
                    <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{testResult.error}</span>
                    </div>
                  ) : testResult.data ? (
                    <div className="flex flex-col gap-3">
                      {/* Understood box */}
                      <div className="p-3 rounded-lg bg-[var(--chip)]/40 border border-[var(--line)]">
                        <span className="text-[11px] font-bold text-[var(--accent)] block mb-0.5">
                          AI가 이해한 공감 문장:
                        </span>
                        <p className="text-xs font-medium text-[var(--ink)] leading-relaxed">
                          {testResult.data.understanding}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-[11px] text-[var(--muted)]">
                          <span>감정: <b>{testResult.data.emotions.join(', ') || '복합'}</b></span>
                          <span>·</span>
                          <span>장르: <b>{testResult.data.genre || '지정 안 함'}</b></span>
                        </div>
                      </div>

                      {/* Picks list */}
                      <div>
                        <span className="text-xs font-bold text-[var(--muted)] block mb-2">
                          추천 도서 ({testResult.data.picks.length}권):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {testResult.data.picks.map((pick, i) => (
                            <div
                              key={pick.id || i}
                              className="p-3 bg-[var(--bot-bubble)] border border-[var(--line)] rounded-lg text-xs"
                            >
                              <div className="text-[10px] text-[var(--accent)] font-semibold">
                                #{i + 1} · {pick.book?.emotion} · {pick.book?.genre}
                              </div>
                              <h5 className="font-display font-bold text-sm text-[var(--ink)] mt-0.5">
                                『{pick.book?.title}』
                              </h5>
                              <p className="text-[11px] text-[var(--muted)] mb-1">{pick.book?.author}</p>
                              <p className="text-xs text-[var(--ink)] bg-[var(--panel)] p-2 rounded border border-[var(--line)]/50 leading-relaxed">
                                {pick.reason || pick.book?.why}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Catalog stats */}
          {activeTab === 'catalog' && (
            <div className="flex flex-col gap-4 max-w-3xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-base text-[var(--ink)]">
                    마음 서가 72권 도서 아카이브
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    8대 감정별 각 9권씩 균등하게 구성되어 AI의 정확한 추천 풀로 동작합니다
                  </p>
                </div>
                <div className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-[var(--chip)] text-[var(--accent)] border border-[var(--line)]">
                  총 72권 정선
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <button
                  type="button"
                  onClick={() => setCatalogFilter('전체')}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                    catalogFilter === '전체'
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'bg-[var(--bot-bubble)] text-[var(--ink)] border border-[var(--line)]'
                  }`}
                >
                  전체 (72)
                </button>
                {EMOTIONS.map((emo) => (
                  <button
                    key={emo}
                    type="button"
                    onClick={() => setCatalogFilter(emo)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                      catalogFilter === emo
                        ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                        : 'bg-[var(--bot-bubble)] text-[var(--ink)] border border-[var(--line)]'
                    }`}
                  >
                    {emo} (9)
                  </button>
                ))}
              </div>

              {/* Search */}
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="도서명 또는 작가명으로 검색..."
                className="w-full bg-[var(--bot-bubble)] text-[var(--ink)] border border-[var(--line)] rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
              />

              {/* Book cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {BOOKS_CATALOG.filter(
                  (b) =>
                    (catalogFilter === '전체' || b.emotion === catalogFilter) &&
                    (!searchKeyword ||
                      b.title.includes(searchKeyword) ||
                      b.author.includes(searchKeyword))
                ).map((b) => (
                  <div
                    key={b.id}
                    className="p-3 rounded-lg border border-[var(--line)] bg-[var(--bot-bubble)] flex flex-col justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
                        <span className="font-semibold text-[var(--accent)]">
                          #{b.id} · {b.emotion}
                        </span>
                        <span>{b.genre}</span>
                      </div>
                      <h5 className="font-display font-bold text-sm text-[var(--ink)] mt-0.5">
                        『{b.title}』
                      </h5>
                      <div className="text-[11px] text-[var(--muted)] mb-1">{b.author}</div>
                      <p className="text-[11.5px] text-[var(--ink)] line-clamp-2 leading-relaxed">
                        {b.why}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Toast Alert */}
        {saveToast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-emerald-800 text-white text-xs font-semibold rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>{saveToast}</span>
          </div>
        )}
      </div>
    </div>
  );
}
