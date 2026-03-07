# Form Hub 배포 가이드

## 1. 현재 배포 방식
- 로컬 실행은 `src/server.js`를 사용한다.
- Vercel 배포는 `/api/*` 함수와 `public/` 정적 파일을 사용한다.
- 두 경로는 같은 서비스 컨테이너 `src/app-context.js`를 공유한다.

## 2. 실행 명령

```bash
npm start
npm test
npm run reset-state
```

## 3. 상태 저장 정책
- 로컬:
  - `data/state/form-hub-state.json`
- Vercel:
  - `/tmp/form-hub-state.json`

주의:
- Vercel의 `/tmp` 저장소는 영구 저장이 아니다.
- 현재 배포는 프로토타입이므로 수집 상태와 수동 재실행 결과는 인스턴스 재시작 시 초기화될 수 있다.

## 4. Vercel 배포 전제
- Node.js 런타임에서 `api/` 폴더 함수를 실행한다.
- `/api/v1/documents/:documentId`는 `vercel.json` rewrite를 통해 함수로 연결한다.
- 정적 UI는 `public/index.html`, `public/app.js`, `public/styles.css`를 그대로 서빙한다.

## 5. GitHub 릴리즈 체크리스트
- 테스트 통과
- 로컬 서버 기동 확인
- 검색/상세/운영 API 응답 확인
- README 최신화
- 배포 가이드 최신화

## 6. 현재 한계
- 외부 웹 실크롤링 미적용
- PostgreSQL 미연결
- Vercel에서는 상태 파일이 영구 저장되지 않음
- 실서비스 전환 시 DB와 큐/스케줄러 분리가 필요함
