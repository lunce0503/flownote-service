import type { ImageElement } from '@/entities/canvas';
import { authHeaders } from '@/shared/api';
import { isAbortError, type SerializableImageElement } from './canvasPersistenceModel';
import {
  CANVAS_SOCKET_UPLOAD_TIMEOUT_MS,
  emitCanvasSocket,
  type CanvasSocketAssetUpload,
} from './canvasSocketClient';

export type CanvasAssetUploadResponse = {
  id: string;
  objectKey: string;
  url: string;
  contentType: string;
  byteSize: number;
};

const uploadCanvasAssetViaSocket = async (socketUrl: string, file: File): Promise<CanvasAssetUploadResponse> => {
  const dataUrl = await readFileAsDataUrl(file);
  return await emitCanvasSocket<CanvasAssetUploadResponse>(socketUrl, "canvas:asset-upload", {
    authorization: authHeaders().Authorization,
    file: {
      dataUrl,
      name: file.name,
      contentType: file.type || "application/octet-stream",
    } satisfies CanvasSocketAssetUpload,
  }, {
    timeoutMs: CANVAS_SOCKET_UPLOAD_TIMEOUT_MS,
  });
};

const uploadCanvasAssetViaHttp = async (apiUrl: string, file: File): Promise<CanvasAssetUploadResponse> => {
  const formData = new FormData();
  formData.set("image", file);
  const response = await fetch(`${apiUrl}/api/canvas/assets`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return await response.json() as CanvasAssetUploadResponse;
};

export const uploadCanvasAsset = async (
  apiUrl: string,
  socketUrl: string,
  file: File,
): Promise<CanvasAssetUploadResponse | null> => {
  if (apiUrl) {
    try {
      return await uploadCanvasAssetViaHttp(apiUrl, file);
    } catch (error) {
      console.warn("HTTP 이미지 업로드 실패, 소켓 업로드로 재시도합니다:", error);
    }
  }
  if (!socketUrl) return null;
  return await uploadCanvasAssetViaSocket(socketUrl, file);
};

export const buildCanvasAssetProxyUrl = (apiUrl: string, assetId?: string) => (
  apiUrl && assetId ? `${apiUrl}/api/canvas/assets/${encodeURIComponent(assetId)}` : ""
);

const isCanvasAssetObjectKey = (objectKey?: string) => (
  Boolean(objectKey && objectKey.startsWith("canvas/") && !objectKey.includes(".."))
);

const extractCanvasAssetObjectKeyFromUrl = (url?: string) => {
  if (!url) return "";
  try {
    const parsedUrl = new URL(url);
    const objectKeyParam = parsedUrl.searchParams.get("objectKey") ?? "";
    if (isCanvasAssetObjectKey(objectKeyParam)) {
      return objectKeyParam;
    }
    const objectKey = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
    return isCanvasAssetObjectKey(objectKey) ? objectKey : "";
  } catch {
    return "";
  }
};

const buildCanvasAssetObjectKeyProxyUrl = (apiUrl: string, objectKey?: string) => (
  apiUrl && isCanvasAssetObjectKey(objectKey)
    ? `${apiUrl}/api/canvas/assets/by-key?objectKey=${encodeURIComponent(objectKey ?? "")}`
    : ""
);

const resolveCanvasImageUrl = (imageData: SerializableImageElement, apiUrl: string) => (
  buildCanvasAssetProxyUrl(apiUrl, imageData.assetId)
  || buildCanvasAssetObjectKeyProxyUrl(apiUrl, imageData.objectKey)
  || buildCanvasAssetObjectKeyProxyUrl(apiUrl, extractCanvasAssetObjectKeyFromUrl(imageData.url))
  || imageData.url
);

const resolveCanvasImageObjectKey = (imageData: SerializableImageElement) => (
  isCanvasAssetObjectKey(imageData.objectKey)
    ? imageData.objectKey
    : extractCanvasAssetObjectKeyFromUrl(imageData.url)
);

export const readFileAsDataUrl = (file: File): Promise<string> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("이미지를 data URL로 읽지 못했습니다."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  })
);

export const loadImage = (url: string, signal?: AbortSignal): Promise<HTMLImageElement> => (
  new Promise((resolve, reject) => {
    const image = new Image();
    const handleAbort = () => {
      image.src = "";
      reject(new DOMException("Image load aborted", "AbortError"));
    };
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = async () => {
      signal?.removeEventListener("abort", handleAbort);
      try {
        if ("decode" in image) {
          await image.decode();
        }
      } catch {
        // Safari may reject decode for already-loaded images; onload is enough here.
      }
      resolve(image);
    };
    image.onerror = () => {
      signal?.removeEventListener("abort", handleAbort);
      reject(new Error(`이미지 로드 실패: ${url}`));
    };
    image.src = url;
  })
);

export const hydrateImageElement = async (
  imageData: SerializableImageElement,
  apiUrl: string,
  signal?: AbortSignal,
): Promise<ImageElement> => {
  const resolvedObjectKey = resolveCanvasImageObjectKey(imageData);
  const preferredUrl = resolveCanvasImageUrl(imageData, apiUrl);
  try {
    const image = await loadImage(preferredUrl, signal);
    return { ...imageData, objectKey: resolvedObjectKey || imageData.objectKey, url: preferredUrl, image };
  } catch (error) {
    if (isAbortError(error)) throw error;
    console.warn("이미지 로드 실패:", preferredUrl, error);
    const isR2DirectUrl = Boolean(extractCanvasAssetObjectKeyFromUrl(imageData.url));
    if (imageData.url && imageData.url !== preferredUrl && !isR2DirectUrl) {
      try {
        const image = await loadImage(imageData.url, signal);
        return { ...imageData, objectKey: resolvedObjectKey || imageData.objectKey, image };
      } catch (fallbackError) {
        if (isAbortError(fallbackError)) throw fallbackError;
        console.warn("이미지 원본 fallback 로드 실패:", imageData.url, fallbackError);
      }
    }
    return { ...imageData, objectKey: resolvedObjectKey || imageData.objectKey, image: new Image() };
  }
};
