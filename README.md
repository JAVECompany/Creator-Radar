# Creator Radar

공개 SNS 계정 탐색, 성인 여부 및 콘텐츠 검토, 영입 후보 관리, Instagram 연락 이력을 위한 한국어 관리자 웹앱입니다. Next.js 웹/API와 별도 워커가 PostgreSQL을 공유합니다.

## 처음 실행하기 (Windows PowerShell)

Node.js 22.16 이상, pnpm 12.11.2, Docker Desktop이 필요합니다. Docker Desktop을 실행하고 Linux 컨테이너 엔진이 준비되면 프로젝트 폴더에서 시작합니다.

pnpm이 설치되어 있지 않으면 `npm install --global pnpm@12.11.2`를 실행합니다.

```powershell
cd C:\Users\JJH\Documents\GitHub\Creator-Radar
Copy-Item .env.example .env
notepad .env
```

다음 항목을 `.env`에 입력합니다.

- `POSTGRES_PASSWORD`에 로컬 PostgreSQL 비밀번호를 지정합니다. 아래 URL에 그대로 사용할 때는 영문·숫자로 구성한 긴 무작위 값을 사용하세요.
- `DATABASE_URL`은 `postgresql://radar:<POSTGRES_PASSWORD와 같은 값>@localhost:5432/radar?schema=public` 형식으로 입력합니다.
- `POSTGRES_PORT`는 Windows에 공개할 DB 포트입니다. `5432` 바인딩에 실패하면 `POSTGRES_PORT=5433`으로 지정하고 `DATABASE_URL`의 포트도 `5433`으로 변경합니다. 이후 `docker compose up -d --wait db`를 다시 실행합니다. 기존 DB 볼륨을 그대로 사용합니다.
- `SESSION_SECRET`과 `TOKEN_ENCRYPTION_KEY`는 아래 명령에서 생성되는 두 줄을 순서대로 입력합니다.
- `ADMIN_EMAIL`과 `ADMIN_PASSWORD`는 최초 관리자 로그인에 사용할 값입니다. 비밀번호는 14자 이상입니다.
- `APP_URL`은 기본값 `http://localhost:3000`을 사용합니다. 개발 서버가 다른 포트를 사용하면 URL과 실행 포트를 함께 변경합니다.

```powershell
node -e "const c=require('node:crypto'); console.log(c.randomBytes(32).toString('hex')); console.log(c.randomBytes(32).toString('base64'))"
```

설정을 저장한 다음 의존성, DB, 관리자 계정을 초기화합니다.

```powershell
pnpm install --frozen-lockfile
docker compose up -d --wait db
pnpm db:generate
pnpm db:deploy
pnpm admin:create
pnpm dev
```

**두 번째 PowerShell**에서 같은 프로젝트 폴더로 이동한 뒤 워커를 켭니다.

```powershell
pnpm worker
```

[로컬 관리자 화면](http://localhost:3000/login)에서 설정한 계정으로 로그인합니다. `pnpm admin:create`는 계정당 한 번 실행합니다. 이후에는 `docker compose up -d --wait db`, `pnpm dev`, `pnpm worker`로 재시작합니다. Prisma 스키마를 개발 중 변경할 때는 `pnpm db:migrate --name 변경이름`으로 새 마이그레이션을 작성합니다.

API 키 없이도 크리에이터 탐색 화면에서 공개 프로필을 수동 등록할 수 있습니다. 상세 화면에서 성인 확인 근거 및 콘텐츠 검토를 기록한 뒤 영입 후보를 관리하고, Instagram 수동 DM 작업을 작성해 실제 발송 후 완료를 기록할 수 있습니다.

## 폴더 및 주요 파일

| 위치 | 역할 |
| --- | --- |
| `src/app/(admin)` | 대시보드, 탐색, 목록, 상세, CRM, DM, 연결, 작업 및 설정 화면 |
| `src/app/api` | 인증, 관리자 명령, CSV, 작업 조회, DM, OAuth 및 웹훅 |
| `src/components` | 공통 UI, TanStack Table·Query, Recharts |
| `src/lib` | DB 연결, 관리자 세션, 오류, URL 및 토큰 검증 |
| `src/services/providers` | SNS 공식 API 어댑터와 지원 범위 |
| `src/services` | 수집, 팬 플랫폼 검사, AI 분류, 점수, Instagram, DM, CRM 명령 |
| `src/worker.ts` | PostgreSQL 작업 선점, 진행률, 리스 및 실패 처리 |
| `prisma/schema.prisma`, `prisma/migrations` | 관계 모델과 초기 SQL 마이그레이션 |
| `compose*.yaml`, `Dockerfile`, `deploy` | 로컬 DB 및 운영 웹·워커·DB 구성 |

[DB 관계 및 API 명세](docs/architecture.md) · [운영·백업·복구](docs/operations.md) · [공식 API 연동 범위](docs/integrations.md) · [환경변수 예시](.env.example)
