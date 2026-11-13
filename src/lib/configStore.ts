// 관리자 AI 설정을 Firebase(Firestore)의 ai_configs/current 문서에 저장·불러오기
// 서버가 없는 GitHub Pages 배포에서 관리자 설정을 유지하기 위해 사용한다.
// 저장 권한은 firestore.rules에서 admin_allowlist에 등록된 계정으로 제한한다.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_AI_CONFIG } from '../data/presets';
import { AdminAiConfig } from '../types';

const configRef = () => doc(db, 'ai_configs', 'current');

// 저장된 값이 없거나 일부 항목이 빠져 있으면 기본값으로 채운다
function normalize(data: Partial<AdminAiConfig> | undefined): AdminAiConfig {
  const merged = { ...DEFAULT_AI_CONFIG, ...(data || {}) };
  merged.maxPicks = Math.min(5, Math.max(1, Number(merged.maxPicks) || DEFAULT_AI_CONFIG.maxPicks));
  return merged;
}

export async function loadConfig(): Promise<AdminAiConfig> {
  try {
    const snap = await getDoc(configRef());
    return normalize(snap.exists() ? (snap.data() as Partial<AdminAiConfig>) : undefined);
  } catch (err) {
    console.warn('관리자 설정을 불러오지 못해 기본값을 사용합니다.', err);
    return { ...DEFAULT_AI_CONFIG };
  }
}

export async function saveConfig(config: AdminAiConfig): Promise<AdminAiConfig> {
  const clean = normalize(config);
  await setDoc(configRef(), { ...clean, updatedAt: serverTimestamp() });
  return clean;
}

// Firestore 권한 오류를 관리자에게 보여줄 문장으로 바꾼다
export function describeSaveError(err: any): string {
  if (err?.code === 'permission-denied') {
    return '이 계정에는 설정 저장 권한이 없습니다. Firebase 콘솔의 admin_allowlist에 관리자 이메일을 등록해 주세요.';
  }
  return err?.message || '설정 저장 중 오류가 발생했습니다.';
}
