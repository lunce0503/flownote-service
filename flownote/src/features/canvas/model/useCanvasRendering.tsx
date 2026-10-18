import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import Konva from "konva";
import type { Point, LineElement, ImageElement, TextBoxElement } from "@/entities/canvas";
import {
  CANVAS_RENDER_WINDOW_SCALE,
  containsBounds,
  expandBounds,
  getCanvasViewportBounds,
  interpolateLinePointsForRendering,
  type Bounds,
} from "./canvasGeometry";
import { CanvasSpatialIndex } from "./canvasSpatialIndex";

type CurrentLineStyle = {
  color: string;
  strokeWidth: number;
};

type RendererSize = {
  width: number;
  height: number;
};

type RenderQueue = {
  lines: LineElement[];
  images: ImageElement[];
  texts: TextBoxElement[];
  activeOnly?: boolean;
};

// Konva tension은 끝점 오버슈트와 짧은 획의 되말림이 있어 사용하지 않는다.
// 렌더링 좌표를 Chaikin 방식으로 보간해 원래 점의 경계와 끝점을 유지하면서 모서리만 완화한다.
const LINE_TENSION = 0;
const pointsToFlatArray = (points: Point[]) => points.flatMap((point) => [point.x, point.y]);
const interpolatedLineCache = new WeakMap<Point[], number[]>();
const getInterpolatedFlatPoints = (points: Point[]) => {
  const cached = interpolatedLineCache.get(points);
  if (cached) return cached;
  const interpolated = pointsToFlatArray(interpolateLinePointsForRendering(points));
  interpolatedLineCache.set(points, interpolated);
  return interpolated;
};

// zIndex 오름차순(뒤→앞) 정렬. 미지정(undefined)은 0으로 보고, 동률은 배열 순서를 유지한다.
const sortByZIndex = <T extends { zIndex?: number }>(items: T[]): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (left.item.zIndex ?? 0) - (right.item.zIndex ?? 0) || left.index - right.index)
    .map((entry) => entry.item);

// 정렬된 id 순서를 Konva 자식 z-order에 반영한다. 순서가 그대로면 재정렬을 건너뛴다.
// Konva의 zIndex 세터는 1회 호출이 O(n)이다(children splice ×2 + _setChildrenIndices 전체 순회 + _requestDraw).
// 그래서 모든 노드에 무조건 적용하면 요소를 하나 추가할 때마다 O(n²)가 되어 필기 직후 딜레이가 생긴다.
// 오름차순으로 훑으며 "실제 위치가 어긋난 노드"만 옮긴다. 앞쪽 index는 이미 확정되어 있으므로
// 뒤에서 앞으로 끌어오는 이동은 index < i 구간을 건드리지 않아 결과 순서가 동일하다.
// zIndex를 명시적으로 바꾸지 않은 일반적인 append 상황에서는 이동이 0회가 된다.
const applyLayerOrder = <N extends Konva.Node>(
  orderedIds: string[],
  nodes: Map<string, N>,
  signatureRef: { current: string },
) => {
  const signature = orderedIds.join("|");
  if (signature === signatureRef.current) return;
  signatureRef.current = signature;
  orderedIds.forEach((id, index) => {
    const node = nodes.get(id);
    if (!node || node.index === index) return;
    node.zIndex(index);
  });
};

const stretchStageToContainer = (stage: Konva.Stage) => {
  stage.content.style.width = "100%";
  stage.content.style.height = "100%";
  stage.content.querySelectorAll("canvas").forEach((canvas) => {
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  });
};

