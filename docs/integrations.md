# 공식 API 연동 범위

각 어댑터는 정상, 일부 지원, 인증 필요, 미지원, 요청 제한, 일시적 장애 및 실패 상태를 반환합니다. **SNS 연결**에서 자격 증명을 확인하고, 수집 작업에서 실제 호출 결과를 확인할 수 있습니다. 기존 네이버 블로그와 TikTok 기록은 연동 종료로 표시됩니다.

| 공급자 | 구현한 호출 | 연동 준비와 제한 |
| --- | --- | --- |
| YouTube | Data API 채널 키워드 검색, ID·핸들로 채널 조회, 공개 구독자 수와 업로드 목록 | `YOUTUBE_API_KEY`. 지역 코드는 결과 지역 조건이며 계정 국가를 증명하지 않습니다. 구독자 숨김은 결측입니다. 제공 메타데이터에 보존 기한을 적용하고 제공 데이터는 팬 분류와 적합도 계산에서 제외합니다. [API 레퍼런스](https://developers.google.com/youtube/data/reference/rest) · [개발자 정책](https://developers.google.com/youtube/terms/developer-policies) |
| Instagram 탐색 | Facebook Login의 Business Discovery로 정확한 사용자명의 프로페셔널 계정 조회 | `IG_DISCOVERY_TOKEN`, `IG_DISCOVERY_ACCOUNT_ID`, `META_GRAPH_VERSION`. 연결된 Facebook Page, 대상 API 권한 및 필요한 App Review를 확인합니다. 일반 계정 및 키워드 탐색은 수동 등록을 사용합니다. [Meta Instagram API](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api) |
| Facebook | 설정한 공개 관리 페이지의 프로필과 공개 팔로워 수 | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `META_GRAPH_VERSION`. 설정한 페이지의 정확한 사용자명 또는 숫자 ID를 입력합니다. [Pages API](https://developers.facebook.com/docs/graph-api/reference/page/) |
| Threads | 토큰을 승인한 계정의 프로필, 권한이 있는 공개 프로필의 정확한 사용자명 조회 | `THREADS_ACCESS_TOKEN`. 기본 연결은 `threads_basic`, 공개 프로필 조회는 `threads_profile_discovery`를 허용한 사용자 토큰이 필요합니다. [Meta 공개 프로필 조회](https://www.postman.com/meta/threads/request/34203612-d5ea7186-5329-4c76-bbb6-3dd408e508b5) |
| AI 분석 | 공개 게시물 주제 분류 및 신뢰도·근거·모델 기록 | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`. 모델은 Chat Completions의 JSON 응답을 지원해야 합니다. 관리자 검토를 거친 게시물의 텍스트 메타데이터만 전달합니다. |

## Facebook 및 Threads 연결

1. **Facebook**은 Meta Graph API Explorer에서 관리 페이지에 접근을 허용한 사용자 토큰으로 `GET /me/accounts?fields=id,name,access_token`을 호출합니다. 응답에서 대상 페이지의 `id`와 `access_token`을 각각 `FACEBOOK_PAGE_ID`와 `FACEBOOK_PAGE_ACCESS_TOKEN`에 넣습니다. [Meta 페이지 토큰 요청](https://www.postman.com/meta/facebook/request/bqfxwbp/get-access-tokens-of-pages-you-manage)
2. **Threads**는 Meta Threads 사용 사례에 등록한 앱에서 Threads OAuth로 사용자 토큰을 발급하고 `THREADS_ACCESS_TOKEN`에 넣습니다. 자신의 프로필에는 `threads_basic`을 쓰고, 외부 공개 프로필도 조회할 경우 `threads_profile_discovery`를 승인받아 토큰에 포함합니다. [Meta Threads 토큰 가이드](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api?entity=request-34203612-74fb48b1-ad1a-480e-b200-4dcdb8126a2f)
3. 환경변수를 바꾼 뒤 웹과 워커를 재시작하고 **SNS 연결 → 연결 확인 및 프로필 저장**을 누릅니다. 성공한 계정은 전체 크리에이터 목록에 표시됩니다.

## Instagram OAuth 및 메시징

1. Meta에서 Instagram Login을 설정하고 `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `META_GRAPH_VERSION`을 서버에 설정합니다. 관리 권한이 있는 프로페셔널 계정과 `instagram_business_basic`, `instagram_business_manage_messages` 권한을 준비합니다. 앱 역할 밖의 계정 연동에는 Meta의 승인 범위가 적용됩니다.
2. 앱 설정에 `APP_URL/api/instagram/callback`을 리디렉션 URI로 등록합니다. 웹훅 URL은 `APP_URL/api/instagram/webhook`을 사용하고 `messages`를 구독합니다. 검증 토큰은 `META_WEBHOOK_VERIFY_TOKEN`으로 설정합니다. 웹훅 서명 키가 Instagram 앱 시크릿과 다르면 `META_WEBHOOK_APP_SECRET`을 설정합니다.
3. 관리자 화면에서 OAuth를 시작합니다. 콜백은 로그인 세션과 1회용 state를 확인하고 토큰을 암호화하여 저장합니다. 만료·연결 해제 후에는 재인증을 사용합니다.
4. 수신자가 연결 계정에 보낸 메시지의 서명된 웹훅을 받은 뒤, Meta가 반환한 사용자명으로 저장한 Instagram 프로필을 연결합니다. 24시간 응답 기간과 발신 권한이 유효한 대상만 API 큐에 들어갑니다. 발송 직전에 자격을 다시 검사합니다.
5. API 성공 응답에 메시지 ID와 대상 ID가 확인되면 `SENT`를 기록합니다. 네트워크 단절이나 워커 중단으로 결과가 모호하면 자동 재발송을 막고 관리자 확인 대상으로 표시합니다. 수동 발송은 관리자가 실제 완료를 기록합니다.

[Meta Send API 및 권한 문서](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-af579d08-121e-4897-8f45-5fd41ace49df)

## 입력 및 범위

- 팔로워·활동·참여율·카테고리·CRM·DM 조건은 내부 DB 필터입니다. 공식 API에서 얻을 수 있는 필드와 관리자 확인 값만 사용합니다.
- 기본 외부 검색은 공급자별 최대 25개 결과를 가져옵니다. 수동 등록 계정은 상세 화면에서 공개 지표를 근거 URL과 함께 기록할 수 있습니다. 참여율 자동 계산은 제공하지 않습니다.
- 링크 감지는 소개글과 입력·수집된 외부 HTTPS 링크의 도메인에 적용합니다. 링크 모음 및 단축 URL은 서버에서 열지 않습니다. 알려진 링크 모음 주소만 있고 근거가 부족하면 확인불가를 표시합니다.
- 성인 확인은 관리자가 신뢰할 수 있는 공개 근거를 확인하고 기록합니다. 공급자 게시물 목록은 성인 확인과 콘텐츠 검토를 마친 계정에 저장합니다. 분석 입력은 관리자가 직접 등록하고 승인한 게시물의 제목과 요약으로 한정합니다. AI가 검토 필요를 반환하면 해당 크리에이터를 보류로 전환합니다.
- AI 실행, SNS API의 실제 응답, Instagram OAuth·웹훅·공식 발송은 운영 자격 증명과 앱 승인을 설정한 환경에서 별도로 검증해야 합니다.
- 메시지 수신 및 읽음은 전송 완료와 별도 필드입니다. 현재 공식 웹훅은 수신 메시지와 답장 확인을 처리하며 수신 확인·읽음 이벤트의 동기화는 지원 범위에 포함되지 않습니다.
