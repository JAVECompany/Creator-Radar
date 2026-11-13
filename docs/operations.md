# 운영 배포 및 데이터 복구

## 공통 환경변수

| 변수 | 용도 |
| --- | --- |
| `APP_URL` | 브라우저에서 접근하는 외부 URL. 운영은 HTTPS |
| `DATABASE_URL` | 웹·워커·마이그레이션의 PostgreSQL 연결 문자열 |
| `SESSION_SECRET` | 세션 쿠키 암호화 키. 무작위 32자 이상 |
| `TOKEN_ENCRYPTION_KEY` | Instagram 토큰 암호화 키. 32바이트 Base64 |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | 1회 관리자 생성에 사용 |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose로 운영하는 PostgreSQL의 초기 설정과 백업 인증 |
| `RADAR_ENV_FILE` | Compose가 읽는 운영 변수 파일. 기본 `.env.production` |
| `RADAR_WEB_PORT`, `RADAR_DOMAIN` | 호스트의 프록시 대상 포트 및 TLS 도메인 |

공급자별 변수는 [공식 API 연동 범위](integrations.md)에 있습니다. 운영 시크릿은 권한이 제한된 파일이나 배포 서비스의 시크릿 저장소로 전달합니다. 토큰 암호화 키를 백업과 함께 사용할 수 있도록 별도의 시크릿 저장소에 보관하세요. 키가 바뀌면 Instagram 재연결이 필요하며 세션 키 변경 시 기존 로그인 세션이 만료됩니다.

## 관리형 PostgreSQL

1. 전용 PostgreSQL DB를 준비하고 TLS를 요구하도록 연결 문자열에 `sslmode=require`를 설정합니다. 자동 백업과 PITR을 공급자 콘솔에서 설정합니다.
2. `.env.production`에 연결 문자열, HTTPS 앱 URL, 운영 시크릿을 작성합니다. Docker 호스트에서만 파일을 읽을 수 있도록 권한을 제한합니다.
3. 다음 명령으로 배포합니다.

```sh
docker compose -p creator-radar -f compose.production.yaml up -d --build
docker compose -p creator-radar -f compose.production.yaml ps
docker compose -p creator-radar -f compose.production.yaml logs migrate worker
```

`migrate` 서비스가 `prisma migrate deploy`를 성공하면 웹과 워커가 시작됩니다. 초기 관리자만 별도로 생성합니다. 운영 셸에서 아래 명령을 실행하고 각 프롬프트에 값을 입력합니다.

```sh
read -r -p '관리자 이메일: ' ADMIN_EMAIL
read -r -s -p '관리자 비밀번호: ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose -p creator-radar -f compose.production.yaml run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD admin
unset ADMIN_EMAIL ADMIN_PASSWORD
```

호스트에서 TLS 리버스 프록시를 사용합니다. Caddy 예시인 `deploy/Caddyfile`의 `RADAR_DOMAIN`을 설정하고 도메인 DNS를 호스트에 연결합니다. 기본 웹 포트는 호스트 루프백에만 바인딩됩니다. 외부에서는 HTTPS 프록시를 통하고 `GET /api/health`로 웹·DB 응답을 확인합니다. 워커 상태는 컨테이너 재시작 횟수, 구조화 로그 및 작업 대기 시간으로 모니터링합니다. OAuth 콜백과 웹훅 요청의 쿼리 문자열은 로그 수집에서 제외합니다.

## 자체 호스팅 PostgreSQL

`DATABASE_URL`의 호스트를 Compose 서비스 이름 `db`로 지정합니다. `POSTGRES_*` 값과 일치시킨 후 두 Compose 파일을 함께 사용합니다.

```sh
docker compose -p creator-radar -f compose.production.yaml -f compose.self-hosted.yaml up -d --build
docker compose -p creator-radar -f compose.production.yaml -f compose.self-hosted.yaml logs migrate backup worker
```

관리자 생성 명령에도 동일한 Compose 파일 두 개를 전달합니다. DB 파일은 Docker 명명 볼륨 `production-postgres`에 있습니다. `backup` 컨테이너가 최초 시작 및 24시간마다 `./backups`에 PostgreSQL 커스텀 포맷 덤프를 기록하고 14일을 보관합니다. 백업 실패는 15분 후 재시도합니다. 호스트 장애에 대비해 백업 디렉터리를 암호화된 외부 저장소에 복제하고 정기적으로 복구를 연습합니다.

## Vercel 웹/API와 자체 호스팅 PostgreSQL

