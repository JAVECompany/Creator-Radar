export const labels: Record<string, string> = {
  INSTAGRAM: "Instagram", YOUTUBE: "YouTube", TIKTOK: "TikTok", NAVER_BLOG: "네이버 블로그",
  COSPLAY: "코스프레", FASHION: "패션", MODEL: "모델", SWIMWEAR: "수영복", LINGERIE: "란제리", BODY_PROFILE: "바디프로필",
  ART_NUDE: "예술 누드", ADULT_ORIENTED_TEXT: "성인 대상 글", OTHER: "기타",
  CANDIDATE: "후보", REVIEWING: "검토 중", CONTACT_READY: "연락 준비", CONTACTED: "연락함", REPLIED: "답장 수신",
  INTERESTED: "관심 있음", DEMO: "데모", APPLIED: "신청", APPROVED: "승인", REJECTED: "거절",
  NOT_CONTACTED: "미발송", DRAFT: "초안", QUEUED: "전송 대기", SENDING: "전송 중", SENT: "API 전송 완료",
  MANUALLY_SENT: "수동 발송 완료", FAILED: "실패", NOT_ELIGIBLE: "수동 발송 필요", FOLLOW_UP: "후속 연락",
  PENDING: "대기", RUNNING: "진행 중", COMPLETED: "완료", CANCELLED: "취소", REVIEW: "검토 필요", HOLD: "보류", CLEARED: "검토 완료",
  UNKNOWN: "확인불가", NONE: "해당없음", DETECTED: "감지됨", UNVERIFIED: "미확인", VERIFIED: "성인 확인", EXCLUDED: "제외",
  DISCOVERY: "크리에이터 탐색", REFRESH: "공개 정보 갱신", ANALYSIS: "공개 콘텐츠 분석", SUBSCRIPTIONS: "팬 구독 플랫폼 검사", METRICS: "지표 갱신",
  DM_SEND: "Instagram DM", RETENTION: "보존 기한 처리", MANUAL: "관리자 입력", OFFICIAL_API: "공식 API",
  SUCCESS: "정상", PARTIAL: "일부 지원", NOT_SUPPORTED: "공식 API 미지원", AUTH_REQUIRED: "인증 필요", RATE_LIMITED: "요청 제한", UNAVAILABLE: "일시적 오류",
};
export function label(value: string) { return labels[value] ?? value; }
