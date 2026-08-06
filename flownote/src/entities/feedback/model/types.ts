// 사용자 피드백 도메인. 백엔드(flownote-serve)는 snake_case로 응답한다.

export type FeedbackItem = {
  id: string;
  category: string;
  message: string;
  contact: string;
  status: string;
  created_at: string;
  /** 관리자 전체 조회에서만 채워진다. */
  user_id?: string;
};

export type FeedbackInput = {
  category: string;
  message: string;
  contact: string;
};

export const FEEDBACK_CATEGORIES = [
  "사용 어려움",
  "오류 제보",
  "기능 제안",
  "성능 문제",
  "기타",
] as const;
