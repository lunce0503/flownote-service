import axios from "axios";
import { API_CORE_BASE_URL, authHeaders, resolveBrowserReachableUrl } from "@/shared/api";
import { publishSyncEvent } from "@/shared/lib/sync";
import type { CanvasDocumentSummary, CanvasFolder, CanvasFolderPayload } from "../model/types";

type CanvasFolderResponse = Omit<CanvasFolder, "canvasIds"> & {
  canvas_ids?: string[];
  canvasIds?: string[];
};

const normalizeFolder = (folder: CanvasFolderResponse): CanvasFolder => ({
  ...folder,
  canvasIds: folder.canvasIds ?? folder.canvas_ids ?? [],
});

// 캔버스 문서·폴더 API는 Go 캔버스 백엔드(flownote-canvas)가 소유한다(Spring에서 이관).
const CANVAS_LIBRARY_BASE_URL = resolveBrowserReachableUrl(import.meta.env.VITE_CANVAS_API_URL) || API_CORE_BASE_URL || "";

const requireCanvasApiUrl = () => {
  if (!CANVAS_LIBRARY_BASE_URL) {
    throw new Error("캔버스 API 기본 URL이 설정되지 않았습니다.");
  }
  return CANVAS_LIBRARY_BASE_URL;
};

const toFolderRequestBody = (payload: Partial<CanvasFolderPayload>) => ({
  ...payload,
  canvas_ids: payload.canvasIds,
  canvasIds: undefined,
});

const getCanvasDocuments = async (): Promise<CanvasDocumentSummary[]> => {
  const response = await axios.get<CanvasDocumentSummary[]>(`${requireCanvasApiUrl()}/api/canvas/documents`, {
    headers: authHeaders(),
  });
  return Array.isArray(response.data) ? response.data : [];
};

const createCanvasDocument = async (title: string): Promise<CanvasDocumentSummary> => {
  const response = await axios.post<CanvasDocumentSummary>(`${requireCanvasApiUrl()}/api/canvas/documents`, { title }, {
    headers: authHeaders(),
  });
  void publishSyncEvent("canvas", "canvas-document-created");
  return response.data;
};

const updateCanvasDocument = async (canvasId: string, title: string): Promise<CanvasDocumentSummary> => {
  const response = await axios.patch<CanvasDocumentSummary>(`${requireCanvasApiUrl()}/api/canvas/documents/${canvasId}`, { title }, {
    headers: authHeaders(),
  });
  void publishSyncEvent("canvas", "canvas-document-updated");
  return response.data;
};

const deleteCanvasDocument = async (canvasId: string) => {
  await axios.delete(`${requireCanvasApiUrl()}/api/canvas/documents/${canvasId}`, {
    headers: authHeaders(),
  });
  void publishSyncEvent("canvas", "canvas-document-deleted");
};

const getCanvasFolders = async (): Promise<CanvasFolder[]> => {
  const response = await axios.get<CanvasFolderResponse[]>(`${requireCanvasApiUrl()}/api/canvas/folders`, {
    headers: authHeaders(),
  });
  return Array.isArray(response.data) ? response.data.map(normalizeFolder) : [];
};

const createCanvasFolder = async (payload: CanvasFolderPayload): Promise<CanvasFolder> => {
  const response = await axios.post<CanvasFolderResponse>(`${requireCanvasApiUrl()}/api/canvas/folders`, toFolderRequestBody(payload), {
    headers: authHeaders(),
  });
  void publishSyncEvent("canvas", "canvas-folder-created");
  return normalizeFolder(response.data);
};

const updateCanvasFolder = async (folderId: string, payload: Partial<CanvasFolderPayload>): Promise<CanvasFolder> => {
  const response = await axios.patch<CanvasFolderResponse>(`${requireCanvasApiUrl()}/api/canvas/folders/${folderId}`, toFolderRequestBody(payload), {
    headers: authHeaders(),
  });
  void publishSyncEvent("canvas", "canvas-folder-updated");
  return normalizeFolder(response.data);
};

const deleteCanvasFolder = async (folderId: string) => {
  await axios.delete(`${requireCanvasApiUrl()}/api/canvas/folders/${folderId}`, {
    headers: authHeaders(),
  });
  void publishSyncEvent("canvas", "canvas-folder-deleted");
};

const addCanvasToFolder = async (folderId: string, canvasId: string): Promise<CanvasFolder> => {
  const response = await axios.post<CanvasFolderResponse>(`${requireCanvasApiUrl()}/api/canvas/folders/${folderId}/documents/${canvasId}`, null, {
    headers: authHeaders(),
  });
  void publishSyncEvent("canvas", "canvas-folder-document-added");
  return normalizeFolder(response.data);
};

const removeCanvasFromFolder = async (folderId: string, canvasId: string): Promise<CanvasFolder> => {
  const response = await axios.delete<CanvasFolderResponse>(`${requireCanvasApiUrl()}/api/canvas/folders/${folderId}/documents/${canvasId}`, {
    headers: authHeaders(),
  });
  void publishSyncEvent("canvas", "canvas-folder-document-removed");
  return normalizeFolder(response.data);
};

export {
  addCanvasToFolder,
  createCanvasDocument,
  createCanvasFolder,
  deleteCanvasDocument,
  deleteCanvasFolder,
  getCanvasDocuments,
  getCanvasFolders,
  removeCanvasFromFolder,
  updateCanvasDocument,
  updateCanvasFolder,
};
