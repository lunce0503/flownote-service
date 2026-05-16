import React,{useRef, useEffect, useState} from "react";
import { useCanvasState } from '../hooks/useCanvasState';
import { useDrawing } from '../hooks/useDrawing';
import { useElementManipulation } from '../hooks/useElementManipulation';
import { usePersistence } from '../hooks/usePersistence';
import { useCanvasRendering } from '../hooks/useCanvasRendering';
import { Toolbar } from './Toolbar';
import '../index.css';
import type { Point, LineElement } from '../types/types';
import { v4 as uuidv4 } from 'uuid';

const Canvas = () => {
    const canvasRef = useRef<HTMLCanvasElement|null>(null);

    // 1. 기본 상태 관리 - 오프셋, 스케일, 도구
    const { 
        offset, setOffset,
        scale, setScale,
        tool, setTool, 
        getCanvasCoords 
    } = useCanvasState(canvasRef);

    // 2. 선 그리기 로직 관리
    const {
        isDrawing,setIsDrawing,
        drawnLines,setDrawnLines,
        currentLine,eraseAtPointer,
    } = useDrawing(getCanvasCoords, tool);

    // 3. 이미지/텍스트 이동 관련 로직 관리 
    // 추후에 이미지/텍스트 크기 조절 기능 추가 가능
    const {
        images,setImages,
        textBoxes,setTextBoxes,
        movingObject,setMovingObject,
        handleTextTool,
        moveElement,
    } = useElementManipulation(getCanvasCoords, tool);

    // 4. 데이터 저장 및 불러오기 관련 로직 관리
    const { handleSave, handleLoad, handleImageUpload } = usePersistence(
        drawnLines,
        images,
        textBoxes,
        setDrawnLines, // 로드 후 상태 업데이트를 위해 전달
        setImages,
        setTextBoxes,
    );

    // 5. 캔버스 렌더링 로직 관리
    const { redrawWith } = useCanvasRendering(
        canvasRef,
        offset,
        scale,
        currentLine.current
    );

    // 모든 상태 변화 시 캔버스 렌더링
    useEffect(() => {
        redrawWith(drawnLines, images, textBoxes);
    }, [offset, scale, drawnLines, images, textBoxes, redrawWith]);


    // 자동 로드
    useEffect(() => {
        handleLoad();
    }, [handleLoad]); // handleLoad가 변경될 때마다 호출 (useCallback으로 감싸면 안정적)

    // 자동 저장
    useEffect(() => {
        const timeout = setTimeout(() => {
        handleSave();
        }, 1000);

        return () => clearTimeout(timeout);
    }, [drawnLines, images, textBoxes, handleSave]); // handleSave가 변경될 때마다 호출

    // 키보드 단축키
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'e') setTool('eraser');
        else if (e.key === 'p') setTool('pen');
        else if (e.key === 'h') setTool('handle');
        else if (e.key === 't') setTool('text');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setTool]); // setTool이 변경될 때마다 호출

    // 마우스/터치 이벤트 핸들러 (핵심 로직은 훅 내부로 이동)
    const pointers = useRef<Map<number, Point>>(new Map()); // 포인터 추적은 여기에 유지
    const lastTouchDistance = useRef<number | null>(null);
    const lastTouchCenter = useRef<Point | null>(null);
    const [isMiddleDragging, setIsMiddleDragging] = useState(false);
    const middleDragStart = useRef<Point | null>(null);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const pos = { x: e.clientX, y: e.clientY };
        pointers.current.set(e.pointerId, pos);

        if (e.pointerType === 'mouse' && e.button === 1) {
            setIsMiddleDragging(true);
            middleDragStart.current = pos;
            return;
        }

        if (pointers.current.size === 2) {
            const [p1, p2] = Array.from(pointers.current.values());
            lastTouchDistance.current = getDistance(p1, p2);
            lastTouchCenter.current = getCenter(p1, p2);
        }

        // 도구별 로직 호출
        // 지우개 도구
        if (tool === 'eraser') {
            eraseAtPointer(e);
        } 
        // 펜 도구
        else if (tool === 'pen') {
            const { x, y } = getCanvasCoords(e);
            currentLine.current = [{ x, y }];
            setIsDrawing(true);
        } 
        // 요소 이동 도구
        else if (tool === 'handle') {
            setMovingObject(null);
            const { x, y } = getCanvasCoords(e);
            // 이미지 클릭 감지
            for (let i = images.length - 1; i >= 0; i--) {
                const img = images[i];
                if (x >= img.x && x <= img.x + img.width && y >= img.y && y <= img.y + img.height) {
                    setMovingObject({ type: 'image', index: i , id: img.id, status: img.status || 'new' });
                    return;
                    }
                }
            // 텍스트 박스 클릭 감지
            for (let i = textBoxes.length - 1; i >= 0; i--) {
                const box = textBoxes[i];
                if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
                    setMovingObject({ type: 'text', index: i, id: box.id, status: box.status || 'new' });
                    return;
                }
            }
        } else if (tool === 'text') {
            handleTextTool(e); // 텍스트 툴 로직 호출
        }
    };
    // 포인터 이동 핸들러
    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const pos = { x: e.clientX, y: e.clientY };

        if (isMiddleDragging && middleDragStart.current) {
            const dx = pos.x - middleDragStart.current.x;
            const dy = pos.y - middleDragStart.current.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            middleDragStart.current = pos;
            return;
        }

        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, pos);

        if (pointers.current.size === 2) {
            const [p1, p2] = Array.from(pointers.current.values());
            const newDistance = getDistance(p1, p2);
            const newCenter = getCenter(p1, p2);

        if (lastTouchDistance.current && lastTouchCenter.current) {
            const scaleFactor = newDistance / lastTouchDistance.current;
            setScale(prev => prev * scaleFactor);
            const dx = newCenter.x - lastTouchCenter.current.x;
            const dy = newCenter.y - lastTouchCenter.current.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        }
        lastTouchDistance.current = newDistance;
        lastTouchCenter.current = newCenter;
        } else if (tool === 'eraser') {
            eraseAtPointer(e);
        } else if (tool === 'pen' && isDrawing) {
            const { x, y } = getCanvasCoords(e);
            currentLine.current.push({ x, y });
            redrawWith(drawnLines, images, textBoxes); // 매 프레임 그리기
        } else if (tool === 'handle' && movingObject) {
            moveElement(e); // useElementManipulation 훅에서 이동 로직 처리
        }
    };
    // 포인터 업 핸들러
    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        pointers.current.delete(e.pointerId);

        if (isMiddleDragging && e.button === 1) {
            setIsMiddleDragging(false);
            middleDragStart.current = null;
        }

        if (pointers.current.size < 2) {
            lastTouchDistance.current = null;
            lastTouchCenter.current = null;
        }

        if (isDrawing) {
            setIsDrawing(false);
            const finishedLine = [...currentLine.current];
            currentLine.current = [];
            setDrawnLines(prev => {
                const newLine: LineElement = {
                    id: uuidv4(),
                    points: finishedLine,
                    status: 'new', // 새로 그린 선은 'new' 상태로 설정
                };
                const updated = [...prev, newLine];
                return updated;
            });
        }
        setMovingObject(null);
    };
    // 휠 이벤트 핸들러 (줌 기능)
    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const scaleFactor = 1.1;
        const newScale = e.deltaY < 0 ? scale * scaleFactor : scale / scaleFactor;
        setScale(newScale);
    };
    // 컨텍스트 메뉴 방지 (우클릭 메뉴 방지)
    const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

    // 핀치 줌/이동 유틸리티 함수
    const getDistance = (p1: Point, p2: Point) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const getCenter = (p1: Point, p2: Point): Point => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });


    return (
        <div className="bg-amber-100">
            {/* Toolbar */}
            <Toolbar
                tool={tool}
                setTool={setTool}
                handleImageUpload={handleImageUpload}
                handleSave={handleSave}
                handleLoad={handleLoad}
            />
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                width={window.innerWidth}
                height={window.innerHeight}
                style={{
                border: '1px solid white',
                touchAction: 'none',
                cursor:
                    isMiddleDragging ? 'grabbing' :
                    isDrawing ? 'crosshair' :
                    tool === 'eraser' ? 'cell' :
                    tool === 'handle' ? 'move' :
                    'default',
                }}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onContextMenu={handleContextMenu}
            />
    </div>
  );
};

export default Canvas;