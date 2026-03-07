# Form Hub

무료 양식과 공개 채용 지원서를 태그와 기관명으로 찾는 검색형 프로토타입입니다.

## 실행

```bash
npm start
```

개발 모드:

```bash
npm run dev
```

테스트:

```bash
npm test
```

기본 주소:

```text
http://localhost:4321
```

## 포함 범위
- 로컬 샘플 소스 수집
- 규칙 기반 태그 분류
- 태그 `AND/OR` 검색
- 기관명 복합 검색
- 목록/상세/운영 API
- 정적 HTML/CSS/JS UI

## 비포함
- 실제 외부 웹 크롤링
- PostgreSQL 연결
- OCR
- 인증

## 배포 메모
- 로컬 서버 진입점: `src/server.js`
- Vercel 함수 진입점: `api/`
- 배포 상세: [docs/form-hub-deploy.md](docs/form-hub-deploy.md)
