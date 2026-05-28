import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import Konva from "konva";
import type { Point, LineElement, ImageElement, TextBoxElement } from "../../../entities/canvas/model/types";

type CurrentLineStyle = {
  color: string;
  strokeWidth: number;
};

type RendererSize = {
  width: number;
  height: number;
};

const pointsToFlatArray = (points: Point[]) => points.flatMap((point) => [point.x, point.y]);
const LINE_TENSION = 0.12;

type StaticRenderState = {
  lines: LineElement[];
  imgs: ImageElement[];
  texts: TextBoxElement[];
  offsetX: number;
  offsetY: number;
  scale: number;
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
  const layerRef = useRef<Konva.Layer | null>(null);
  const currentLineShapeRef = useRef<Konva.Line | null>(null);
  const staticRenderStateRef = useRef<StaticRenderState | null>(null);

  useEffect(() => {
    const container = rendererRef.current;
    if (!container || stageRef.current) return;

    const stage = new Konva.Stage({
      container,
      width: size.width,
      height: size.height,
      listening: false,
    });
    stretchStageToContainer(stage);
    const layer = new Konva.Layer({ listening: false });
    stage.add(layer);
    stageRef.current = stage;
    layerRef.current = layer;

    return () => {
      stage.destroy();
      stageRef.current = null;
      layerRef.current = null;
    };
  }, [rendererRef, size.height, size.width]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.size(size);
    stretchStageToContainer(stage);
  }, [size]);

  const redrawWith = useCallback((
    lines: LineElement[],
    imgs: ImageElement[],
    texts: TextBoxElement[],
  ) => {
    const layer = layerRef.current;
    if (!layer) return;

    const previousStatic = staticRenderStateRef.current;
    const staticChanged = !previousStatic
      || previousStatic.lines !== lines
      || previousStatic.imgs !== imgs
      || previousStatic.texts !== texts
      || previousStatic.offsetX !== offset.x
      || previousStatic.offsetY !== offset.y
      || previousStatic.scale !== scale;

    if (staticChanged) {
      layer.destroyChildren();
      currentLineShapeRef.current = null;

      const group = new Konva.Group({
        x: offset.x,
        y: offset.y,
        scaleX: scale,
        scaleY: scale,
        listening: false,
      });

      imgs.filter((img) => img.status !== "deleted").forEach((img) => {
        if (!img.image.complete) return;
        group.add(new Konva.Image({
          image: img.image,
          x: img.x,
          y: img.y,
          width: img.width,
          height: img.height,
          listening: false,
        }));
        if (img.tintColor) {
          group.add(new Konva.Rect({
            x: img.x,
            y: img.y,
            width: img.width,
            height: img.height,
            fill: img.tintColor,
            opacity: 0.18,
            listening: false,
          }));
        }
      });

      lines.filter((line) => line.status !== "deleted").forEach((line) => {
        group.add(new Konva.Line({
          points: pointsToFlatArray(line.points),
          stroke: line.color ?? "#000000",
          strokeWidth: line.strokeWidth ?? 2,
          lineCap: "round",
          lineJoin: "round",
          tension: LINE_TENSION,
          listening: false,
          perfectDrawEnabled: false,
          shadowForStrokeEnabled: false,
        }));
      });

      texts.filter((box) => box.status !== "deleted").forEach((box) => {
        group.add(new Konva.Text({
          text: box.text,
          x: box.x,
          y: box.y,
          width: box.width,
          fill: box.color ?? "#17212B",
          fontFamily: "Arial",
          fontSize: 16,
          fontStyle: "bold",
          listening: false,
        }));
        group.add(new Konva.Rect({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          stroke: "#2563eb",
          strokeWidth: 1,
          listening: false,
        }));
      });

      layer.add(group);
      staticRenderStateRef.current = { lines, imgs, texts, offsetX: offset.x, offsetY: offset.y, scale };
    }

    if (currentDrawingLine.length > 0) {
      if (!currentLineShapeRef.current) {
        currentLineShapeRef.current = new Konva.Line({
          lineCap: "round",
          lineJoin: "round",
          tension: LINE_TENSION,
          listening: false,
          perfectDrawEnabled: false,
          shadowForStrokeEnabled: false,
        });
        layer.add(currentLineShapeRef.current);
      }
      currentLineShapeRef.current.setAttrs({
        points: pointsToFlatArray(currentDrawingLine),
        stroke: currentLineStyle.color,
        strokeWidth: currentLineStyle.strokeWidth,
        x: offset.x,
        y: offset.y,
        scaleX: scale,
        scaleY: scale,
      });
      currentLineShapeRef.current.moveToTop();
    } else if (currentLineShapeRef.current) {
      currentLineShapeRef.current.destroy();
      currentLineShapeRef.current = null;
    }

    layer.batchDraw();
  }, [currentDrawingLine, currentLineStyle.color, currentLineStyle.strokeWidth, offset.x, offset.y, scale]);

  return { redrawWith };
};
