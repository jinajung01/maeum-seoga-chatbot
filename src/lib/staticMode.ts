// 서버 없이 배포한 경우(GitHub Pages) true
// - 책 추천: AI 대신 화면 안의 규칙 기반 추천 사용
// - 관리자 설정: 서버 대신 Firebase(Firestore)에 저장
export const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === 'true';
