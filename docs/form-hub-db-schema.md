# Form Hub DB 스키마 설계

## 1. 목적
- `form-hub` MVP의 수집, 분류, 검색, 운영 요구사항을 만족하는 DB 구조를 정의한다.
- 본 설계는 [form-hub-mvp-spec.md](/home/joseph/바탕화면/개발/form-hub/docs/form-hub-mvp-spec.md)와 `/home/joseph/바탕화면/개발/first.md`를 기준으로 한다.
- 이번 단계는 구현이 아니라 스키마 고정이 목적이며, 3단계 API 설계와 4단계 프로토타입의 입력 계약으로 사용한다.

## 2. DB 선택과 기본 원칙

### 2.1 선택
- 기본 DB는 `PostgreSQL`로 설계한다.
- 이유:
  - 관계형 무결성 보장에 유리하다.
  - 태그 교집합/합집합 쿼리를 안정적으로 처리할 수 있다.
  - 운영 로그와 검색용 인덱스를 함께 다루기 쉽다.

### 2.2 기본 원칙
- PK는 애플리케이션에서 생성한 `UUID`를 사용한다.
- 시간 컬럼은 모두 `timestamptz` 기준으로 저장한다.
- 상태값은 문자열 자유입력 대신 enum 또는 체크 제약으로 제한한다.
- 원문 HTML/PDF 바이너리는 DB에 직접 넣지 않는다.
- 파일 캐시가 허용된 경우에도 DB에는 메타데이터와 저장 위치만 기록한다.
- 검색 성능을 위해 일부 표시용 필드는 정규화 테이블과 별도로 `documents`에 요약 저장한다.

### 2.3 핵심 모델링 전략
- `documents`는 사용자에게 보여줄 대표 문서 단위다.
- `document_occurrences`는 각 소스에 실제로 존재하는 개별 게시물/첨부 인스턴스다.
- 같은 양식이 여러 사이트에 올라와도 사용자 검색 결과는 `documents` 한 건으로 보이고, 출처 추적은 `document_occurrences`로 처리한다.

## 3. 엔터티 관계 요약

```text
source_sites
  -> crawl_runs
    -> crawl_run_items

documents
  -> document_occurrences
    -> document_contents
    -> document_assets

documents
  -> document_tags -> tags

documents
  -> document_organizations -> organizations -> organization_aliases

documents
  -> recruitment_profiles

tags
  -> tag_keyword_rules
```

## 4. 상태값 정의

### 4.1 source_status
- `active`: 정상 수집 대상
- `paused`: 운영자가 일시 중지
- `blocked`: 정책상 수집 금지
- `retired`: 더 이상 사용하지 않음

### 4.2 crawl_run_status
- `queued`
- `running`
- `succeeded`
- `partially_failed`
- `failed`
- `cancelled`

### 4.3 crawl_item_status
- `fetched`
- `skipped_duplicate`
- `parse_failed`
- `fetch_failed`
- `blocked_policy`
- `ignored`

### 4.4 visibility_status
- `active`
- `hidden`
- `archived`

### 4.5 review_status
- `pending_review`
- `approved`
- `rejected`

### 4.6 extraction_status
- `pending`
- `succeeded`
- `failed`
- `unsupported`

### 4.7 asset_kind
- `attachment`
- `preview`
- `thumbnail`

### 4.8 access_policy
- `link_only`
- `metadata_only`
- `cached_preview_allowed`
- `cached_file_allowed`

### 4.9 tag_group
- `document_type`
- `domain`
- `organization`
- `employment_type`
- `seniority`
- `format`

### 4.10 assignment_method
- `rule`
- `manual`
- `import`
- `llm`

### 4.11 organization_relation_type
- `publisher`
- `recruiter`
- `issuer`
- `mentioned`

### 4.12 recruitment_kind
- `open_recruitment`
- `intern`
- `experienced`
- `contract`
- `mixed`
- `unknown`

## 5. 테이블 설계

