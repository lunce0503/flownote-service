import { useCallback } from 'react';
import type { LineElement, ImageElement, TextBoxElement, CanvasLoadData, CanvasSavePayload } from '../types/types';
import { v4 as uuidv4 } from 'uuid';
import type { Dispatch, SetStateAction } from 'react';
import { API_BASE_URL, API_BASE_URL2, authHeaders } from '../../../../shared/api';

// React.Dispatch 함수 타입을 명확히 정의
type SetLines = Dispatch<SetStateAction<LineElement[]>>;
type SetImages = Dispatch<SetStateAction<ImageElement[]>>;
type SetTextBoxes = Dispatch<SetStateAction<TextBoxElement[]>>;

export const usePersistence = (
  drawnLines: LineElement[],
  images: ImageElement[],
  textBoxes: TextBoxElement[],
  setDrawnLines: SetLines,
  setImages: SetImages,
  setTextBoxes: SetTextBoxes
) => {

  const CANVAS_API_URL = import.meta.env.VITE_CANVAS_API_URL || API_BASE_URL2;
  const UPLOAD_API_URL = import.meta.env.VITE_UPLOAD_API_URL || API_BASE_URL;

  const handleSave = useCallback(async () => {
    const lineData = drawnLines.map(line => {
      if (line.status === 'deleted') return {
        id: line.id,
        status: 'deleted' // 삭제된 상태로 표시
      };
      if (line.status === 'unchanged') {
        return {
          id: line.id,
          points: line.points
        };
      } else if (line.status === 'new' || line.status === 'modified') {
        return {
          id: line.id,
          points: line.points,
          status: line.status
        };
      }
    }).filter(Boolean) as LineElement[]; // null 제거

    const imageData = images.map(img => {
      if (img.status === 'deleted') {
        return {
          id: img.id,
          status: 'deleted' // 삭제된 상태로 표시
        };
      }
      if (img.status === 'unchanged') {
        return {
          id: img.id,
          x: img.x, y: img.y, width: img.width, height: img.height,
          url: img.url // URL 포함
        };
      } else if (img.status === 'new' || img.status === 'modified') {
        return {
          id: img.id,
          x: img.x, y: img.y, width: img.width, height: img.height,
          url: img.url, // URL 포함
          status: img.status
        };
      }
    }).filter(Boolean) as ImageElement[]; // null 제거

    const textData = textBoxes.map(box => {
      if (box.status === 'deleted') {
        return{
          id: box.id,
          status: 'deleted' // 삭제된 상태로 표시
        } ;
      }
      if (box.status === 'unchanged') {
        return {
          id: box.id,
          text: box.text,
          x: box.x, y: box.y,
          width: box.width, height: box.height
        };
      } else if (box.status === 'new' || box.status === 'modified') {
        return {
          id: box.id,
          text: box.text,
          x: box.x, y: box.y,
          width: box.width, height: box.height,
          status: box.status
        };
      }
    }).filter(Boolean) as TextBoxElement[]; // null 제거

    const payload: CanvasSavePayload = {
      addedLines: lineData.filter(line => line.status === 'new'),
      modifiedLines: lineData.filter(line => line.status === 'modified'), 
      deletedLines: lineData.filter(line => line.status === 'deleted'),

      addedImages: imageData.filter(img => img.status === 'new'),
      modifiedImages: imageData.filter(img => img.status === 'modified'),
      deletedImages: imageData.filter(img => img.status === 'deleted'),

      addedTextBoxes: textData.filter(box => box.status === 'new'),
      modifiedTextBoxes: textData.filter(box => box.status === 'modified'),
      deletedTextBoxes: textData.filter(box => box.status === 'deleted'),
    };

    try {
      const res = await fetch(`${CANVAS_API_URL}/api/canvas/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }
      console.log("Canvas data saved successfully!");
      console.log("저장된 데이터:", payload);
    } catch (err) {
      console.error("저장 실패:", err);
    }
  }, [drawnLines, images, textBoxes, CANVAS_API_URL]);


  const handleLoad = useCallback(async () => {
    try {
      const res = await fetch(`${CANVAS_API_URL}/api/canvas/load`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("데이터 로드 실패");
      const data: CanvasLoadData = await res.json();
      console.log("불러온 데이터:", data);

      // 기존 데이터 클리어 (부분 업데이트 후에는 필요 없을 수 있음)
      setDrawnLines([]);
      setImages([]);
      setTextBoxes([]);

      const loadedLines: LineElement[] = (data.lines ?? []).map(line => ({
        id: line.id,
        points: line.points,
        status: 'unchanged' // 로드된 데이터는 'unchanged' 상태로 초기화
      }));

      // 이미지 변환: Promise.all로 병렬 처리하여 로드 지연 감소
      const loadedImgs: ImageElement[] = await Promise.all(
        (data.images ?? []).map((imgData: any) => {
          return new Promise<ImageElement>((resolve) => {
            const image = new Image();
            image.onload = () => {
              resolve({
                id: imgData.id,
                image,
                url: imgData.url, // URL도 함께 저장
                x: imgData.x, y: imgData.y, width: imgData.width, height: imgData.height,
                status: 'unchanged'
              });
            };
            image.onerror = () => {
              console.warn("이미지 로드 실패:", imgData.url);
              resolve({
                id: imgData.id,
                image: new Image(), // 실패 시 빈 이미지
                url: imgData.url,
                x: imgData.x, y: imgData.y, width: imgData.width, height: imgData.height,
                status: 'unchanged'
              });
            };
            image.src = imgData.url;
          });
        })
      );

      const loadedTextBoxes: TextBoxElement[] = (data.textBoxes ?? []).map((t: any) => ({
        id: t.id,
        text: t.text ?? t.content,
        x: t.x, y: t.y,
        width: t.width, height: t.height,
        status: 'unchanged'
      }));

      setDrawnLines(loadedLines);
      setImages(loadedImgs);
      setTextBoxes(loadedTextBoxes);

      console.log("캔버스 데이터 로드 및 적용 완료.");
    } catch (error) {
      console.error("불러오기 실패:", error);
    }
  }, [CANVAS_API_URL, setDrawnLines, setImages, setTextBoxes]);


  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch(`${UPLOAD_API_URL}/api/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      if (!res.ok) throw new Error("이미지 업로드 실패");

      const data = await res.json();
      const imageUrl = `${UPLOAD_API_URL}/uploads/${data.filename}`;

      const img = new Image();
      img.onload = () => {
        const imgElement: ImageElement = {
          id: uuidv4(), // 이미지에도 고유 ID 부여
          image: img,
          url: imageUrl, // URL도 저장
          x: 100, y: 100,
          width: img.width * 0.5,
          height: img.height * 0.5,
          status: 'new' // 새로 추가된 상태
        };
        setImages(prev => [...prev, imgElement]);
      };
      img.src = imageUrl;
    } catch (err) {
      console.error("업로드 실패:", err);
      // alert("이미지 업로드 실패");
    }
  }, [UPLOAD_API_URL, setImages]);

  return { handleSave, handleLoad, handleImageUpload };
};
