# 공식 API 연동 범위

각 어댑터는 정상, 일부 지원, 인증 필요, 미지원, 요청 제한, 일시적 장애 및 실패 상태를 반환합니다. 연결 성공 여부는 관리자 작업 화면에서 실제 호출 결과로 확인합니다. 모든 SNS는 공개 프로필 URL 수동 등록을 지원합니다.

| 공급자 | 구현한 호출 | 연동 준비와 제한 |
| --- | --- | --- |
| YouTube | Data API 채널 키워드 검색, ID·핸들로 채널 조회, 공개 구독자 수와 업로드 목록 | `YOUTUBE_API_KEY`. 지역 코드는 결과 지역 조건이며 계정 국가를 증명하지 않습니다. 구독자 숨김은 결측입니다. 제공 메타데이터에 보존 기한을 적용하고 제공 데이터는 팬 분류와 적합도 계산에서 제외합니다. [API 레퍼런스](https://developers.google.com/youtube/data/reference/rest) · [개발자 정책](https://developers.google.com/youtube/terms/developer-policies) |
| NAVER Blog | NAVER API HUB 검색 결과의 공개 글과 식별 가능한 네이버 블로그 작성자 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`. 검색 결과 저장과 CRM 사용이 계약상 허용되는 경우에만 `NAVER_PERSISTENCE_APPROVED=true`. 검색 API에서 제공하지 않는 독립 프로필·팔로워 통계는 결측입니다. [블로그 검색](https://api.ncloud-docs.com/docs/naver-api-hub-search-blog) · [이관 안내](https://developers.naver.com/notice/article/32530) |
| Instagram 탐색 | Facebook Login의 Business Discovery로 정확한 사용자명의 프로페셔널 계정 조회 | `IG_DISCOVERY_TOKEN`, `IG_DISCOVERY_ACCOUNT_ID`, `META_GRAPH_VERSION`. 연결된 Facebook Page, 대상 API 권한 및 필요한 App Review를 확인합니다. 일반 계정 및 키워드 탐색은 수동 등록을 사용합니다. [Meta Instagram API](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api) |
| TikTok | 동의한 단일 계정의 Display API 공개 프로필 및 승인 범위 내 영상·팔로워 수 | `TIKTOK_ACCESS_TOKEN`, `TIKTOK_SCOPES`. `user.info.basic`과 `user.info.profile`이 필요하며 영상에는 `video.list`, 팔로워에는 `user.info.stats`가 필요합니다. 토큰 교체는 운영자가 관리합니다. 일반 계정 검색은 수동 등록을 사용합니다. [Display API](https://developers.tiktok.com/docs/en/display-api-get-started) · [스코프](https://developers.tiktok.com/bulletin/user-info-scope-migration) |
| AI 분석 | 공개 게시물 주제 분류 및 신뢰도·근거·모델 기록 | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`. 모델은 Chat Completions의 JSON 응답을 지원해야 합니다. 관리자 검토를 거친 게시물의 텍스트 메타데이터만 전달합니다. |

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