### 5.1 `source_sites`
수집 가능한 사이트와 정책 정보를 관리한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 소스 ID |
| name | text | NOT NULL | 소스 표시명 |
| base_url | text | NOT NULL, UNIQUE | 소스 기준 URL |
| source_type | text | NOT NULL | `html_list`, `rss`, `manual` 등 |
| parser_key | text | NOT NULL | 사용할 파서 식별자 |
| parser_config_json | jsonb | NOT NULL DEFAULT `'{}'` | 선택자, 페이지네이션 규칙 |
| status | text | NOT NULL | `source_status` |
| allow_crawl | boolean | NOT NULL DEFAULT false | 수집 허용 여부 |
| allow_cache | boolean | NOT NULL DEFAULT false | 파일 캐시 허용 여부 |
| allow_preview | boolean | NOT NULL DEFAULT false | 미리보기 저장 허용 여부 |
| trust_score | numeric(5,4) | NOT NULL DEFAULT 0.5000 | 출처 신뢰도 점수 |
| crawl_interval_minutes | integer | NOT NULL | 주기 |
| request_timeout_ms | integer | NOT NULL | 요청 타임아웃 |
| robots_checked_at | timestamptz | NULL | robots 확인 시각 |
| policy_reviewed_at | timestamptz | NULL | 약관 검토 시각 |
| policy_note | text | NULL | 운영 메모 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

### 5.2 `crawl_runs`
한 번의 수집 실행 단위를 저장한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 실행 ID |
| source_id | uuid | FK -> source_sites.id | 대상 소스 |
| run_type | text | NOT NULL | `scheduled`, `manual`, `backfill` |
| status | text | NOT NULL | `crawl_run_status` |
| started_at | timestamptz | NOT NULL | 시작 시각 |
| ended_at | timestamptz | NULL | 종료 시각 |
| items_found | integer | NOT NULL DEFAULT 0 | 후보 개수 |
| items_created | integer | NOT NULL DEFAULT 0 | 신규 문서 수 |
| items_updated | integer | NOT NULL DEFAULT 0 | 갱신 수 |
| items_skipped | integer | NOT NULL DEFAULT 0 | 스킵 수 |
| error_count | integer | NOT NULL DEFAULT 0 | 오류 수 |
| error_summary | text | NULL | 대표 오류 요약 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

### 5.3 `crawl_run_items`
실행 중 발견된 개별 항목과 파싱 결과를 기록한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 항목 ID |
| crawl_run_id | uuid | FK -> crawl_runs.id | 실행 ID |
| source_item_key | text | NULL | 소스 내부 식별자 |
| page_url | text | NOT NULL | 원문 페이지 URL |
| page_url_normalized | text | NOT NULL | 정규화 URL |
| item_title | text | NULL | 수집 시점 제목 |
| status | text | NOT NULL | `crawl_item_status` |
| http_status | integer | NULL | 응답 코드 |
| resolved_document_id | uuid | NULL FK -> documents.id | 연결된 대표 문서 |
| resolved_occurrence_id | uuid | NULL FK -> document_occurrences.id | 연결된 출처 인스턴스 |
| content_hash | text | NULL | 본문 해시 |
| attachment_hash | text | NULL | 첨부 해시 |
| debug_capture_key | text | NULL | 원문 스냅샷 저장 키 |
| error_message | text | NULL | 실패 메시지 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

### 5.4 `organizations`
기관/기업 필터를 위한 정규화 엔터티다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 기관 ID |
| name | text | NOT NULL | 대표 이름 |
| normalized_name | text | NOT NULL, UNIQUE | 검색용 정규화 이름 |
| organization_type | text | NOT NULL | `public_company`, `private_company`, `bank`, `government`, `unknown` |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

### 5.5 `organization_aliases`
기관 별칭을 분리 저장한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 별칭 ID |
| organization_id | uuid | FK -> organizations.id | 기관 ID |
| alias | text | NOT NULL | 원문 별칭 |
| normalized_alias | text | NOT NULL, UNIQUE | 검색용 정규화 별칭 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