Vercel의 Next.js 프로젝트는 웹과 API를 실행합니다. 항상 켜져 있는 Linux Docker 서버에서는 `db`, `migrate`, `worker`, `backup`을 실행합니다. DB 초기화·마이그레이션·백업은 Docker 서버에서 진행합니다. [Vercel Next.js 배포](https://vercel.com/docs/frameworks/full-stack/nextjs) · [Vercel의 Compose 지원 범위](https://vercel.com/i/can-you-run-docker-compose-on-vercel)

### 1. DB 접속 경로 준비

1. Vercel에서 GitHub 저장소를 Next.js 프로젝트로 가져옵니다. Node.js는 `22.x`, Output Directory는 기본값을 사용합니다. `vercel.json`에서 pnpm 버전을 지정하고 `prisma generate` 후 Next.js를 빌드합니다.
2. Vercel Settings → Networking에서 배포 리전의 Static IPs를 설정합니다. 이 기능은 요금이 부과됩니다. Docker 서버 방화벽에서 PostgreSQL 포트로 들어오는 연결은 Vercel이 지정한 IP만 허용합니다. Linux에서 포트를 Docker로 공개하면 UFW의 일반 입력 규칙을 우회할 수 있으므로 클라우드 방화벽이나 Docker 트래픽에 적용되는 방화벽 규칙에서 허용 범위를 설정합니다. [Vercel Static IPs](https://vercel.com/docs/networking/static-ips) · [Docker 방화벽](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
3. PostgreSQL에 사용할 DNS 이름과 해당 이름의 신뢰 가능한 TLS 인증서를 준비합니다. 예를 들어 `db.example.com`은 Docker 서버의 접속 가능한 주소를 가리킵니다. DNS는 Vercel에서 PostgreSQL에 TCP로 연결할 수 있도록 설정합니다. Cloudflare DNS를 사용한다면 해당 레코드를 DNS only로 설정합니다. 인증서 체인을 `server.crt`, 키를 `server.key`로 저장소 외부의 디렉터리에 배치합니다. 키의 소유자를 컨테이너 내 `postgres` 사용자에 대응하는 호스트 UID로 지정하고 권한을 `0600`으로 설정합니다. 컨테이너가 디렉터리를 탐색하고 인증서를 읽을 수 있어야 합니다. 인증서를 갱신한 뒤 `dc kill -s HUP db`로 PostgreSQL 설정을 다시 로드합니다. [PostgreSQL TLS 설정](https://www.postgresql.org/docs/17/ssl-tcp.html) · [Cloudflare 프록시 포트](https://developers.cloudflare.com/fundamentals/reference/network-ports/)

### 2. Docker 서버 기동 및 운영 계정 설정

Docker 서버의 저장소 루트에 `.env.production`을 작성합니다. 다음 예시의 비밀번호는 실제 값으로 대체합니다. DB 연결 URL의 비밀번호에 `@`, `:`, `/` 등의 특수문자가 있으면 URL 인코딩합니다.

```dotenv
POSTGRES_USER=radar
POSTGRES_PASSWORD=<DB 소유자 비밀번호>
POSTGRES_DB=radar
DATABASE_URL=postgresql://radar:<URL 인코딩한 DB 소유자 비밀번호>@db:5432/radar?schema=public&sslmode=require
RADAR_DB_BIND_IP=<Docker 서버의 DB 서비스 바인딩 IPv4 주소>
RADAR_DB_PORT=5432
RADAR_DB_TLS_DIR=/etc/creator-radar/postgres-tls
APP_URL=https://radar.example.com
```

기존 DB 볼륨을 사용 중이면 현재 DB의 사용자, 비밀번호, DB 이름과 일치시킵니다. `POSTGRES_*` 초기화 변수를 수정해도 기존 볼륨의 자격 증명은 바뀌지 않습니다. `TOKEN_ENCRYPTION_KEY`는 Instagram 메시징을 위해 Vercel과 동일한 값을 설정합니다. SNS 탐색·발송과 AI 작업에 사용하는 연동 변수도 워커가 읽을 수 있도록 이 파일에 추가합니다.

Docker 서버의 Bash에서 다음 명령을 실행합니다.

```sh
dc() {
  docker compose -p creator-radar --env-file .env.production \
    -f compose.production.yaml -f compose.self-hosted.yaml -f compose.vercel-db.yaml "$@"
}

dc up -d --build db migrate worker backup
dc ps -a
dc logs migrate
```

마이그레이션이 성공한 후 Vercel용 DB 역할을 한 번 생성합니다. 이 역할은 애플리케이션 테이블에 필요한 권한만 갖습니다. DB 마이그레이션에 사용하는 소유자 자격 증명은 Docker 서버에서 관리합니다.

```sh
dc exec db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

```sql
CREATE ROLE radar_web LOGIN;
\password radar_web
GRANT USAGE ON SCHEMA public TO radar_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO radar_web;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM radar_web;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO radar_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO radar_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO radar_web;
\q
```

새 운영 DB에 로그인할 관리자가 필요하면 같은 셸에서 초기 계정을 생성합니다.

```sh
read -r -p '관리자 이메일: ' ADMIN_EMAIL
read -r -s -p '관리자 비밀번호: ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
dc run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD admin
unset ADMIN_EMAIL ADMIN_PASSWORD
```

### 3. Vercel 환경변수 및 배포

Vercel의 Settings → Environment Variables에서 아래 값을 **Production**에 설정합니다. Preview가 필요하면 별도 DB와 시크릿을 사용합니다. `.env.production`은 Docker 서버에서 관리합니다. [Vercel 환경변수](https://vercel.com/docs/environment-variables)

| 변수 | Vercel 값 |
| --- | --- |
| `DATABASE_URL` | `postgresql://radar_web:<URL 인코딩한 역할 비밀번호>@db.example.com:5432/radar?schema=public&sslmode=require&sslaccept=strict&connection_limit=1` |
| `APP_URL` | 브라우저에서 접속할 운영 HTTPS 주소. Docker 서버의 `APP_URL`과 일치해야 합니다. |
| `SESSION_SECRET` | 운영 로그인용 무작위 32자 이상 문자열 |
| `TOKEN_ENCRYPTION_KEY` | Instagram 연결을 쓸 경우 Docker 서버와 동일한 32바이트 Base64 키 |
| SNS 및 AI 연동 변수 | [공식 API 연동 범위](integrations.md)에 따라 사용하는 기능의 값을 설정합니다. |

Vercel 배포 후 `https://radar.example.com/api/health`에서 `{"ok":true}`가 나오면 웹/API에서 DB에 연결된 것입니다. `dc logs -f worker`로 워커가 실행되는지 확인한 후 로그인하고 탐색 작업 하나가 처리되는지 확인합니다. Instagram을 사용하는 경우 Meta의 OAuth 콜백과 웹훅 URL도 새 운영 주소에 맞춥니다.

재배포할 때는 Docker 서버에서 새 코드로 마이그레이션과 워커를 먼저 반영한 뒤 Vercel 운영 배포를 적용합니다. 기존 로컬 데이터를 옮길 경우 아래 복구 절차를 사용합니다. DB 볼륨과 Docker 서버의 `./backups`는 [자체 호스팅 PostgreSQL](#자체-호스팅-postgresql)과 같은 방식으로 관리합니다.

## 복구

1. 신규 격리 DB를 준비합니다. 운영 웹·워커가 연결되어 있으면 중지하고 현재 DB의 별도 백업을 확보합니다.
2. 복구 호스트에서 `pg_restore --list 백업파일.dump`로 덤프를 확인합니다. 신규 DB 연결값을 `RESTORE_DATABASE_URL`로 설정합니다. 복구 명령이 사용하는 libpq URL에는 Prisma 전용 `schema` 매개변수를 생략합니다.
3. 복구 DB에서 관리자 계정·크리에이터·DM·후보 수와 이력 샘플을 확인합니다. 백업 이후 처리된 삭제 요청을 재적용합니다. 이력과 실제 Meta 발송 여부를 대조한 뒤 웹과 워커를 복구 DB로 전환합니다.

```sh
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" 백업파일.dump
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm db:deploy
```

DB 볼륨을 제거하는 명령은 데이터도 삭제합니다. 정상 재배포에는 `up -d --build`와 버전별 마이그레이션을 사용합니다. 초기 관리자 생성은 수동 명령이며 Compose 웹·워커 시작 시 실행되지 않습니다.

## 보존 및 삭제 요청

- YouTube API 제공 메타데이터는 29일을 기준으로 갱신 또는 만료 처리합니다. 관리자 입력·CRM과 계정 식별 레코드의 보존 방식은 [공식 API 연동 범위](integrations.md)에 설명되어 있습니다.
- 로그인 세션과 OAuth state는 만료 후 정리합니다. 공급자 요청 로그 및 웹훅 중복 방지 ID는 90일 이후 정리합니다. DM 상태와 CRM 이력은 일반 상태 변경으로 삭제하지 않습니다.
- 대상자의 삭제 요청을 받으면 상세 화면에서 근거를 확인하고 개인정보 영구 삭제를 실행합니다. 관련 계정, 게시물, 분석 근거, 후보, 메모, DM과 작업을 정리합니다. 복구 시 다시 적용할 수 있도록 별도 접근 제한 저장소에 삭제 요청 처리 내역을 보관하세요.
- 삭제 실행 직전 이미 발송을 시작한 DM은 확인이 끝난 뒤 처리합니다. 복구 후 발송 이력 대조를 마칠 때까지 워커를 중지합니다.
