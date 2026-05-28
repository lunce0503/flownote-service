import { useCallback, useEffect, useRef } from 'react';
import type { LineElement, ImageElement, TextBoxElement, CanvasLoadData, CanvasSavePayload } from '../../../entities/canvas/model/types';
import { v4 as uuidv4 } from 'uuid';
import type { Dispatch, SetStateAction } from 'react';
import { API_CORE_BASE_URL, authHeaders, resolveBrowserReachableUrl } from '../../../shared/api';
import { publishSyncEvent } from '../../../shared/sync';

// React.Dispatch 함수 타입을 명확히 정의
type SetLines = Dispatch<SetStateAction<LineElement[]>>;
type SetImages = Dispatch<SetStateAction<ImageElement[]>>;
type SetTextBoxes = Dispatch<SetStateAction<TextBoxElement[]>>;
type SerializableImageElement = Omit<ImageElement, "image">;
type CanvasLocalDraft = {
  lines: LineElement[];
  images: SerializableImageElement[];
  textBoxes: TextBoxElement[];
  updatedAt: number;
  hasPendingChanges: boolean;
};

const createHeaders = (contentType?: string) => {
  const headers = new Headers();
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  Object.entries(authHeaders()).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return headers;
};

const EMPTY_CANVAS_DATA: CanvasLoadData = {
  lines: [],
  images: [],
  textBoxes: [],
};

const normalizeCanvasLoadData = (data: unknown): CanvasLoadData => {
  if (!data || typeof data !== "object") {
    return EMPTY_CANVAS_DATA;
  }

  const record = data as Partial<CanvasLoadData>;

  return {
    lines: Array.isArray(record.lines) ? record.lines : [],
    images: Array.isArray(record.images) ? record.images : [],
    textBoxes: Array.isArray(record.textBoxes) ? record.textBoxes : [],
  };
};

const serializeLine = ({ status: _status, ...line }: LineElement) => line;

const serializeImage = ({ image: _image, status: _status, ...image }: ImageElement) => image;

const serializeTextBox = ({ status: _status, ...textBox }: TextBoxElement) => textBox;

const buildDeletedElement = <T extends { id: string }>(element: T) => ({ id: element.id } as Omit<T, "status">);

const buildCanvasSavePayload = (
  drawnLines: LineElement[],
  images: ImageElement[],
  textBoxes: TextBoxElement[],
): CanvasSavePayload => ({
  addedLines: drawnLines.filter((line) => line.status === "new").map(serializeLine),
  modifiedLines: drawnLines.filter((line) => line.status === "modified").map(serializeLine),
  deletedLines: drawnLines.filter((line) => line.status === "deleted").map(buildDeletedElement),

  addedImages: images.filter((image) => image.status === "new").map(serializeImage),
  modifiedImages: images.filter((image) => image.status === "modified").map(serializeImage),
  deletedImages: images.filter((image) => image.status === "deleted").map(buildDeletedElement),

  addedTextBoxes: textBoxes.filter((textBox) => textBox.status === "new").map(serializeTextBox),
  modifiedTextBoxes: textBoxes.filter((textBox) => textBox.status === "modified").map(serializeTextBox),
  deletedTextBoxes: textBoxes.filter((textBox) => textBox.status === "deleted").map(buildDeletedElement),
});

const hasCanvasSavePayloadChanges = (payload: CanvasSavePayload) => (
  Object.values(payload).some((items) => Array.isArray(items) && items.length > 0)
);

const buildCanvasSaveUrl = (apiUrl: string, canvasId?: string | null) => {
  const canvasQuery = canvasId ? `?canvasId=${encodeURIComponent(canvasId)}` : "";
  return `${apiUrl}/api/canvas/elements/save${canvasQuery}`;
};

type CanvasAssetUploadResponse = {
  id: string;
  objectKey: string;
  url: string;
  contentType: string;
  byteSize: number;
};

