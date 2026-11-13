// Vercel 배포용 빌드 스크립트 (Vercel Build Output API 형식으로 결과물을 만든다)
//
// - React 화면: vite build 결과(dist)를 .vercel/output/static 으로 복사 → CDN에서 바로 제공
// - 서버(server.ts): esbuild로 파일 하나로 묶어 .vercel/output/functions/api.func 에 넣음
//   → /api/* 요청을 처리하는 서버 함수가 된다 (Gemini API 키는 여기서만 쓰여 화면에 노출되지 않음)
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });

// 1) 화면 파일
cpSync('dist', `${out}/static`, { recursive: true });

// 2) 서버 함수
const funcDir = `${out}/functions/api.func`;
mkdirSync(funcDir, { recursive: true });
await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: `${funcDir}/index.mjs`,
  external: ['vite'], // 개발 모드에서만 쓰므로 묶지 않음
  // express 같은 CommonJS 패키지가 require()를 쓸 수 있게 해 줌
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
writeFileSync(
  `${funcDir}/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs' }, null, 2)
);

// 3) 주소 연결 규칙: /api/* → 서버 함수, 그 외 없는 주소 → index.html (화면 앱)
writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/api/(.*)', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2
  )
);

console.log('Vercel 빌드 결과물 생성 완료:', out);