### 5.6 `documents`
사용자가 검색하고 보는 대표 문서다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 문서 ID |
| representative_title | text | NOT NULL | 대표 제목 |
| normalized_title | text | NOT NULL | 정규화 제목 |
| representative_summary | text | NULL | 대표 요약 |
| visibility_status | text | NOT NULL DEFAULT `active` | `visibility_status` |
| review_status | text | NOT NULL DEFAULT `pending_review` | `review_status` |
| quality_score | numeric(5,4) | NOT NULL DEFAULT 0 | 품질 점수 |
| source_count | integer | NOT NULL DEFAULT 1 | 묶인 출처 수 |
| published_at | timestamptz | NULL | 대표 게시일 |
| first_seen_at | timestamptz | NOT NULL | 최초 발견 시각 |
| last_seen_at | timestamptz | NOT NULL | 마지막 발견 시각 |
| search_text | text | NOT NULL DEFAULT '' | 검색 대상 텍스트 |
| search_text_compact | text | NOT NULL DEFAULT '' | 공백 제거 검색 텍스트 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

설계 메모:
- `representative_title`, `representative_summary`, `published_at`는 대표 출처 기준으로 갱신한다.
- `search_text`는 제목, 요약, 태그명, 기관명, 주요 본문을 합친 비정규화 필드다.

### 5.7 `document_occurrences`
대표 문서를 구성하는 실제 출처 단위다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 인스턴스 ID |
| document_id | uuid | FK -> documents.id | 대표 문서 ID |
| source_id | uuid | FK -> source_sites.id | 출처 소스 ID |
| page_url | text | NOT NULL | 원문 페이지 URL |
| page_url_normalized | text | NOT NULL | 정규화 URL |
| canonical_url | text | NULL | 사이트 canonical URL |
| attachment_url | text | NULL | 첨부 링크 |
| attachment_url_normalized | text | NULL | 정규화 첨부 링크 |
| source_document_key | text | NULL | 소스 내부 문서 키 |
| source_title | text | NOT NULL | 출처 제목 |
| source_published_at | timestamptz | NULL | 출처 게시일 |
| first_seen_at | timestamptz | NOT NULL | 최초 발견 시각 |
| last_seen_at | timestamptz | NOT NULL | 마지막 발견 시각 |
| content_hash | text | NULL | 본문 해시 |
| attachment_hash | text | NULL | 첨부 해시 |
| file_type | text | NULL | `pdf`, `docx`, `hwpx`, `html` 등 |
| access_policy | text | NOT NULL | `access_policy` |
| is_primary | boolean | NOT NULL DEFAULT false | 대표 출처 여부 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

핵심 제약:
- `(source_id, page_url_normalized)`는 유니크.
- 문서마다 `is_primary = true`인 행은 최대 1개만 허용한다.

### 5.8 `document_contents`
출처 단위 추출 본문을 관리한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 본문 ID |
| occurrence_id | uuid | FK -> document_occurrences.id | 출처 인스턴스 |
| version_no | integer | NOT NULL | 추출 버전 |
| content_source | text | NOT NULL | `html_body`, `pdf_text`, `docx_text`, `hwpx_text`, `manual` |
| extraction_status | text | NOT NULL | `extraction_status` |
| extractor_name | text | NULL | 추출기 이름 |
| raw_text | text | NULL | 원시 추출 텍스트 |
| cleaned_text | text | NULL | 정제 텍스트 |
| summary | text | NULL | 출처 단위 요약 |
| content_hash | text | NULL | 본문 해시 |
| extracted_at | timestamptz | NOT NULL | 추출 시각 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

핵심 제약:
- `(occurrence_id, version_no)`는 유니크.

### 5.9 `document_assets`
첨부파일, 썸네일, 미리보기 자산을 관리한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 자산 ID |
| occurrence_id | uuid | FK -> document_occurrences.id | 출처 인스턴스 |
| asset_kind | text | NOT NULL | `asset_kind` |
| source_url | text | NOT NULL | 원본 자산 URL |
| file_name | text | NULL | 파일명 |
| file_ext | text | NULL | 확장자 |
| mime_type | text | NULL | MIME 타입 |
| sha256 | text | NULL | 파일 해시 |
| file_size_bytes | bigint | NULL | 파일 크기 |
| storage_key | text | NULL | 캐시 저장 경로 |
| access_policy | text | NOT NULL | `access_policy` |
| is_primary | boolean | NOT NULL DEFAULT false | 대표 자산 여부 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

핵심 제약:
- `(occurrence_id, asset_kind, source_url)`는 유니크.
- 출처마다 `is_primary = true`인 자산은 최대 1개만 허용한다.

