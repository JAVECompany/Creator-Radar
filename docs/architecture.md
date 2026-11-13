# 아키텍처

Next.js가 관리자 UI와 API를 제공한다. 워커는 같은 코드베이스에서 실행하는 별도 프로세스다. PostgreSQL이 세션, 수집 데이터, 작업 큐, 감사 로그 및 연락 이력의 원본이다.

플랫폼 계정은 정규화한 프로필과 공급자의 식별자로 중복을 확인한다. 이름이 같은 서로 다른 계정은 별개의 크리에이터로 저장한다. 공개 프로필과 게시물 메타데이터만 보관하고, 외부 링크는 브라우저에서 관리자가 직접 연다.

작업 큐는 리스와 행 잠금으로 동시 실행을 제어한다. 수집은 재실행을 허용한다. DM은 외부 요청 전에 DB에서 상태와 중복을 확인한다. 외부 결과가 불확실하면 전송을 중단하고 운영자가 이력을 확인한다.

성인 확인 근거는 관리자 검토로 기록한다. AI 분류는 검토된 공개 메타데이터에만 적용하며 사람의 속성을 판단하는 필드를 사용하지 않는다.

## 테이블과 관계

| 테이블 | 관계와 용도 |
| --- | --- |
| `User`, `UserSession`, `OAuthState` | 관리자와 여러 DB 세션. Instagram OAuth state는 세션 ID에 결합하며 1회 소비한다. |
| `SearchPreset`, `Setting`, `RateBucket`, `AuditLog` | 관리자별 검색 조건, 공용 가중치, DB 기반 속도 제한 및 감사 이벤트 |
| `Creator`, `CreatorPlatformAccount` | 크리에이터와 SNS 계정의 1:N 관계. 플랫폼·공급자 식별자와 정규화 URL을 각각 고유 키로 둔다. |
| `CreatorContent`, `CreatorMetricSnapshot` | SNS 계정에 속하는 공개 게시물 URL·메타데이터 및 관측 시각별 지표 |
| `AnalysisResult`, `AnalysisEvidence` | 계정의 분석 실행 결과와 게시물 URL별 카테고리·신뢰도. 카테고리는 PostgreSQL enum으로 제한한다. |
| `SubscriptionPlatform`, `SubscriptionPlatformAlias`, `CreatorSubscriptionPlatform`, `SubscriptionPlatformEvidence` | 플랫폼의 규칙, SNS 계정의 여러 플랫폼 감지 결과와 URL·별칭 근거 |
| `Job`, `ProviderRequestLog` | 수집·갱신·분석·DM·보존 처리를 통합한 영구 큐와 공급자별 호출 결과 |
| `InstagramConnection`, `InstagramCorrespondent`, `InstagramEvent` | 관리자 소유의 OAuth 연결, 연결별 Meta 범위 수신자 ID와 최근 수신 시각, 웹훅 중복 방지 |
| `TikTokConnection` | 종료된 TikTok 연동의 기존 연결 레코드를 보관하는 테이블 |
| `DMTemplate`, `DMCampaign`, `DMMessage` | 템플릿과 캠페인의 계정별 메시지. 메시지가 캠페인 수신자 역할도 하며 발신 계정과 관리자, 본문 및 멱등성 키를 저장한다. |
| `DMDeliveryAttempt`, `DMStatusHistory` | 메시지의 외부 전송 시도와 상태 변경 이력을 별도로 기록한다. |
| `RecruitmentCandidate`, `RecruitmentActivity`, `RecruitmentNote`, `Tag` | 크리에이터별 후보와 단계 이력, 관리자 메모, 다대다 태그 및 담당자 연결 |

## HTTP API

| 메서드 및 경로 | 기능 |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout` | 관리자 로그인 및 DB 세션 종료 |
| `GET /api/creators` | 필터, 정렬, 페이지 조회. `mode=export`는 CSV, `mode=selection`은 필터 일치 수와 선택 대상 |
| `POST /api/actions` | 관리자 변경 명령. 폼의 `_action` 또는 JSON의 `{ action, input }` |
| `GET /api/candidates/export` | 활성 후보 CSV |
| `GET /api/jobs` | 최근 작업 100건 및 진행·오류 정보 |
| `POST /api/dm/compose` | 미리보기와 서명된 확인값으로 개별·일괄 작업 생성 |
| `POST /api/instagram/connect` | OAuth 리디렉션 시작 |
| `GET /api/instagram/callback` | OAuth 콜백 및 연결 상태 반영 |
| `GET /api/instagram/webhook`, `POST /api/instagram/webhook` | Meta 구독 확인과 서명 검증된 수신 이벤트 |
| `POST /api/connections` | Instagram 탐색 인증 확인, Facebook 페이지 및 Threads 프로필 저장 |
| `GET /api/health` | DB 연결 헬스체크 |

JSON 응답은 `{ ok: true, data }` 또는 `{ ok: false, error: { code, message } }` 형식이다. 로그인 및 관리자 폼 제출은 브라우저 화면으로 리디렉션한다. 관리자 쓰기 요청은 로그인과 요청 출처를 검사한다. 웹훅은 Meta 서명을 검사한다.

## 작업과 연락 이력

워커는 `FOR UPDATE SKIP LOCKED`로 대기 작업을 선점하고 리스를 연장한다. 수집 중 일시적 장애는 최대 세 번 시도한다. DM은 API 호출 전에 `SENDING`과 시도 기록을 같은 트랜잭션으로 저장한다. 시도 중 워커 종료나 응답 단절이 발생하면 확인 필요로 표시하고 중복 발송을 차단한다.

목록 전체 선택은 서버 필터 결과 수를 먼저 표시하며 한 번에 최대 100개를 허용한다. DM 미리보기 확인값은 관리자와 본문, 대상, 자격에 결합되며 10분간 유효하다. 발송 직전 자격과 중복을 다시 검사한다. DM의 메시지별 발송 상태, 크리에이터의 최근 연락 상태, CRM 단계는 별도다.

점수는 측정 가능한 항목의 가중치 합으로 다시 정규화한다. 초기 가중치는 주제 적합도 35%, 최근 활동 25%, 참여 지표 20%, 계정 규모 10%, 협업 연락 정보 10%다. 점수와 입력 지표의 관측 시각을 기록한다.