const uploadCanvasAsset = async (apiUrl: string, file: File): Promise<CanvasAssetUploadResponse> => {
  const formData = new FormData();
  formData.set("image", file);
  const res = await fetch(`${apiUrl}/api/canvas/assets`, {
    method: "POST",
    headers: createHeaders(),
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return await res.json() as CanvasAssetUploadResponse;
};

const buildCanvasAssetProxyUrl = (apiUrl: string, assetId?: string) => (
  apiUrl && assetId ? `${apiUrl}/api/canvas/assets/${encodeURIComponent(assetId)}` : ""
);

const readFileAsDataUrl = (file: File): Promise<string> => (
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

const loadImage = (url: string): Promise<HTMLImageElement> => (
  new Promise((resolve, reject) => {
    const image = new Image();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = async () => {
      try {
        if ("decode" in image) {
          await image.decode();
        }
      } catch {
        // Safari may reject decode for already-loaded images; onload is enough here.
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
    image.src = url;
  })
);

const getCanvasLocalDraftKey = (canvasId?: string | null) => `flownote.canvas.localDraft.${canvasId ?? "default"}`;

const serializeCanvasDraft = (
  drawnLines: LineElement[],
  images: ImageElement[],
  textBoxes: TextBoxElement[],
): CanvasLocalDraft => ({
  lines: drawnLines,
  images: images.map(serializeImage),
  textBoxes,
  updatedAt: Date.now(),
  hasPendingChanges: [...drawnLines, ...images, ...textBoxes].some((item) => item.status && item.status !== "unchanged"),
});

const readCanvasLocalDraft = (canvasId?: string | null): CanvasLocalDraft | null => {
  try {
    const raw = window.localStorage.getItem(getCanvasLocalDraftKey(canvasId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<CanvasLocalDraft>;
    if (!Array.isArray(draft.lines) || !Array.isArray(draft.images) || !Array.isArray(draft.textBoxes)) {
      return null;
    }
    return {
      lines: draft.lines,
      images: draft.images,
      textBoxes: draft.textBoxes,
      updatedAt: typeof draft.updatedAt === "number" ? draft.updatedAt : 0,
      hasPendingChanges: Boolean(draft.hasPendingChanges),
    };
  } catch (error) {
    console.warn("로컬 캔버스 초안 읽기 실패:", error);
    return null;
  }
};

const writeCanvasLocalDraft = (canvasId: string | null | undefined, draft: CanvasLocalDraft) => {
  try {
    window.localStorage.setItem(getCanvasLocalDraftKey(canvasId), JSON.stringify(draft));
  } catch (error) {
    console.warn("로컬 캔버스 초안 저장 실패:", error);
  }
};

const hydrateImageElement = async (imageData: SerializableImageElement, apiUrl: string): Promise<ImageElement> => {
  try {
    const image = await loadImage(imageData.url);
    return { ...imageData, image };
  } catch (error) {
    console.warn("이미지 로드 실패:", imageData.url, error);
    const fallbackUrl = buildCanvasAssetProxyUrl(apiUrl, imageData.assetId);
    if (fallbackUrl && fallbackUrl !== imageData.url) {
      try {
        const image = await loadImage(fallbackUrl);
        return { ...imageData, url: fallbackUrl, image };
      } catch (fallbackError) {
        console.warn("이미지 프록시 fallback 로드 실패:", fallbackUrl, fallbackError);
      }
    }
    return { ...imageData, image: new Image() };
  }
};

const applyServerCanvasStatus = (data: CanvasLoadData): CanvasLocalDraft => ({
  lines: (data.lines ?? []).map((line) => ({ ...line, status: "unchanged" })),
  images: (data.images ?? []).map((image) => ({ ...image, status: "unchanged" })),
  textBoxes: (data.textBoxes ?? []).map((textBox) => ({ ...textBox, status: "unchanged" })),
  updatedAt: Date.now(),
  hasPendingChanges: false,
});

export const usePersistence = (
  drawnLines: LineElement[],
  images: ImageElement[],
  textBoxes: TextBoxElement[],
  setDrawnLines: SetLines,
  setImages: SetImages,
  setTextBoxes: SetTextBoxes,
  canvasId?: string | null,
) => {

  const CANVAS_API_URL = resolveBrowserReachableUrl(import.meta.env.VITE_CANVAS_API_URL) || API_CORE_BASE_URL;

  const drawnLinesRef = useRef(drawnLines);
  const imagesRef = useRef(images);
  const textBoxesRef = useRef(textBoxes);
  const canvasIdRef = useRef(canvasId);
  const localRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveAgainRequestedRef = useRef(false);

  useEffect(() => {
    drawnLinesRef.current = drawnLines;
    imagesRef.current = images;
    textBoxesRef.current = textBoxes;
    canvasIdRef.current = canvasId;
    localRevisionRef.current += 1;
    writeCanvasLocalDraft(canvasId, serializeCanvasDraft(drawnLines, images, textBoxes));
  }, [canvasId, drawnLines, images, textBoxes]);

  const applyCanvasDraft = useCallback(async (draft: CanvasLocalDraft) => {
    const hydratedImages = await Promise.all(draft.images.map((image) => hydrateImageElement(image, CANVAS_API_URL)));
    setDrawnLines(draft.lines);
    setImages(hydratedImages);
    setTextBoxes(draft.textBoxes);
  }, [CANVAS_API_URL, setDrawnLines, setImages, setTextBoxes]);

  const fetchCanvasData = useCallback(async (): Promise<CanvasLoadData> => {
    if (!CANVAS_API_URL) throw new Error("캔버스 API 기본 URL이 설정되지 않았습니다.");
    const canvasQuery = canvasIdRef.current ? `?canvasId=${encodeURIComponent(canvasIdRef.current)}` : "";
    const [metadataRes, elementsRes] = await Promise.all([
      fetch(`${CANVAS_API_URL}/api/canvas/metadata${canvasQuery}`, {
        headers: createHeaders(),
      }),
      fetch(`${CANVAS_API_URL}/api/canvas/elements${canvasQuery}`, {
        headers: createHeaders(),
      }),
    ]);
    if (!metadataRes.ok) throw new Error("캔버스 메타데이터 로드 실패");
    if (!elementsRes.ok) throw new Error("캔버스 요소 로드 실패");
    const elementsContentType = elementsRes.headers.get("content-type") ?? "";
    if (!elementsContentType.includes("application/json")) {
      throw new Error(`캔버스 요소 API가 JSON이 아닌 응답을 반환했습니다: ${elementsContentType}`);
    }
    const metadata = await metadataRes.json();
    const elements = normalizeCanvasLoadData(await elementsRes.json());
    return {
      id: typeof metadata.id === "string" ? metadata.id : undefined,
      title: typeof metadata.title === "string" ? metadata.title : undefined,
      ...elements,
    };
  }, [CANVAS_API_URL]);

  const fetchLegacyCanvasData = useCallback(async (): Promise<CanvasLoadData> => {
    if (!CANVAS_API_URL) throw new Error("캔버스 API 기본 URL이 설정되지 않았습니다.");
    const canvasQuery = canvasIdRef.current ? `?canvasId=${encodeURIComponent(canvasIdRef.current)}` : "";
    const res = await fetch(`${CANVAS_API_URL}/api/canvas/load${canvasQuery}`, {
      headers: createHeaders(),
    });
    if (!res.ok) throw new Error("데이터 로드 실패");
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`캔버스 API가 JSON이 아닌 응답을 반환했습니다: ${contentType}`);
    }
    return normalizeCanvasLoadData(await res.json());
  }, [CANVAS_API_URL]);

  const handleSave = useCallback(async () => {
    if (!CANVAS_API_URL) {
      console.warn("캔버스 API 기본 URL이 설정되지 않아 저장을 건너뜁니다.");
      return;
    }

    if (saveInFlightRef.current) {
      saveAgainRequestedRef.current = true;
      return;
    }

    saveInFlightRef.current = true;

    try {
      do {
        saveAgainRequestedRef.current = false;

        const payload = buildCanvasSavePayload(drawnLinesRef.current, imagesRef.current, textBoxesRef.current);
        if (!hasCanvasSavePayloadChanges(payload)) return;

        const revisionAtSaveStart = localRevisionRef.current;
        const res = await fetch(buildCanvasSaveUrl(CANVAS_API_URL, canvasIdRef.current), {
          method: "POST",
          headers: createHeaders("application/json"),
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }

        if (localRevisionRef.current !== revisionAtSaveStart) {
          saveAgainRequestedRef.current = true;
          continue;
        }

        console.log("Canvas data saved successfully!");
        void publishSyncEvent("canvas", "canvas-saved");
        console.log("저장된 데이터:", payload);
        setDrawnLines(prev => prev
          .filter(line => line.status !== 'deleted')
          .map(line => ({ ...line, status: 'unchanged' })));
        setImages(prev => prev
          .filter(image => image.status !== 'deleted')
          .map(image => ({ ...image, status: 'unchanged' })));
        setTextBoxes(prev => prev
          .filter(textBox => textBox.status !== 'deleted')
          .map(textBox => ({ ...textBox, status: 'unchanged' })));
      } while (saveAgainRequestedRef.current);
    } catch (err) {
      console.error("저장 실패:", err);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [CANVAS_API_URL, setDrawnLines, setImages, setTextBoxes]);

  const handleFlushSave = useCallback(() => {
    if (!CANVAS_API_URL) return;

    writeCanvasLocalDraft(canvasIdRef.current, serializeCanvasDraft(drawnLinesRef.current, imagesRef.current, textBoxesRef.current));
    const payload = buildCanvasSavePayload(drawnLinesRef.current, imagesRef.current, textBoxesRef.current);
    if (!hasCanvasSavePayloadChanges(payload)) return;

    const body = JSON.stringify(payload);
    const supportsKeepalive = body.length <= 60_000;

    if (saveInFlightRef.current) {
      saveAgainRequestedRef.current = true;
    }

    void fetch(buildCanvasSaveUrl(CANVAS_API_URL, canvasIdRef.current), {
      method: "POST",
      headers: createHeaders("application/json"),
      body,
      keepalive: supportsKeepalive,
    }).catch((error) => {
      console.error("페이지 이탈 전 캔버스 저장 실패:", error);
    });
  }, [CANVAS_API_URL]);


  const handleLoad = useCallback(async () => {
    const localDraft = readCanvasLocalDraft(canvasId);
    try {
      if (!CANVAS_API_URL) {
        console.warn("캔버스 API 기본 URL이 설정되지 않아 빈 캔버스를 사용합니다.");
        if (localDraft) {
          await applyCanvasDraft(localDraft);
          return;
        }
        setDrawnLines([]);
        setImages([]);
        setTextBoxes([]);
        return;
      }

      let data: CanvasLoadData;
      try {
        data = await fetchCanvasData();
      } catch (splitApiError) {
        console.warn("분리된 캔버스 API 로드 실패, 기존 /load로 재시도합니다.", splitApiError);
        data = await fetchLegacyCanvasData();
      }
      console.log("불러온 데이터:", data);

      if (localDraft?.hasPendingChanges) {
        await applyCanvasDraft(localDraft);
        return;
      }

      await applyCanvasDraft(applyServerCanvasStatus(data));

      console.log("캔버스 데이터 로드 및 적용 완료.");
    } catch (error) {
      console.error("불러오기 실패:", error);
      if (localDraft) {
        await applyCanvasDraft(localDraft);
        return;
      }
      setDrawnLines([]);
      setImages([]);
      setTextBoxes([]);
    }
  }, [CANVAS_API_URL, applyCanvasDraft, canvasId, fetchCanvasData, fetchLegacyCanvasData, setDrawnLines, setImages, setTextBoxes]);


  const addImageFile = useCallback(async (
    file: File,
    placementCenter?: { x: number; y: number },
  ) => {
    if (!file) return;

    try {
      const uploadedAsset = CANVAS_API_URL ? await uploadCanvasAsset(CANVAS_API_URL, file) : null;
      const imageUrl = uploadedAsset?.url ?? await readFileAsDataUrl(file);
      let normalizedImageUrl = imageUrl;
      let img: HTMLImageElement;
      try {
        img = await loadImage(imageUrl);
      } catch (error) {
        const fallbackUrl = buildCanvasAssetProxyUrl(CANVAS_API_URL, uploadedAsset?.id);
        if (!fallbackUrl) throw error;
        img = await loadImage(fallbackUrl);
        normalizedImageUrl = fallbackUrl;
      }
      const imgElement: ImageElement = {
        id: uuidv4(), // 이미지에도 고유 ID 부여
        image: img,
        url: normalizedImageUrl,
        assetId: uploadedAsset?.id,
        objectKey: uploadedAsset?.objectKey,
        contentType: uploadedAsset?.contentType,
        byteSize: uploadedAsset?.byteSize,
        x: 0,
        y: 0,
        width: img.width * 0.5,
        height: img.height * 0.5,
        status: 'new' // 새로 추가된 상태
      };
      const center = placementCenter ?? { x: 100 + imgElement.width / 2, y: 100 + imgElement.height / 2 };
      imgElement.x = center.x - imgElement.width / 2;
      imgElement.y = center.y - imgElement.height / 2;
      setImages(prev => [...prev, imgElement]);
    } catch (err) {
      console.error("업로드 실패:", err);
      // alert("이미지 업로드 실패");
    }
  }, [CANVAS_API_URL, setImages]);

  const handleImageUpload = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    placementCenter?: { x: number; y: number },
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await addImageFile(file, placementCenter);
    e.target.value = "";
  }, [addImageFile]);

  return { handleSave, handleLoad, handleImageUpload, addImageFile, handleFlushSave };
};
