import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText, TSpan } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/context/session-context';
import {
  flownoteApi,
  type CanvasLine,
  type CanvasPoint,
  type CanvasTextBox,
} from '@/lib/flownote-api';

type Tool = 'pen' | 'eraser' | 'handle' | 'text';
type ToolConfig = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
};

const TOOL_CONFIG: Record<Tool, ToolConfig> = {
  pen: { icon: 'edit', label: '펜' },
  eraser: { icon: 'auto-fix-normal', label: '지우개' },
  handle: { icon: 'pan-tool-alt', label: '이동' },
  text: { icon: 'text-fields', label: '텍스트' },
};

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const distance = (a: CanvasPoint, b: CanvasPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const splitTextLines = (text: string) => (text.trim() ? text.split(/\r?\n/) : ['Text']);
const lineToSmoothPath = (points: CanvasPoint[]) => {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
};

const pointNearLine = (point: CanvasPoint, line: CanvasLine, radius: number) =>
  line.points.some((linePoint) => distance(point, linePoint) < radius);

const pointInTextBox = (point: CanvasPoint, box: CanvasTextBox) => {
  const width = box.width ?? 160;
  const height = box.height ?? 64;
  return point.x >= box.x && point.x <= box.x + width && point.y >= box.y && point.y <= box.y + height;
};

export default function CanvasScreen() {
  const { token } = useSession();
  const [tool, setTool] = useState<Tool>('pen');
  const [lines, setLines] = useState<CanvasLine[]>([]);
  const [textBoxes, setTextBoxes] = useState<CanvasTextBox[]>([]);
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);
  const [deletedTextBoxIds, setDeletedTextBoxIds] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState<CanvasPoint[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewport, setViewport] = useState({ scale: 1, translateX: 0, translateY: 0 });
  const viewportRef = useRef(viewport);
  const viewportGestureRef = useRef<{
    startDistance: number;
    baseScale: number;
    canvasAnchor: CanvasPoint;
  } | null>(null);
  const isViewportGestureRef = useRef(false);
  const suppressSingleTouchRef = useRef(false);
  const draggingTextRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const historyRef = useRef<
    {
      lines: CanvasLine[];
      textBoxes: CanvasTextBox[];
      deletedLineIds: string[];
      deletedTextBoxIds: string[];
    }[]
  >([]);

  const selectedTextBox = useMemo(
    () => textBoxes.find((box) => box.id === selectedTextId) ?? null,
    [selectedTextId, textBoxes]
  );

  const setSyncedViewport = (nextViewport: typeof viewport) => {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  };

  const viewportTransform = useMemo(
    () =>
      `matrix(${viewport.scale} 0 0 ${viewport.scale} ${viewport.translateX} ${viewport.translateY})`,
    [viewport]
  );

  const resetViewport = () => {
    setSyncedViewport({ scale: 1, translateX: 0, translateY: 0 });
  };

  const recordHistory = () => {
    historyRef.current = [
      ...historyRef.current,
      { lines, textBoxes, deletedLineIds, deletedTextBoxIds },
    ].slice(-20);
  };

  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) {
      return;
    }

    setLines(previous.lines);
    setTextBoxes(previous.textBoxes);
    setDeletedLineIds(previous.deletedLineIds);
    setDeletedTextBoxIds(previous.deletedTextBoxIds);
  };

  const load = useCallback(async () => {
    if (!token) {
      setLines([]);
      setTextBoxes([]);
      return;
    }

    setLoading(true);
    try {
      const canvas = await flownoteApi.loadCanvas(token);
      setLines(canvas.lines);
      setTextBoxes(canvas.textBoxes);
      setDeletedLineIds([]);
      setDeletedTextBoxIds([]);
      historyRef.current = [];
    } catch (error) {
      Alert.alert('Flownote Canvas', error instanceof Error ? error.message : '캔버스를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDraftText(selectedTextBox?.text ?? '');
  }, [selectedTextBox]);

  const save = async () => {
    if (!token) {
      return;
    }

    setSaving(true);
    try {
      const canvas = await flownoteApi.saveCanvasElements(token, {
        lines,
        textBoxes,
        deletedLineIds,
        deletedTextBoxIds,
      });
      setLines(canvas.lines);
      setTextBoxes(canvas.textBoxes);
      setDeletedLineIds([]);
      setDeletedTextBoxIds([]);
    } catch (error) {
      Alert.alert('Flownote Canvas', error instanceof Error ? error.message : '캔버스를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const getScreenPoint = (event: GestureResponderEvent): CanvasPoint => ({
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  });

  const screenToCanvasPoint = (point: CanvasPoint): CanvasPoint => {
    const currentViewport = viewportRef.current;
    return {
      x: (point.x - currentViewport.translateX) / currentViewport.scale,
      y: (point.y - currentViewport.translateY) / currentViewport.scale,
    };
  };

  const getPoint = (event: GestureResponderEvent) => screenToCanvasPoint(getScreenPoint(event));

  const getTouches = (event: GestureResponderEvent): CanvasPoint[] =>
    Array.from(event.nativeEvent.touches ?? []).map((touch) => ({
      x: touch.locationX,
      y: touch.locationY,
    }));

  const getTouchCenter = ([first, second]: CanvasPoint[]) => ({
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  });

  const beginViewportGesture = (touches: CanvasPoint[]) => {
    const [first, second] = touches;
    if (!first || !second) {
      return;
    }

    const center = getTouchCenter(touches);
    viewportGestureRef.current = {
      startDistance: Math.max(distance(first, second), 1),
      baseScale: viewportRef.current.scale,
      canvasAnchor: screenToCanvasPoint(center),
    };
    isViewportGestureRef.current = true;
    suppressSingleTouchRef.current = true;
    draggingTextRef.current = null;
    setCurrentLine([]);
  };

  const updateViewportGesture = (touches: CanvasPoint[]) => {
    const [first, second] = touches;
    const gesture = viewportGestureRef.current;
    if (!first || !second || !gesture) {
      return;
    }

    const nextScale = clamp(
      gesture.baseScale * (distance(first, second) / gesture.startDistance),
      0.4,
      4
    );
    const center = getTouchCenter(touches);
    setSyncedViewport({
      scale: nextScale,
      translateX: center.x - gesture.canvasAnchor.x * nextScale,
      translateY: center.y - gesture.canvasAnchor.y * nextScale,
    });
  };

  const eraseAt = (point: CanvasPoint) => {
    const eraseRadius = 18 / viewportRef.current.scale;
    const erasedLineIds = lines.filter((line) => pointNearLine(point, line, eraseRadius)).map((line) => line.id);
    const erasedTextIds = textBoxes.filter((box) => pointInTextBox(point, box)).map((box) => box.id);

    if (erasedLineIds.length === 0 && erasedTextIds.length === 0) {
      return;
    }

    setLines((current) => current.filter((line) => !erasedLineIds.includes(line.id)));
    setTextBoxes((current) => current.filter((box) => !erasedTextIds.includes(box.id)));
    setDeletedLineIds((current) => Array.from(new Set([...current, ...erasedLineIds])));
    setDeletedTextBoxIds((current) => Array.from(new Set([...current, ...erasedTextIds])));
  };

  const addTextAt = (point: CanvasPoint) => {
    const box: CanvasTextBox = {
      id: makeId('text'),
      x: point.x,
      y: point.y,
      width: 170,
      height: 72,
      text: 'Text',
    };
    setTextBoxes((current) => [...current, box]);
    setSelectedTextId(box.id);
  };

  const beginInteraction = (event: GestureResponderEvent) => {
    const touches = getTouches(event);
    if (touches.length >= 2) {
      beginViewportGesture(touches);
      return;
    }

    if (suppressSingleTouchRef.current) {
      return;
    }

    const point = getPoint(event);

    if (tool === 'pen') {
      recordHistory();
      setCurrentLine([point]);
      return;
    }

    if (tool === 'eraser') {
      recordHistory();
      eraseAt(point);
      return;
    }

    if (tool === 'text') {
      recordHistory();
      addTextAt(point);
      return;
    }

    const hitText = [...textBoxes].reverse().find((box) => pointInTextBox(point, box));
    setSelectedTextId(hitText?.id ?? null);
    if (hitText) {
      recordHistory();
      draggingTextRef.current = {
        id: hitText.id,
        offsetX: point.x - hitText.x,
        offsetY: point.y - hitText.y,
      };
    }
  };

  const moveInteraction = (event: GestureResponderEvent) => {
    const touches = getTouches(event);
    if (touches.length >= 2) {
      if (!viewportGestureRef.current) {
        beginViewportGesture(touches);
      }
      updateViewportGesture(touches);
      return;
    }

    if (isViewportGestureRef.current || suppressSingleTouchRef.current) {
      return;
    }

    const point = getPoint(event);

    if (tool === 'pen' && currentLine.length > 0) {
      setCurrentLine((current) => [...current, point]);
      return;
    }

    if (tool === 'eraser') {
      eraseAt(point);
      return;
    }

    if (tool === 'handle' && draggingTextRef.current) {
      const { id, offsetX, offsetY } = draggingTextRef.current;
      setTextBoxes((current) =>
        current.map((box) =>
          box.id === id
            ? {
                ...box,
                x: point.x - offsetX,
                y: point.y - offsetY,
              }
            : box
        )
      );
    }
  };

  const endInteraction = (event: GestureResponderEvent) => {
    if (isViewportGestureRef.current || suppressSingleTouchRef.current) {
      const remainingTouches = getTouches(event).length;
      viewportGestureRef.current = null;
      draggingTextRef.current = null;
      setCurrentLine([]);
      if (remainingTouches === 0) {
        isViewportGestureRef.current = false;
        suppressSingleTouchRef.current = false;
      }
      return;
    }

    if (tool === 'pen' && currentLine.length > 1) {
      setLines((current) => [
        ...current,
        {
          id: makeId('line'),
          points: currentLine,
          color: '#1F2937',
          strokeWidth: 3,
        },
      ]);
    }
    setCurrentLine([]);
    draggingTextRef.current = null;
  };

  const updateSelectedText = () => {
    if (!selectedTextId) {
      return;
    }

    recordHistory();
    setTextBoxes((current) =>
      current.map((box) => (box.id === selectedTextId ? { ...box, text: draftText } : box))
    );
  };

  if (!token) {
    return (
      <ThemedView style={styles.centeredScreen}>
        <ThemedText type="subtitle" style={styles.title}>로그인이 필요합니다</ThemedText>
        <ThemedText style={styles.muted}>Account 탭에서 먼저 로그인하세요.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}>
          {(['pen', 'eraser', 'handle', 'text'] as Tool[]).map((item) => {
            const active = tool === item;
            const config = TOOL_CONFIG[item];

            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={`${config.label} 도구`}
                style={[styles.toolButton, active && styles.toolButtonActive]}
                onPress={() => setTool(item)}>
                <MaterialIcons
                  name={config.icon}
                  size={18}
                  color={active ? '#FFFBEB' : '#44403C'}
                />
                <ThemedText
                  type="defaultSemiBold"
                  style={active ? styles.toolTextActive : styles.toolText}>
                  {config.label}
                </ThemedText>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="실행 취소"
            style={[styles.actionButton, historyRef.current.length === 0 && styles.disabledButton]}
            onPress={undo}
            disabled={historyRef.current.length === 0}>
            <MaterialIcons name="undo" size={18} color="#FFFBEB" />
            <ThemedText type="defaultSemiBold" style={styles.actionText}>실행 취소</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="캔버스 불러오기"
            style={[styles.actionButton, loading && styles.disabledButton]}
            onPress={load}
            disabled={loading}>
            <MaterialIcons name="file-download" size={18} color="#FFFBEB" />
            <ThemedText type="defaultSemiBold" style={styles.actionText}>불러오기</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="캔버스 저장"
            style={[styles.actionButton, saving && styles.disabledButton]}
            onPress={save}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <MaterialIcons name="save" size={18} color="#FFFBEB" />
            )}
            <ThemedText type="defaultSemiBold" style={styles.actionText}>저장</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="캔버스 화면 초기화"
            style={styles.actionButton}
            onPress={resetViewport}>
            <MaterialIcons name="center-focus-strong" size={18} color="#FFFBEB" />
            <ThemedText type="defaultSemiBold" style={styles.actionText}>화면</ThemedText>
          </Pressable>
        </ScrollView>
      </View>

      <View
        style={styles.canvasBoard}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={beginInteraction}
        onResponderMove={moveInteraction}
        onResponderRelease={endInteraction}
        onResponderTerminate={endInteraction}
        onResponderTerminationRequest={() => false}>
        <Svg style={styles.svgLayer}>
          <G transform={viewportTransform}>
            {Array.from({ length: 16 }).map((_, index) => (
              <Polyline
                key={`grid-x-${index}`}
                points={`${index * 120},0 ${index * 120},1800`}
                fill="none"
                stroke="#F5F5F4"
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: 16 }).map((_, index) => (
              <Polyline
                key={`grid-y-${index}`}
                points={`0,${index * 120} 1800,${index * 120}`}
                fill="none"
                stroke="#F5F5F4"
                strokeWidth={1}
              />
            ))}
          </G>
          <G transform={viewportTransform}>
            {lines.map((line) => (
              <Path
                key={line.id}
                d={lineToSmoothPath(line.points)}
                fill="none"
                stroke={line.color ?? '#1F2937'}
                strokeWidth={line.strokeWidth ?? 3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentLine.length > 1 ? (
              <Path
                d={lineToSmoothPath(currentLine)}
                fill="none"
                stroke="#1F2937"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {textBoxes.map((box) => (
              <G key={box.id}>
                <Rect
                  x={box.x}
                  y={box.y}
                  width={box.width ?? 170}
                  height={box.height ?? 72}
                  rx={8}
                  fill="#FEF3C7"
                  stroke={box.id === selectedTextId ? '#92400E' : '#D97706'}
                  strokeWidth={box.id === selectedTextId ? 2 : 1}
                />
                <SvgText x={box.x + 12} y={box.y + 28} fill="#17212B" fontSize={15} fontWeight="700">
                  {splitTextLines(box.text).slice(0, 3).map((line, index) => (
                    <TSpan key={`${box.id}-${index}`} x={box.x + 12} dy={index === 0 ? 0 : 20}>
                      {line}
                    </TSpan>
                  ))}
                </SvgText>
              </G>
            ))}
          </G>
          {tool === 'eraser' ? <Circle cx={28} cy={28} r={12} fill="none" stroke="#DC2626" /> : null}
        </Svg>
        <View style={[styles.canvasHud, styles.pointerNone]}>
          <ThemedText type="defaultSemiBold" style={styles.hudText}>
            {TOOL_CONFIG[tool].label} · {Math.round(viewport.scale * 100)}% · {lines.length + textBoxes.length}
          </ThemedText>
        </View>
        {loading ? (
          <View style={[styles.loadingOverlay, styles.pointerNone]}>
            <ActivityIndicator color="#44403C" />
          </View>
        ) : null}
      </View>

      {selectedTextBox ? (
        <View style={styles.editorPanel}>
          <ThemedText type="defaultSemiBold" style={styles.title}>선택한 텍스트</ThemedText>
          <TextInput
            multiline
            style={styles.textEditor}
            value={draftText}
            onChangeText={setDraftText}
            onEndEditing={updateSelectedText}
          />
          <Pressable style={styles.actionButton} onPress={updateSelectedText}>
            <ThemedText type="defaultSemiBold" style={styles.actionText}>텍스트 반영</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  toolbar: {
    borderBottomWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FEF3C7',
    padding: 10,
  },
  toolbarContent: {
    gap: 8,
    paddingRight: 10,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  toolButtonActive: {
    backgroundColor: '#44403C',
  },
  toolText: {
    color: '#44403C',
  },
  toolTextActive: {
    color: '#FFFBEB',
  },
  actionButton: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#44403C',
    paddingHorizontal: 12,
  },
  actionText: {
    color: '#FFFBEB',
  },
  disabledButton: {
    opacity: 0.45,
  },
  canvasBoard: {
    flex: 1,
    minHeight: 520,
    backgroundColor: '#FFFFFF',
  },
  svgLayer: {
    flex: 1,
  },
  editorPanel: {
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#E7E5E4',
    backgroundColor: '#F8FAFC',
    padding: 12,
  },
  textEditor: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6D3D1',
    backgroundColor: '#FFFFFF',
    color: '#17212B',
    padding: 10,
    textAlignVertical: 'top',
  },
  title: {
    color: '#143241',
  },
  muted: {
    color: '#5C6670',
  },
  canvasHud: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(68, 64, 60, 0.86)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hudText: {
    color: '#FFFBEB',
    fontSize: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  pointerNone: {
    pointerEvents: 'none',
  },
});