### 5.10 `recruitment_profiles`
채용 관련 문서에만 붙는 선택적 메타데이터다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| document_id | uuid | PK, FK -> documents.id | 문서 ID |
| recruitment_kind | text | NOT NULL | `recruitment_kind` |
| season_label | text | NULL | 예: `2026 상반기` |
| employment_track | text | NULL | 예: `일반행원`, `디자인 인턴` |
| apply_start_at | timestamptz | NULL | 접수 시작 |
| apply_end_at | timestamptz | NULL | 접수 종료 |
| posting_url | text | NULL | 공고 링크 |
| external_apply_url | text | NULL | 외부 지원 링크 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

### 5.11 `tags`
태그 사전이다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 태그 ID |
| name | text | NOT NULL | 표시명 |
| slug | text | NOT NULL, UNIQUE | 내부 식별자 |
| tag_group | text | NOT NULL | `tag_group` |
| description | text | NULL | 설명 |
| is_active | boolean | NOT NULL DEFAULT true | 사용 여부 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

핵심 제약:
- `(tag_group, name)`는 유니크.

### 5.12 `document_tags`
문서와 태그의 연결이다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| document_id | uuid | FK -> documents.id | 문서 ID |
| tag_id | uuid | FK -> tags.id | 태그 ID |
| assignment_method | text | NOT NULL | `assignment_method` |
| confidence | numeric(5,4) | NULL | 분류 신뢰도 |
| is_primary | boolean | NOT NULL DEFAULT false | 대표 태그 여부 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

핵심 제약:
- PK는 `(document_id, tag_id)`.

### 5.13 `document_organizations`
문서와 기관의 관계를 저장한다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| document_id | uuid | FK -> documents.id | 문서 ID |
| organization_id | uuid | FK -> organizations.id | 기관 ID |
| relation_type | text | NOT NULL | `organization_relation_type` |
| confidence | numeric(5,4) | NULL | 분류 신뢰도 |
| is_primary | boolean | NOT NULL DEFAULT false | 대표 기관 여부 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

핵심 제약:
- PK는 `(document_id, organization_id, relation_type)`.

설계 메모:
- 기관 필터의 기준 데이터는 `document_organizations`와 `organizations`다.
- `tag_group = organization` 태그는 검색 보조와 UI 노출용으로만 사용한다.

### 5.14 `tag_keyword_rules`
자동 분류용 키워드 규칙 테이블이다.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 규칙 ID |
| tag_id | uuid | FK -> tags.id | 대상 태그 |
| rule_name | text | NOT NULL | 규칙 이름 |
| match_field | text | NOT NULL | `title`, `content`, `organization`, `asset_name`, `all` |
| pattern_type | text | NOT NULL | `contains`, `exact`, `regex` |
| pattern_value | text | NOT NULL | 키워드 또는 패턴 |
| polarity | text | NOT NULL DEFAULT `include` | `include`, `exclude` |
| weight | numeric(5,4) | NOT NULL DEFAULT 1 | 점수 가중치 |
| is_active | boolean | NOT NULL DEFAULT true | 활성 여부 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수정 시각 |

## 6. 인덱스 설계

### 6.1 필수 인덱스
- `source_sites(status, allow_crawl)`
- `source_sites(trust_score DESC)`
- `crawl_runs(source_id, started_at DESC)`
- `crawl_run_items(crawl_run_id, status)`
- `documents(visibility_status, review_status, published_at DESC)`
- `documents(last_seen_at DESC)`
- `document_occurrences(document_id, is_primary)`
- `document_occurrences(source_id, page_url_normalized)`
- `document_occurrences(attachment_hash)`
- `document_occurrences(content_hash)`
- `document_tags(tag_id, document_id)`
- `document_organizations(organization_id, document_id)`
- `organizations(normalized_name)`
- `organization_aliases(normalized_alias)`

### 6.2 검색 인덱스
- MVP 기본안:
  - `documents.search_text_compact`에 대한 B-Tree 또는 prefix 검색 보조 인덱스
- 권장안:
  - `pg_trgm` 확장 사용 가능 시 `documents.search_text`와 `documents.normalized_title`에 trigram 인덱스

