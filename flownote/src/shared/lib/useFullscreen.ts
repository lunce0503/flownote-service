import { useCallback, useEffect, useState } from "react";

// 영상 플레이어의 전체 화면처럼 브라우저 UI(주소창·툴바)를 숨기는 Fullscreen API 훅.
// iPadOS Safari 등 webkit 프리픽스 구현을 폴백으로 지원한다.

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const currentFullscreenElement = () => {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
};

export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(() => (
    typeof document !== "undefined" && Boolean(currentFullscreenElement())
  ));

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(currentFullscreenElement()));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as FullscreenDocument;
    try {
      if (currentFullscreenElement()) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else doc.webkitExitFullscreen?.();
        return;
      }
      const root = document.documentElement as FullscreenRoot;
      if (root.requestFullscreen) await root.requestFullscreen();
      else root.webkitRequestFullscreen?.();
    } catch {
      // 미지원 브라우저·사용자 제스처 밖 호출은 조용히 무시한다(ESC로도 언제든 종료 가능).
    }
  }, []);

  return { isFullscreen, toggleFullscreen };
};