export const useCanvasRendering = (
  rendererRef: RefObject<HTMLDivElement | null>,
  offset: Point,
  scale: number,
  currentDrawingLineRef: RefObject<Point[]>,
  currentLineStyle: CurrentLineStyle,
  size: RendererSize,
) => {
  const stageRef = useRef<Konva.Stage | null>(null);
  const staticLayerRef = useRef<Konva.Layer | null>(null);
  const activeStrokeLayerRef = useRef<Konva.Layer | null>(null);
  const overlayLayerRef = useRef<Konva.Layer | null>(null);
  const staticGroupRef = useRef<Konva.Group | null>(null);
  const imageGroupRef = useRef<Konva.Group | null>(null);
  const lineGroupRef = useRef<Konva.Group | null>(null);
  const overlayGroupRef = useRef<Konva.Group | null>(null);
  const imageOrderRef = useRef("");
  const lineOrderRef = useRef("");
  const textOrderRef = useRef("");
  const lineNodesRef = useRef(new Map<string, Konva.Line>());
  const lineSourcesRef = useRef(new Map<string, LineElement>());
  const imageNodesRef = useRef(new Map<string, Konva.Group>());
  const imageSourcesRef = useRef(new Map<string, ImageElement>());
  const textNodesRef = useRef(new Map<string, Konva.Group>());
  const textSourcesRef = useRef(new Map<string, TextBoxElement>());
  const renderSourcesRef = useRef<RenderQueue | null>(null);
  const spatialIndexRef = useRef<CanvasSpatialIndex | null>(null);
  const renderWindowRef = useRef<Bounds | null>(null);
  const renderWindowScaleRef = useRef<number | null>(null);
  const renderWindowSizeRef = useRef<RendererSize | null>(null);
  const currentLineShapeRef = useRef<Konva.Line | null>(null);
  const queuedRenderStateRef = useRef<RenderQueue | null>(null);
  const renderFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const container = rendererRef.current;
    if (!container || stageRef.current) return;

    const stage = new Konva.Stage({ container, width: 1, height: 1, listening: false });
    const staticLayer = new Konva.Layer({ listening: false });
    const activeStrokeLayer = new Konva.Layer({ listening: false });
    const overlayLayer = new Konva.Layer({ listening: false });
    const staticGroup = new Konva.Group({ listening: false });
    // 이미지 그룹(아래) → 선 그룹(위) 순서로 쌓아 "이미지 밑, 필기 위" 기본 층위를 유지한다.
    // 각 그룹 안에서만 zIndex로 재정렬하므로 이미지끼리·선끼리 순서를 바꿔도 서로 침범하지 않는다.
    const imageGroup = new Konva.Group({ listening: false });
    const lineGroup = new Konva.Group({ listening: false });
    staticGroup.add(imageGroup, lineGroup);
    const overlayGroup = new Konva.Group({ listening: false });
    staticLayer.add(staticGroup);
    overlayLayer.add(overlayGroup);
    stage.add(staticLayer, activeStrokeLayer, overlayLayer);
    stretchStageToContainer(stage);

    stageRef.current = stage;
    staticLayerRef.current = staticLayer;
    activeStrokeLayerRef.current = activeStrokeLayer;
    overlayLayerRef.current = overlayLayer;
    staticGroupRef.current = staticGroup;
    imageGroupRef.current = imageGroup;
    lineGroupRef.current = lineGroup;
    overlayGroupRef.current = overlayGroup;

    const lineNodes = lineNodesRef.current;
    const lineSources = lineSourcesRef.current;
    const imageNodes = imageNodesRef.current;
    const imageSources = imageSourcesRef.current;
    const textNodes = textNodesRef.current;
    const textSources = textSourcesRef.current;
    return () => {
      if (renderFrameRef.current !== null) window.cancelAnimationFrame(renderFrameRef.current);
      lineNodes.clear();
      lineSources.clear();
      imageNodes.clear();
      imageSources.clear();
      textNodes.clear();
      textSources.clear();
      renderSourcesRef.current = null;
      spatialIndexRef.current = null;
      renderWindowRef.current = null;
      renderWindowScaleRef.current = null;
      renderWindowSizeRef.current = null;
      stage.destroy();
      stageRef.current = null;
      staticLayerRef.current = null;
      activeStrokeLayerRef.current = null;
      overlayLayerRef.current = null;
      staticGroupRef.current = null;
      imageGroupRef.current = null;
      lineGroupRef.current = null;
      overlayGroupRef.current = null;
      currentLineShapeRef.current = null;
    };
  }, [rendererRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.size(size);
    stretchStageToContainer(stage);
  }, [size]);

  const reconcileLines = useCallback((lines: LineElement[]) => {
    const group = lineGroupRef.current;
    if (!group) return;
    const nextIds = new Set<string>();

    lines.forEach((line) => {
      if (line.status === "deleted" || line.points.length === 0) return;
      nextIds.add(line.id);
      let node = lineNodesRef.current.get(line.id);
      const sourceChanged = lineSourcesRef.current.get(line.id) !== line;
      if (!node) {
        node = new Konva.Line({
          lineCap: "round",
          lineJoin: "round",
          tension: LINE_TENSION,
          listening: false,
          perfectDrawEnabled: false,
          shadowForStrokeEnabled: false,
        });
        lineNodesRef.current.set(line.id, node);
        group.add(node);
      }
      if (sourceChanged) {
        node.setAttrs({
          points: getInterpolatedFlatPoints(line.points),
          stroke: line.color ?? "#000000",
          strokeWidth: line.strokeWidth ?? 2,
        });
        lineSourcesRef.current.set(line.id, line);
      }
    });

    lineNodesRef.current.forEach((node, id) => {
      if (nextIds.has(id)) return;
      node.destroy();
      lineNodesRef.current.delete(id);
      lineSourcesRef.current.delete(id);
    });

    const orderedIds = sortByZIndex(lines.filter((line) => nextIds.has(line.id))).map((line) => line.id);
    applyLayerOrder(orderedIds, lineNodesRef.current, lineOrderRef);
  }, []);

  const reconcileImages = useCallback((images: ImageElement[]) => {
    const group = imageGroupRef.current;
    if (!group) return;
    const nextIds = new Set<string>();
    images.forEach((image) => {
      if (image.status === "deleted" || !image.image.complete) return;
      nextIds.add(image.id);
      let node = imageNodesRef.current.get(image.id);
      if (!node) {
        node = new Konva.Group({ listening: false });
        node.add(new Konva.Image({ image: image.image, listening: false }), new Konva.Rect({ listening: false }));
        imageNodesRef.current.set(image.id, node);
        group.add(node);
      }
      if (imageSourcesRef.current.get(image.id) !== image) {
        const [imageNode, tintNode] = node.getChildren();
        imageNode.setAttrs({ image: image.image, x: image.x, y: image.y, width: image.width, height: image.height });
        tintNode.setAttrs({
          x: image.x, y: image.y, width: image.width, height: image.height,
          fill: image.tintColor ?? "transparent", opacity: image.tintColor ? 0.18 : 0,
        });
        imageSourcesRef.current.set(image.id, image);
      }
    });
    imageNodesRef.current.forEach((node, id) => {
      if (nextIds.has(id)) return;
      node.destroy();
      imageNodesRef.current.delete(id);
      imageSourcesRef.current.delete(id);
    });

    const orderedIds = sortByZIndex(images.filter((image) => nextIds.has(image.id))).map((image) => image.id);
    applyLayerOrder(orderedIds, imageNodesRef.current, imageOrderRef);
  }, []);

  const reconcileTexts = useCallback((texts: TextBoxElement[]) => {
    const group = overlayGroupRef.current;
    if (!group) return;
    const nextIds = new Set<string>();
    texts.forEach((textBox) => {
      if (textBox.status === "deleted") return;
      nextIds.add(textBox.id);
      let node = textNodesRef.current.get(textBox.id);
      if (!node) {
        node = new Konva.Group({ listening: false });
        node.add(new Konva.Text({ listening: false }), new Konva.Rect({ listening: false }));
        textNodesRef.current.set(textBox.id, node);
        group.add(node);
      }
      if (textSourcesRef.current.get(textBox.id) !== textBox) {
        const [textNode, borderNode] = node.getChildren();
        textNode.setAttrs({
          text: textBox.text, x: textBox.x, y: textBox.y, width: textBox.width,
          fill: textBox.color ?? "#17212B", fontFamily: "Arial", fontSize: 16, fontStyle: "bold",
        });
        borderNode.setAttrs({
          x: textBox.x, y: textBox.y, width: textBox.width, height: textBox.height,
          stroke: "#2563eb", strokeWidth: 1,
        });
        textSourcesRef.current.set(textBox.id, textBox);
      }
    });
    textNodesRef.current.forEach((node, id) => {
      if (nextIds.has(id)) return;
      node.destroy();
      textNodesRef.current.delete(id);
      textSourcesRef.current.delete(id);
    });

    const orderedIds = sortByZIndex(texts.filter((textBox) => nextIds.has(textBox.id))).map((textBox) => textBox.id);
    applyLayerOrder(orderedIds, textNodesRef.current, textOrderRef);
  }, []);

  const updateTransforms = useCallback(() => {
    const transform = { x: offset.x, y: offset.y, scaleX: scale, scaleY: scale };
    staticGroupRef.current?.setAttrs(transform);
    overlayGroupRef.current?.setAttrs(transform);
  }, [offset.x, offset.y, scale]);

  const renderQueuedState = useCallback((queue: RenderQueue) => {
    if (!queue.activeOnly) {
      updateTransforms();

      const previousSources = renderSourcesRef.current;
      const sourcesChanged = previousSources?.lines !== queue.lines
        || previousSources?.images !== queue.images
        || previousSources?.texts !== queue.texts;
      if (sourcesChanged) {
        renderSourcesRef.current = queue;
        spatialIndexRef.current = new CanvasSpatialIndex(queue.lines, queue.images, queue.texts);
      }

      const viewportBounds = getCanvasViewportBounds({ offset, scale, width: size.width, height: size.height });
      const previousSize = renderWindowSizeRef.current;
      const viewportShapeChanged = renderWindowScaleRef.current !== scale
        || previousSize?.width !== size.width
        || previousSize?.height !== size.height;
      const renderWindowChanged = !renderWindowRef.current
        || viewportShapeChanged
        || !containsBounds(renderWindowRef.current, viewportBounds);

      if (renderWindowChanged) {
        renderWindowRef.current = expandBounds(viewportBounds, CANVAS_RENDER_WINDOW_SCALE);
        renderWindowScaleRef.current = scale;
        renderWindowSizeRef.current = size;
      }

      if (sourcesChanged || renderWindowChanged) {
        const spatialIndex = spatialIndexRef.current;
        const renderWindow = renderWindowRef.current;
        if (spatialIndex && renderWindow) {
          const lineIds = spatialIndex.search(renderWindow, "line");
          const imageIds = spatialIndex.search(renderWindow, "image");
          const textIds = spatialIndex.search(renderWindow, "text");
          reconcileImages(queue.images.filter((image) => imageIds.has(image.id)));
          reconcileLines(queue.lines.filter((line) => lineIds.has(line.id)));
          reconcileTexts(queue.texts.filter((text) => textIds.has(text.id)));
        }
      }
    }

    const activeLayer = activeStrokeLayerRef.current;
    const currentDrawingLine = currentDrawingLineRef.current;
    if (activeLayer && currentDrawingLine.length > 0) {
      if (!currentLineShapeRef.current) {
        currentLineShapeRef.current = new Konva.Line({
          lineCap: "round", lineJoin: "round", tension: LINE_TENSION, listening: false,
          perfectDrawEnabled: false, shadowForStrokeEnabled: false,
        });
        activeLayer.add(currentLineShapeRef.current);
      }
      currentLineShapeRef.current.setAttrs({
        points: pointsToFlatArray(interpolateLinePointsForRendering(currentDrawingLine)), stroke: currentLineStyle.color,
        strokeWidth: currentLineStyle.strokeWidth, x: offset.x, y: offset.y, scaleX: scale, scaleY: scale,
      });
    } else if (currentLineShapeRef.current) {
      currentLineShapeRef.current.destroy();
      currentLineShapeRef.current = null;
    }

    staticLayerRef.current?.batchDraw();
    activeStrokeLayerRef.current?.batchDraw();
    overlayLayerRef.current?.batchDraw();
  }, [currentDrawingLineRef, currentLineStyle.color, currentLineStyle.strokeWidth, offset, reconcileImages, reconcileLines, reconcileTexts, scale, size, updateTransforms]);

  const redrawWith = useCallback((lines: LineElement[], images: ImageElement[], texts: TextBoxElement[]) => {
    queuedRenderStateRef.current = { lines, images, texts };
    if (renderFrameRef.current !== null) return;
    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      const queued = queuedRenderStateRef.current;
      queuedRenderStateRef.current = null;
      if (queued) renderQueuedState(queued);
    });
  }, [renderQueuedState]);

  const redrawActiveStroke = useCallback(() => {
    const previous = queuedRenderStateRef.current;
    queuedRenderStateRef.current = previous
      ? { ...previous, activeOnly: previous.activeOnly ?? false }
      : { lines: [], images: [], texts: [], activeOnly: true };
    if (renderFrameRef.current !== null) return;
    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      const queued = queuedRenderStateRef.current;
      queuedRenderStateRef.current = null;
      if (queued) renderQueuedState(queued);
    });
  }, [renderQueuedState]);

  return { redrawWith, redrawActiveStroke };
};