설계 메모:
- 한국어 검색은 기본 FTS보다 부분일치 기반 검색이 실용적이므로 MVP는 `search_text` + 태그 조합으로 시작한다.

## 7. 주요 무결성 규칙
- 수집 금지 소스는 `source_sites.status = blocked` 또는 `allow_crawl = false`로 명시한다.
- 사용자에게 노출되는 문서는 `documents.visibility_status = active`이고 `review_status = approved`인 경우로 제한한다.
- 출처 없는 문서는 허용하지 않는다.
  - `documents` 생성 직후 최소 1개의 `document_occurrences`가 연결되어야 한다.
- 문서 대표 출처는 한 건만 허용한다.
- 태그는 사전 등록된 값만 연결한다.
- 기관명은 태그와 별도 엔터티로 관리해 기업/기관 필터 정확도를 높인다.

## 8. 쿼리 패턴

### 8.1 태그 `OR` 검색
- `document_tags.tag_id IN (...)` 조건으로 필터링한다.
- 중복 제거는 `documents.id` 기준으로 처리한다.

### 8.2 태그 `AND` 검색
- `document_tags`를 태그 수만큼 만족한 문서만 남긴다.
- 구현 방식:
  - `WHERE tag_id IN (...)`
  - `GROUP BY document_id`
  - `HAVING COUNT(DISTINCT tag_id) = :selected_tag_count`

### 8.3 기관명 + 태그 복합 검색
- 기관명은 `document_organizations` 또는 `organization_aliases`로 매칭한다.
- 태그 필터와 기관 필터를 동시에 만족하는 문서를 우선 정렬한다.

### 8.4 키워드 검색
- 대상 필드:
  - `documents.representative_title`
  - `documents.representative_summary`
  - `documents.search_text`
- 키워드 정규화는 애플리케이션에서 처리한다.
  - 소문자화
  - 공백 축약
  - 특수문자 제거

### 8.5 운영 검수 목록
- `documents.review_status = pending_review`
- 또는 `quality_score < 임계값`
- 또는 추출 실패한 `document_contents`가 있는 문서

## 9. 비정규화 필드 정책
- `documents.search_text`
  - 검색 속도를 위해 유지한다.
  - 제목, 태그명, 기관명, 대표 본문 요약을 합쳐 저장한다.
- `documents.source_count`
  - 대표 문서에 연결된 출처 수를 표시하기 위한 캐시 값이다.
- `documents.representative_summary`
  - 목록 화면 성능을 위해 별도 저장한다.

왜 이렇게 두는가:
- 검색 결과 목록은 가장 자주 호출된다.
- 매 요청마다 본문/태그/기관을 모두 조인하면 MVP 단계에서 비용이 커진다.

## 10. 구현 시 주의점
- URL 정규화 로직은 애플리케이션 계층에서 일관되게 처리한다.
- 해시는 SHA-256 기준으로 통일한다.
- `document_occurrences.content_hash`와 `attachment_hash`는 dedup 후보 탐지용이며, 단독으로 동일 문서를 확정하지는 않는다.
- 파일 저장 금지 소스는 `document_assets.storage_key`를 비운다.
- `raw_text` 저장이 부담되면 길이 제한 또는 외부 저장소 포인터 전략으로 전환할 수 있다.

## 11. 초기 마이그레이션 순서
1. `source_sites`
2. `crawl_runs`
3. `documents`
4. `organizations`
5. `organization_aliases`
6. `tags`
7. `document_occurrences`
8. `document_contents`
9. `document_assets`
10. `document_tags`
11. `document_organizations`
12. `recruitment_profiles`
13. `crawl_run_items`
14. `tag_keyword_rules`

## 12. 3단계 입력값으로 넘길 핵심 포인트
- 크롤러는 `source_sites`와 `crawl_runs`, `crawl_run_items`, `document_occurrences`를 중심으로 설계한다.
- 분류기는 `document_contents`, `tags`, `tag_keyword_rules`, `document_tags`, `document_organizations`를 갱신한다.
- 검색 API는 `documents`를 기준 엔터티로 사용하고, 태그/기관/출처는 조인으로 확장한다.
- 채용 메타데이터는 `recruitment_profiles`에서 별도 필터로 처리한다.
