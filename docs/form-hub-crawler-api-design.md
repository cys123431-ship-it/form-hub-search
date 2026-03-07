# Form Hub 크롤러/분류기/검색 API 구조 설계

## 1. 목적
- `form-hub` MVP의 수집, 분류, 검색, 운영 기능을 어떤 서비스 경계와 인터페이스로 구현할지 정의한다.
- 본 설계는 [form-hub-mvp-spec.md](/home/joseph/바탕화면/개발/form-hub/docs/form-hub-mvp-spec.md), [form-hub-db-schema.md](/home/joseph/바탕화면/개발/form-hub/docs/form-hub-db-schema.md), `/home/joseph/바탕화면/개발/first.md`를 기준으로 한다.
- 4단계 프로토타입에서 바로 구현 가능한 구조를 먼저 고정한다.

## 2. 기술 방향

### 2.1 운영 목표 구조
- 백엔드는 `Node.js 22` 단일 서비스 구조로 설계한다.
- 저장소는 운영 시 `PostgreSQL`, 프로토타입에서는 `JSON 파일 저장소`를 사용한다.
- 크롤링, 분류, 검색 API는 프로세스를 분리하지 않고 하나의 앱 내부 모듈로 시작한다.
- 이유:
  - 초기 복잡도를 낮출 수 있다.
  - `first.md`의 유지보수성과 관심사 분리 요구를 지키기 쉽다.
  - 프로토타입과 운영 구조의 인터페이스를 최대한 공유할 수 있다.

### 2.2 프로토타입 제약
- 현재 단계에서는 별도 패키지 설치 승인을 받지 않았으므로 `zero-dependency Node.js`를 기본 전제로 둔다.
- 4단계 프로토타입은 다음만 구현 대상으로 본다.
  - 로컬 샘플 소스 수집
  - 규칙 기반 태그 분류
  - 키워드/태그/기관 검색 API
  - 브라우저에서 보는 목록/상세 UI

## 3. 시스템 구성

```text
Browser UI
  -> HTTP API
    -> Search Service
    -> Admin Service
    -> Crawl Service
    -> Classification Service
      -> Repository Layer
        -> Json Repository (prototype)
        -> Postgres Repository (future)

Background Scheduler
  -> Crawl Service
  -> Classification Service
```

핵심 원칙:
- UI는 API만 호출하고 크롤링 로직을 직접 알지 않는다.
- 크롤러는 DB 스키마를 직접 몰라도 되고, 저장은 Repository 인터페이스를 통해서만 한다.
- 분류기는 순수 함수 중심으로 작성하고 I/O는 서비스 계층에서만 처리한다.

## 4. 제안 프로젝트 구조

```text
form-hub/
├── docs/
├── data/
│   ├── samples/
│   └── state/
├── public/
├── src/
│   ├── api/
│   │   ├── controllers/
│   │   ├── routes/
│   │   └── serializers/
│   ├── config/
│   ├── domain/
│   │   ├── models/
│   │   ├── enums/
│   │   └── schemas/
│   ├── repositories/
│   │   ├── interfaces/
│   │   ├── json/
│   │   └── postgres/
│   ├── services/
│   │   ├── crawl/
│   │   ├── classify/
│   │   ├── search/
│   │   └── admin/
│   ├── workers/
│   ├── utils/
│   └── server.js
```

구조 메모:
- 프로토타입은 `repositories/json`만 구현한다.
- 운영 전환 시 `repositories/postgres`를 추가하고 서비스 코드는 그대로 유지한다.

## 5. 크롤러 구조

### 5.1 책임 분리
- `SourceRegistry`: 활성 소스 조회
- `CrawlScheduler`: 실행 시점 결정
- `CrawlRunner`: 소스 하나의 전체 실행 단위 관리
- `SourceAdapter`: 소스별 목록/상세 파싱
- `OccurrenceWriter`: 수집 결과 저장과 dedup 연결

### 5.2 실행 흐름
1. `CrawlScheduler`가 수집 가능한 `source_sites`를 조회한다.
2. 각 소스에 대해 `CrawlRunner`가 `crawl_runs`를 생성한다.
3. `SourceAdapter.fetchCandidates()`가 수집 후보를 반환한다.
4. 각 후보를 `SourceAdapter.fetchDetail()`로 파싱한다.
5. `DedupResolver`가 `canonical_url`, `attachment_hash`, `content_hash`를 기준으로 대표 문서를 찾는다.
6. `OccurrenceWriter`가 `documents`, `document_occurrences`, `document_contents`, `document_assets`를 저장한다.
7. 완료 후 `ClassificationService.enqueueOrRun()`을 호출한다.
8. 결과를 `crawl_run_items`와 `crawl_runs`에 기록한다.

