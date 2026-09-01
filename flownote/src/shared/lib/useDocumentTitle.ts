import { useEffect, useRef } from "react";

type TitleOwner = {
  title: string;
  priority: number;
  order: number;
};

const DEFAULT_TITLE = "홈";
const titleOwners = new Map<symbol, TitleOwner>();
let nextOrder = 0;

export const formatDocumentTitle = (feature: string, detail?: string | null) => {
  const normalizedFeature = feature.trim() || DEFAULT_TITLE;
  const normalizedDetail = detail?.trim();
  return normalizedDetail ? `${normalizedFeature}-${normalizedDetail}` : normalizedFeature;
};

const applyDocumentTitle = () => {
  const owner = Array.from(titleOwners.values()).sort((left, right) => (
    right.priority - left.priority || right.order - left.order
  ))[0];
  document.title = owner?.title ?? DEFAULT_TITLE;
};

export const useDocumentTitle = (
  feature: string,
  detail?: string | null,
  priority = 10,
) => {
  const ownerIdRef = useRef(Symbol("document-title-owner"));
  const title = formatDocumentTitle(feature, detail);

  useEffect(() => {
    const ownerId = ownerIdRef.current;
    titleOwners.set(ownerId, { title, priority, order: nextOrder++ });
    applyDocumentTitle();

    return () => {
      titleOwners.delete(ownerId);
      applyDocumentTitle();
    };
  }, [priority, title]);
};

export const getRouteDocumentTitle = (pathname: string): [string, string?] => {
  if (pathname === "/") return ["홈"];
  if (pathname === "/blog") return ["게시글", "목록"];
  if (pathname.startsWith("/blog/")) return ["게시글", "문서"];
  if (pathname === "/canvas") return ["그림판", "목록"];
  if (pathname.startsWith("/canvas/")) return ["그림판", "캔버스"];
  if (pathname === "/planner") return ["플래너", new Date().toISOString().slice(0, 10)];
  if (pathname.startsWith("/social")) return ["소셜", "대화"];
  if (pathname.startsWith("/agent")) return ["AI 에이전트", "작업공간"];
  if (pathname.startsWith("/stocks/chart")) return ["주식", "차트"];
  if (pathname.startsWith("/stocks")) return ["주식", "대시보드"];
  if (pathname.startsWith("/settings")) return ["설정", "계정"];
  if (pathname.startsWith("/admin/canvas")) return ["캔버스 관리", "목록"];
  if (pathname.startsWith("/admin/feedback")) return ["피드백 관리", "목록"];
  if (pathname.startsWith("/login")) return ["로그인"];
  if (pathname.startsWith("/signup")) return ["회원가입"];
  if (pathname.startsWith("/banpick")) return ["밴픽", "도구"];
  if (pathname.startsWith("/screw-puzzle")) return ["나사 퍼즐", "게임"];
  if (pathname.startsWith("/magic")) return ["Magic", "도구"];
  return ["홈"];
};
