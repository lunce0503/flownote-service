import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import Konva from "konva";
import RBush from "rbush";
import type { Point, LineElement, ImageElement, TextBoxElement } from "@/entities/canvas";

type CurrentLineStyle = {
  color: string;
  strokeWidth: number;
};

type RendererSize = {
  width: number;
  height: number;
};

type IndexedNode = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
};

type RenderQueue = {
  lines: LineElement[];
  images: ImageElement[];
  texts: TextBoxElement[];
  activeOnly?: boolean;
};

const LINE_TENSION = 0.12;
const VIEWPORT_OVERSCAN_PX = 160;
const pointsToFlatArray = (points: Point[]) => points.flatMap((point) => [point.x, point.y]);

const getLineBounds = (line: LineElement): IndexedNode => {
  const first = line.points[0] ?? { x: 0, y: 0 };
  const bounds = line.points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x),
    maxY: Math.max(result.maxY, point.y),
  }), { minX: first.x, minY: first.y, maxX: first.x, maxY: first.y });
  const padding = (line.strokeWidth ?? 2) / 2;
  return {
    id: line.id,
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
};

// zIndex 오름차순(뒤→앞) 정렬. 미지정(undefined)은 0으로 보고, 동률은 배열 순서를 유지한다.
const sortByZIndex = <T extends { zIndex?: number }>(items: T[]): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (left.item.zIndex ?? 0) - (right.item.zIndex ?? 0) || left.index - right.index)
    .map((entry) => entry.item);

// 정렬된 id 순서를 Konva 자식 z-order에 반영한다. 순서가 그대로면 재정렬을 건너뛴다.
const applyLayerOrder = <N extends Konva.Node>(
  orderedIds: string[],
  nodes: Map<string, N>,
  signatureRef: { current: string },
) => {
  const signature = orderedIds.join("|");
  if (signature === signatureRef.current) return;
  signatureRef.current = signature;
  orderedIds.forEach((id, index) => {
    nodes.get(id)?.zIndex(index);
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
  currentDrawingLine: Point[],
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
  const lineIndexRef = useRef(new RBush<IndexedNode>());
  const lineBoundsRef = useRef(new Map<string, IndexedNode>());
  const currentLineShapeRef = useRef<Konva.Line | null>(null);
  const queuedRenderStateRef = useRef<RenderQueue | null>(null);
  const renderFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const container = rendererRef.current;
    if (!container || stageRef.current) return;

    const stage = new Konva.Stage({ container, width: size.width, height: size.height, listening: false });
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

    return () => {
      if (renderFrameRef.current !== null) window.cancelAnimationFrame(renderFrameRef.current);
      lineNodesRef.current.clear();
      lineSourcesRef.current.clear();
      imageNodesRef.current.clear();
      imageSourcesRef.current.clear();
      textNodesRef.current.clear();
      textSourcesRef.current.clear();
      lineIndexRef.current.clear();
      lineBoundsRef.current.clear();
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
          points: pointsToFlatArray(line.points),
          stroke: line.color ?? "#000000",
          strokeWidth: line.strokeWidth ?? 2,
        });
        const previousBounds = lineBoundsRef.current.get(line.id);
        if (previousBounds) lineIndexRef.current.remove(previousBounds);
        const bounds = getLineBounds(line);
        lineBoundsRef.current.set(line.id, bounds);
        lineIndexRef.current.insert(bounds);
        lineSourcesRef.current.set(line.id, line);
      }
    });

    lineNodesRef.current.forEach((node, id) => {
      if (nextIds.has(id)) return;
      node.destroy();
      lineNodesRef.current.delete(id);
      lineSourcesRef.current.delete(id);
      const bounds = lineBoundsRef.current.get(id);
      if (bounds) lineIndexRef.current.remove(bounds);
      lineBoundsRef.current.delete(id);
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
        node.add(new Konva.Image({ listening: false }), new Konva.Rect({ listening: false }));
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

  const updateTransformsAndVisibility = useCallback(() => {
    const transform = { x: offset.x, y: offset.y, scaleX: scale, scaleY: scale };
    staticGroupRef.current?.setAttrs(transform);
    overlayGroupRef.current?.setAttrs(transform);

    const overscan = VIEWPORT_OVERSCAN_PX / scale;
    const viewportBounds = {
      minX: -offset.x / scale - overscan,
      minY: -offset.y / scale - overscan,
      maxX: (size.width - offset.x) / scale + overscan,
      maxY: (size.height - offset.y) / scale + overscan,
    };
    const visibleLineIds = new Set(lineIndexRef.current.search(viewportBounds).map((item) => item.id));
    lineNodesRef.current.forEach((node, id) => node.visible(visibleLineIds.has(id)));
  }, [offset.x, offset.y, scale, size.height, size.width]);

  const renderQueuedState = useCallback((queue: RenderQueue) => {
    if (!queue.activeOnly) {
      reconcileImages(queue.images);
      reconcileLines(queue.lines);
      reconcileTexts(queue.texts);
      updateTransformsAndVisibility();
    }

    const activeLayer = activeStrokeLayerRef.current;
    if (activeLayer && currentDrawingLine.length > 0) {
      if (!currentLineShapeRef.current) {
        currentLineShapeRef.current = new Konva.Line({
          lineCap: "round", lineJoin: "round", tension: LINE_TENSION, listening: false,
          perfectDrawEnabled: false, shadowForStrokeEnabled: false,
        });
        activeLayer.add(currentLineShapeRef.current);
      }
      currentLineShapeRef.current.setAttrs({
        points: pointsToFlatArray(currentDrawingLine), stroke: currentLineStyle.color,
        strokeWidth: currentLineStyle.strokeWidth, x: offset.x, y: offset.y, scaleX: scale, scaleY: scale,
      });
    } else if (currentLineShapeRef.current) {
      currentLineShapeRef.current.destroy();
      currentLineShapeRef.current = null;
    }

    staticLayerRef.current?.batchDraw();
    activeStrokeLayerRef.current?.batchDraw();
    overlayLayerRef.current?.batchDraw();
  }, [currentDrawingLine, currentLineStyle.color, currentLineStyle.strokeWidth, offset.x, offset.y, reconcileImages, reconcileLines, reconcileTexts, scale, updateTransformsAndVisibility]);

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