### 5.3 크롤러 인터페이스

```js
/**
 * @typedef {Object} CrawlCandidate
 * @property {string} pageUrl
 * @property {string | null} sourceItemKey
 * @property {string | null} publishedAt
 */

/**
 * @typedef {Object} ParsedOccurrence
 * @property {string} sourceTitle
 * @property {string} pageUrl
 * @property {string | null} canonicalUrl
 * @property {string | null} bodyText
 * @property {string | null} bodyHtml
 * @property {string[]} organizationHints
 * @property {Array<{ url: string, fileName: string | null, fileType: string | null }>} assets
 * @property {string | null} publishedAt
 */
```

```js
class SourceAdapter {
  async fetchCandidates(sourceConfig, context) {}
  async fetchDetail(candidate, sourceConfig, context) {}
}
```

### 5.4 프로토타입 지원 어댑터
- `mockDocumentFeedAdapter`
- `mockRecruitmentFeedAdapter`
- `manualJsonSourceAdapter`

이유:
- 실제 웹 크롤링보다 먼저 구조 검증이 가능하다.
- 약관/차단 이슈 없이 API, dedup, 분류 흐름을 검증할 수 있다.

### 5.5 실패 처리
- 요청마다 `request_timeout_ms`를 적용한다.
- 네트워크 오류는 최대 2회 재시도한다.
- 한 후보의 실패는 `crawl_run_items`에만 기록하고 전체 실행을 중단하지 않는다.
- 정책 위반 소스는 실행 전 `blocked_policy`로 종료한다.

## 6. 분류기 구조

### 6.1 책임 분리
- `TextNormalizer`: 공백/특수문자/대소문자 정규화
- `OrganizationResolver`: 기관명과 별칭 매칭
- `RuleBasedTagger`: 태그 규칙 평가
- `RecruitmentProfileExtractor`: 채용 관련 메타 추출
- `SummaryBuilder`: 목록용 요약 생성
- `ClassificationWriter`: 결과 저장

### 6.2 실행 흐름
1. 최신 `document_occurrences`와 `document_contents`를 읽는다.
2. 본문과 제목을 정규화한다.
3. `organizations`와 `organization_aliases`를 기준으로 기관 후보를 찾는다.
4. `tag_keyword_rules`를 평가해 태그 점수를 계산한다.
5. 점수 상위 태그를 `document_tags`에 저장한다.
6. 채용 신호가 있으면 `recruitment_profiles`를 업데이트한다.
7. `representative_summary`, `search_text`, `quality_score`, `review_status`를 갱신한다.

### 6.3 규칙 기반 분류 정책
- 제목 일치 가중치를 본문 일치보다 높게 둔다.
- 기관명 + `자소서`, `지원서`, `입사지원` 조합은 채용 문서 점수를 올린다.
- `근로계약`, `퇴직`, `동의서`, `이력서` 같은 강한 키워드는 문서 유형 태그에 높은 점수를 준다.
- 태그 점수가 임계값 미만이면 `review_status = pending_review`로 둔다.

### 6.4 핵심 함수 계약

```js
function normalizeSearchText(rawText) {}
function resolveOrganizations(text, organizations) {}
function scoreTagRules({ title, content, organizationMatches, rules }) {}
function buildSummary({ title, content }) {}
function deriveReviewStatus({ qualityScore, tagCount, extractionStatus }) {}
```

### 6.5 프로토타입 제한
- OCR 미지원
- LLM 분류 미지원
- 날짜 추출은 단순 패턴 기반만 지원

## 7. 검색 서비스 구조

### 7.1 책임 분리
- `SearchQueryParser`: Query/Filter 검증
- `SearchRepository`: 문서 검색
- `FacetService`: 태그/기관 집계
- `SearchRanker`: 관련도 계산
- `DocumentDetailService`: 상세 조회 조립

### 7.2 검색 입력 계약
- `query`: 자유 키워드
- `tagSlugs[]`: 태그 목록
- `tagMode`: `and | or`
- `organization`: 기관명 또는 별칭
- `recruitmentKind`: 채용 유형
- `fileType`: `pdf`, `docx`, `hwpx`, `html`
- `sort`: `relevance | latest | sourceTrust`
- `page`, `pageSize`

### 7.3 검색 처리 흐름
1. 입력 검증과 정규화
2. 태그 필터와 기관 필터 적용
3. 제목/요약/검색 텍스트에서 키워드 매칭
4. 기본 관련도 점수 계산
5. 명시적 정렬 기준 적용
6. 목록 응답 직렬화

### 7.4 관련도 기본 정책
- 정확한 기관 매치: +50
- 문서 유형 태그 매치: +30
- 제목 키워드 매치: +20
- 요약/본문 키워드 매치: +10
- 최신성 보정: +0~10
- 대표 출처 `trust_score`: +0~10

### 7.5 Facet 정책
- 검색 결과 기준으로 태그 개수와 기관 개수를 함께 돌려준다.
- 태그 Facet은 `document_type`, `domain`, `employment_type` 우선으로 노출한다.

## 8. HTTP API 설계

### 8.1 공개 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/health` | 서버 상태 확인 |
| `GET` | `/api/v1/search` | 문서 검색 |
| `GET` | `/api/v1/documents/:documentId` | 문서 상세 조회 |
| `GET` | `/api/v1/tags` | 태그 목록 |
| `GET` | `/api/v1/organizations` | 기관 자동완성 |

### 8.2 운영 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/v1/admin/sources` | 소스 목록 |
| `POST` | `/api/v1/admin/crawl-runs` | 수동 수집 실행 |
| `GET` | `/api/v1/admin/crawl-runs` | 수집 실행 이력 |
| `GET` | `/api/v1/admin/review-queue` | 검수 대기 문서 |

### 8.3 `GET /api/v1/search`
쿼리 파라미터:
- `query`
- `tagSlugs`
- `tagMode`
- `organization`
- `sort`
- `page`
- `pageSize`

응답 shape:

```json
{
  "items": [
    {
      "id": "doc_123",
      "title": "산업은행 2026 상반기 입사지원서",
      "summary": "공개 채용 지원서와 자기소개서 양식 요약",
      "tags": ["자소서", "채용", "공기업"],
      "organizations": ["산업은행"],
      "publishedAt": "2026-03-01T00:00:00Z",
      "fileTypes": ["pdf"],
      "previewAvailable": true,
      "primarySource": {
        "name": "산업은행 채용공고",
        "url": "https://example.com/job/1",
        "trustScore": 0.95
      }
    }
  ],
  "page": { "current": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 },
  "facets": {
    "tags": [{ "slug": "cover-letter", "name": "자소서", "count": 1 }],
    "organizations": [{ "name": "산업은행", "count": 1 }]
  }
}
```

### 8.4 `GET /api/v1/documents/:documentId`
반환 항목:
- 대표 제목/요약
- 태그 목록
- 기관 목록
- 출처 목록
- 첨부 메타데이터
- 미리보기 텍스트
- 채용 메타데이터

### 8.5 입력 검증 규칙
- `pageSize` 최대값은 50
- `tagMode`는 `and`, `or`만 허용
- `sort`는 정의된 enum만 허용
- ID 파라미터는 UUID 또는 내부 ID 형식만 허용

## 9. 운영 흐름

### 9.1 스케줄링
- 프로토타입은 `setInterval` 기반 스케줄러로 충분하다.
- 운영 전환 시 OS cron 또는 별도 잡 실행기로 교체 가능하도록 `CrawlScheduler`를 독립 모듈로 둔다.

### 9.2 검수 큐
- 아래 조건 중 하나면 검수 큐에 올린다.
  - `review_status = pending_review`
  - 태그 없음
  - 추출 실패
  - 품질 점수 낮음

### 9.3 로깅
- 모든 수집 실행은 `crawl_runs`와 `crawl_run_items`에 남긴다.
- HTTP API는 요청 ID와 오류 코드를 남긴다.
- 사용자에게는 내부 스택을 노출하지 않는다.

## 10. Step 4 프로토타입 구현 범위

### 10.1 포함
- Node.js 단일 서버
- 정적 HTML/CSS/JS UI
- 로컬 JSON 소스 수집
- 규칙 기반 분류
- 목록/상세/운영 상태 조회 API

### 10.2 제외
- 실제 외부 웹 크롤링
- 인증
- PostgreSQL 연결
- OCR
- 파일 업로드

## 11. 테스트 기준
- `services/classify`의 순수 함수는 단위 테스트 대상
- `services/search`의 태그 `AND/OR` 로직은 단위 테스트 대상
- `services/crawl`의 dedup 분기와 정책 차단 분기는 단위 테스트 대상
- 공개 API는 최소한 검색/상세 조회 통합 테스트가 필요하다

## 12. 다음 단계 연결 포인트
- 4단계에서는 `repositories/json` 구현체를 먼저 만든다.
- 샘플 데이터는 `data/samples`에 두고, 크롤러는 `manualJsonSourceAdapter`로 시작한다.
- UI는 `/api/v1/search`, `/api/v1/documents/:id` 두 엔드포인트만 먼저 붙여도 된다.
