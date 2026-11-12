'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import DrawingItemPickerModal from './DrawingItemPickerModal';
import DrawingItemContainer from './DrawingItemContainer';
import MathEquationModal from './MathEquationModal';
import DrawingYouTubeModal from './DrawingYouTubeModal';
import { useCollaboration } from '@/hooks/useCollaboration';
import LiveCursors from './LiveCursors';
import {
  ArrowheadType,
  DrawingElement,
  EdgeRoundnessType,
  FillStyleType,
  FontFamilyType,
  getFontFamilyCss,
  getNormalizedBox,
  getShapeBorderPoint,
  Point,
  renderDrawingElement,
  resolveLinearPoints,
  rotatePoint,
  SloppinessType,
  StrokeStyleType,
  TextAlignType,
} from '@/lib/excalidrawRenderer';

export type { DrawingElement, Point };

export type ToolType =
  | 'hand'
  | 'select'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'pencil'
  | 'text'
  | 'image'
  | 'eraser'
  | 'frame'
  | 'laser';

export type HandleType =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate'
  | 'start'
  | 'end'
  | 'mid';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface DrawingCanvasProps {
  initialData?: string;
  onChange?: (dataJson: string) => void;
  title?: string;
  notas?: any[];
  workspaceId?: string;
  isCollaborative?: boolean;
  onOpenNota?: (nota: any) => void;
  onOpenCard?: (card: any) => void;
  notaId?: string;
  itemNota?: any;
  cardData?: any;
  currentUserId?: string;
}

const STROKE_COLORS = [
  '#ffffff', // White
  '#d4d4d8', // Light Zinc
  '#71717a', // Muted Zinc
  '#f87171', // Excalidraw Red
  '#fb923c', // Orange
  '#facc15', // Yellow
  '#4ade80', // Green
  '#22d3ee', // Cyan
  '#60a5fa', // Blue
  '#a78bfa', // Violet
  '#f472b6', // Pink
];

const FILL_COLORS = [
  'transparent',
  'rgba(255, 255, 255, 0.14)',
  'rgba(248, 113, 113, 0.25)',
  'rgba(251, 146, 60, 0.25)',
  'rgba(250, 204, 21, 0.25)',
  'rgba(74, 222, 128, 0.25)',
  'rgba(34, 211, 238, 0.25)',
  'rgba(96, 165, 250, 0.25)',
  'rgba(167, 139, 250, 0.25)',
  'rgba(244, 114, 182, 0.25)',
];

const BINDABLE_TYPES = new Set([
  'rectangle',
  'diamond',
  'ellipse',
  'frame',
  'note_card',
  'flashcard',
  'math',
  'youtube',
  'image',
]);

function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

export default function DrawingCanvas({
  initialData = '',
  onChange: parentOnChange,
  title,
  notas = [],
  workspaceId,
  isCollaborative,
  notaId,
  onOpenNota,
  onOpenCard,
  currentUserId,
}: DrawingCanvasProps) {
  const parseInitialElements = useCallback((): DrawingElement[] => {
    if (initialData) {
      try {
        const parsed = JSON.parse(initialData);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  }, [initialData]);

  const [elements, setElements] = useState<DrawingElement[]>(parseInitialElements);
  const elementsRef = useRef<DrawingElement[]>(elements);
  elementsRef.current = elements;

  const { users, cursors, broadcastChange, broadcastCursor } = useCollaboration(
    isCollaborative && notaId ? `${workspaceId}:${notaId}` : undefined,
    'drawing_change',
    (newVal: string) => {
      try {
        const parsed = JSON.parse(newVal);
        if (Array.isArray(parsed)) setElements(parsed);
      } catch {}
    }
  );

  const onChange = useCallback(
    (val: string) => {
      if (parentOnChange) parentOnChange(val);
      broadcastChange(val);
    },
    [parentOnChange, broadcastChange]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Excalidraw Tool & Lock State
  const [tool, setTool] = useState<ToolType>('select');
  const [keepToolActive, setKeepToolActive] = useState<boolean>(false);
  const [zenMode, setZenMode] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Default Creation Styles (Excalidraw Left Inspector)
  const [strokeColor, setStrokeColor] = useState<string>('#ffffff');
  const [fillColor, setFillColor] = useState<string>('transparent');
  const [fillStyle, setFillStyle] = useState<FillStyleType>('hachure');
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyleType>('solid');
  const [roughness, setRoughness] = useState<SloppinessType>(1);
  const [roundness, setRoundness] = useState<EdgeRoundnessType>('round');
  const [opacity, setOpacity] = useState<number>(100);
  const [fontSize, setFontSize] = useState<number>(20);
  const [fontFamily, setFontFamily] = useState<FontFamilyType>('hand');
  const [textAlign, setTextAlign] = useState<TextAlignType>('left');
  const [startArrowhead, setStartArrowhead] = useState<ArrowheadType>('none');
  const [endArrowhead, setEndArrowhead] = useState<ArrowheadType>('arrow');
  const [isStylePanelOpen, setIsStylePanelOpen] = useState<boolean>(false);

  // Modals State
  const [pickerModal, setPickerModal] = useState<'nota' | 'card' | null>(null);
  const [mathModal, setMathModal] = useState<{
    visible: boolean;
    editingElementId: string | null;
    initialLatex: string;
  }>({
    visible: false,
    editingElementId: null,
    initialLatex: '',
  });
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);

  // History Stack (Initialized with initial elements at index 0)
  const [history, setHistory] = useState<DrawingElement[][]>(() => [parseInitialElements()]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Selection & Clipboard
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const copiedElementsRef = useRef<DrawingElement[]>([]);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Context Menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    worldX: number;
    worldY: number;
  } | null>(null);

  // Pan & Zoom
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Laser Pointer & Eraser Trail
  const laserTrailRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const eraserTrailRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const pendingEraseIdsRef = useRef<Set<string>>(new Set());

  // Hover Binding Target for Arrows
  const [hoveredBindTargetId, setHoveredBindTargetId] = useState<string | null>(null);

  // Smart Alignment Guides during Dragging
  const [smartGuides, setSmartGuides] = useState<
    { type: 'vertical' | 'horizontal'; pos: number; start: number; end: number }[]
  >([]);

  // Text Editing State (Supports standalone text AND bound shape text)
  const [editingText, setEditingText] = useState<{
    id: string;
    isContainerShape: boolean;
    worldX: number;
    worldY: number;
    width?: number;
    height?: number;
    text: string;
    fontSize: number;
    fontFamily: FontFamilyType;
    textAlign: TextAlignType;
    color: string;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textMountedAtRef = useRef<number>(0);
  const editingTextIdRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const renderCanvasRef = useRef<() => void>(() => undefined);

  // Interaction State Refs
  const mouseModeRef = useRef<
    | 'drawing'
    | 'dragging_elements'
    | 'resizing_handle'
    | 'rotating'
    | 'dragging_linear_point'
    | 'marquee_selecting'
    | 'erasing'
    | 'lasering'
    | 'panning'
    | 'idle'
  >('idle');
  const activeHandleRef = useRef<HandleType | null>(null);
  const resizeInitialBoundsRef = useRef<Bounds | null>(null);
  const currentElementRef = useRef<DrawingElement | null>(null);
  const startPointRef = useRef<Point>({ x: 0, y: 0 });
  const dragInitialElementsRef = useRef<DrawingElement[]>([]);
  const dragSelectedIdsRef = useRef<string[]>([]);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const dragStartClientRef = useRef<Point>({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);
  const altDuplicatedRef = useRef(false);
  const rotateCenterRef = useRef<Point>({ x: 0, y: 0 });

  // Focus Textarea when mounted
  useEffect(() => {
    if (!editingText || editingTextIdRef.current === editingText.id) return;
    editingTextIdRef.current = editingText.id;
    const frameId = window.requestAnimationFrame(() => {
      if (textareaRef.current && editingTextIdRef.current === editingText.id) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          textareaRef.current.value.length,
          textareaRef.current.value.length
        );
        textMountedAtRef.current = Date.now();
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editingText]);

  const commitElements = useCallback(
    (newElements: DrawingElement[]) => {
      setElements(newElements);
      elementsRef.current = newElements;
      const json = JSON.stringify(newElements);
      onChange(json);

      setHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        return [...next, newElements];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex, onChange]
  );

  // Selected Elements Memo
  const selectedElements = useMemo(
    () => elements.filter((el) => selectedIds.includes(el.id)),
    [elements, selectedIds]
  );

  // Apply style change both to active default AND to currently selected elements
  const applyStyleChange = useCallback(
    (updater: (el: DrawingElement) => DrawingElement) => {
      if (selectedIds.length === 0) return;
      const selectedSet = new Set(selectedIds);
      const next = elementsRef.current.map((el) => (selectedSet.has(el.id) ? updater(el) : el));
      commitElements(next);
    },
    [commitElements, selectedIds]
  );

  const finishTextEditing = useCallback(() => {
    if (!editingText) return;
    const trimmed = editingText.text.trim();

    if (editingText.isContainerShape) {
      const updated = elementsRef.current.map((el) =>
        el.id === editingText.id
          ? {
              ...el,
              text: trimmed || undefined,
              fontSize: editingText.fontSize,
              fontFamily: editingText.fontFamily,
            }
          : el
      );
      commitElements(updated);
    } else if (trimmed) {
      const existingIdx = elementsRef.current.findIndex((el) => el.id === editingText.id);
      if (existingIdx >= 0) {
        const updated = [...elementsRef.current];
        updated[existingIdx] = {
          ...updated[existingIdx],
          text: trimmed,
          fontSize: editingText.fontSize,
          fontFamily: editingText.fontFamily,
          textAlign: editingText.textAlign,
          strokeColor: editingText.color,
        };
        commitElements(updated);
      } else {
        const newEl: DrawingElement = {
          id: editingText.id,
          type: 'text',
          x: editingText.worldX,
          y: editingText.worldY,
          text: trimmed,
          fontSize: editingText.fontSize,
          fontFamily: editingText.fontFamily,
          textAlign: editingText.textAlign,
          strokeColor: editingText.color,
          fillColor: 'transparent',
          strokeWidth: 1,
          opacity,
        };
        commitElements([...elementsRef.current, newEl]);
      }
    } else {
      // If emptied existing standalone text, remove it
      const existingIdx = elementsRef.current.findIndex((el) => el.id === editingText.id);
      if (existingIdx >= 0) {
        commitElements(elementsRef.current.filter((el) => el.id !== editingText.id));
      }
    }

    editingTextIdRef.current = null;
    setEditingText(null);
  }, [commitElements, editingText, opacity]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      const targetState = history[targetIndex];
      setElements(targetState);
      elementsRef.current = targetState;
      setHistoryIndex(targetIndex);
      onChange(JSON.stringify(targetState));
      setSelectedIds([]);
    }
  }, [history, historyIndex, onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      const targetState = history[targetIndex];
      setElements(targetState);
      elementsRef.current = targetState;
      setHistoryIndex(targetIndex);
      onChange(JSON.stringify(targetState));
      setSelectedIds([]);
    }
  }, [history, historyIndex, onChange]);

  // Coordinate Conversion
  const screenToWorld = useCallback(
    (screenX: number, screenY: number, snap = false): Point => {
      const rawX = (screenX - pan.x) / zoom;
      const rawY = (screenY - pan.y) / zoom;
      if (snap && snapToGrid) {
        const grid = 24;
        return {
          x: Math.round(rawX / grid) * grid,
          y: Math.round(rawY / grid) * grid,
        };
      }
      return { x: rawX, y: rawY };
    },
    [pan, zoom, snapToGrid]
  );

  const getElementBounds = useCallback(
    (el: DrawingElement, allEls: DrawingElement[] = elementsRef.current): Bounds => {
      if (el.type === 'text') {
        const fSize = el.fontSize || 20;
        const lines = (el.text || '').split('\n');
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (context) {
          context.font = `${fSize}px ${getFontFamilyCss(el.fontFamily || 'hand')}`;
        }
        const measuredWidth = lines.reduce((width, line) => {
          const lineWidth = context?.measureText(line).width ?? line.length * fSize * 0.6;
          return Math.max(width, lineWidth);
        }, 0);
        const width = Math.max(measuredWidth, fSize * 0.6);
        const height = Math.max(lines.length, 1) * fSize * 1.32;
        return { minX: el.x, minY: el.y, maxX: el.x + width, maxY: el.y + height };
      }

      if (el.type === 'line' || el.type === 'arrow') {
        const pts = resolveLinearPoints(el, allEls);
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        pts.forEach((p) => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        return { minX, minY, maxX, maxY };
      }

      if (el.points && el.points.length > 0) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        el.points.forEach((p) => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        return { minX, minY, maxX, maxY };
      }

      const box = getNormalizedBox(el);
      return {
        minX: box.x,
        minY: box.y,
        maxX: box.x + box.width,
        maxY: box.y + box.height,
      };
    },
    []
  );

  const getMultiSelectionBounds = useCallback(
    (ids: string[]): Bounds | null => {
      if (ids.length === 0) return null;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      let found = false;
      elements.forEach((el) => {
        if (ids.includes(el.id)) {
          found = true;
          const b = getElementBounds(el, elements);
          minX = Math.min(minX, b.minX);
          minY = Math.min(minY, b.minY);
          maxX = Math.max(maxX, b.maxX);
          maxY = Math.max(maxY, b.maxY);
        }
      });
      return found ? { minX, minY, maxX, maxY } : null;
    },
    [elements, getElementBounds]
  );

  // Geometric Hit Testing (Excalidraw precision)
  const isPointInElement = useCallback(
    (point: Point, el: DrawingElement): boolean => {
      const tolerance = Math.max(8 / zoom, (el.strokeWidth || 2) + 4);

      if (el.type === 'line' || el.type === 'arrow') {
        const pts = resolveLinearPoints(el, elementsRef.current);
        for (let i = 0; i < pts.length - 1; i++) {
          if (distToSegment(point, pts[i], pts[i + 1]) <= tolerance) return true;
        }
        return false;
      }

      if (el.type === 'pencil' && el.points && el.points.length > 0) {
        if (el.points.length === 1) {
          return Math.hypot(point.x - el.points[0].x, point.y - el.points[0].y) <= tolerance;
        }
        for (let i = 0; i < el.points.length - 1; i++) {
          if (distToSegment(point, el.points[i], el.points[i + 1]) <= tolerance) return true;
        }
        return false;
      }

      const b = getElementBounds(el, elementsRef.current);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const localPt = el.angle ? rotatePoint(point.x, point.y, cx, cy, -el.angle) : point;

      if (el.type === 'diamond') {
        const hw = Math.max(1, (b.maxX - b.minX) / 2) + tolerance;
        const hh = Math.max(1, (b.maxY - b.minY) / 2) + tolerance;
        const normDist = Math.abs(localPt.x - cx) / hw + Math.abs(localPt.y - cy) / hh;
        return normDist <= 1;
      }

      if (el.type === 'ellipse') {
        const rx = Math.max(1, (b.maxX - b.minX) / 2) + tolerance;
        const ry = Math.max(1, (b.maxY - b.minY) / 2) + tolerance;
        const normDist = (localPt.x - cx) ** 2 / rx ** 2 + (localPt.y - cy) ** 2 / ry ** 2;
        return normDist <= 1;
      }

      return (
        localPt.x >= b.minX - tolerance &&
        localPt.x <= b.maxX + tolerance &&
        localPt.y >= b.minY - tolerance &&
        localPt.y <= b.maxY + tolerance
      );
    },
    [getElementBounds, zoom]
  );

  // Expand selection if clicked element belongs to a group
  const expandGroupSelection = useCallback((hitEl: DrawingElement, allEls: DrawingElement[]): string[] => {
    if (hitEl.groupIds && hitEl.groupIds.length > 0) {
      const topGroupId = hitEl.groupIds[hitEl.groupIds.length - 1];
      return allEls
        .filter((item) => item.groupIds?.includes(topGroupId))
        .map((item) => item.id);
    }
    return [hitEl.id];
  }, []);

  const isElementInSelectionBox = useCallback(
    (
      el: DrawingElement,
      box: { startX: number; startY: number; currentX: number; currentY: number }
    ): boolean => {
      const minBoxX = Math.min(box.startX, box.currentX);
      const maxBoxX = Math.max(box.startX, box.currentX);
      const minBoxY = Math.min(box.startY, box.currentY);
      const maxBoxY = Math.max(box.startY, box.currentY);

      const b = getElementBounds(el, elementsRef.current);
      return b.maxX >= minBoxX && b.minX <= maxBoxX && b.maxY >= minBoxY && b.minY <= maxBoxY;
    },
    [getElementBounds]
  );

  // Handle Hit Testing (Including Rotation & Linear Endpoint Handles)
  const getHandleAtPoint = useCallback(
    (point: Point, bounds: Bounds, singleEl?: DrawingElement): HandleType | null => {
      const hitRadius = 10 / zoom;

      // If single arrow/line selected, check start/mid/end handles first
      if (singleEl && (singleEl.type === 'arrow' || singleEl.type === 'line')) {
        const pts = resolveLinearPoints(singleEl, elementsRef.current);
        if (pts.length >= 2) {
          const pStart = pts[0];
          const pEnd = pts[pts.length - 1];
          const pMid =
            pts.length === 3
              ? pts[1]
              : { x: (pStart.x + pEnd.x) / 2, y: (pStart.y + pEnd.y) / 2 };

          if (Math.hypot(point.x - pStart.x, point.y - pStart.y) <= hitRadius) return 'start';
          if (Math.hypot(point.x - pEnd.x, point.y - pEnd.y) <= hitRadius) return 'end';
          if (Math.hypot(point.x - pMid.x, point.y - pMid.y) <= hitRadius) return 'mid';
        }
        return null;
      }

      const padding = 6 / zoom;
      const minX = bounds.minX - padding;
      const minY = bounds.minY - padding;
      const maxX = bounds.maxX + padding;
      const maxY = bounds.maxY + padding;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      const rotPt = singleEl?.angle
        ? rotatePoint(point.x, point.y, midX, midY, -singleEl.angle)
        : point;

      // Rotation handle above top-center
      const rotHandleY = minY - 22 / zoom;
      if (Math.hypot(rotPt.x - midX, rotPt.y - rotHandleY) <= hitRadius) {
        return 'rotate';
      }

      const handles: { type: HandleType; x: number; y: number }[] = [
        { type: 'nw', x: minX, y: minY },
        { type: 'n', x: midX, y: minY },
        { type: 'ne', x: maxX, y: minY },
        { type: 'e', x: maxX, y: midY },
        { type: 'se', x: maxX, y: maxY },
        { type: 's', x: midX, y: maxY },
        { type: 'sw', x: minX, y: maxY },
        { type: 'w', x: minX, y: midY },
      ];

      for (const h of handles) {
        if (
          rotPt.x >= h.x - hitRadius &&
          rotPt.x <= h.x + hitRadius &&
          rotPt.y >= h.y - hitRadius &&
          rotPt.y <= h.y + hitRadius
        ) {
          return h.type;
        }
      }
      return null;
    },
    [zoom]
  );

  // Layer Ordering Actions
  const handleLayerOrder = useCallback(
    (action: 'front' | 'back' | 'forward' | 'backward') => {
      if (selectedIds.length === 0) return;
      const selectedSet = new Set(selectedIds);
      const current = [...elementsRef.current];

      if (action === 'front') {
        const unsel = current.filter((el) => !selectedSet.has(el.id));
        const sel = current.filter((el) => selectedSet.has(el.id));
        commitElements([...unsel, ...sel]);
      } else if (action === 'back') {
        const unsel = current.filter((el) => !selectedSet.has(el.id));
        const sel = current.filter((el) => selectedSet.has(el.id));
        commitElements([...sel, ...unsel]);
      } else if (action === 'forward') {
        for (let i = current.length - 2; i >= 0; i--) {
          if (selectedSet.has(current[i].id) && !selectedSet.has(current[i + 1].id)) {
            const tmp = current[i];
            current[i] = current[i + 1];
            current[i + 1] = tmp;
          }
        }
        commitElements(current);
      } else if (action === 'backward') {
        for (let i = 1; i < current.length; i++) {
          if (selectedSet.has(current[i].id) && !selectedSet.has(current[i - 1].id)) {
            const tmp = current[i];
            current[i] = current[i - 1];
            current[i - 1] = tmp;
          }
        }
        commitElements(current);
      }
    },
    [commitElements, selectedIds]
  );

  // Grouping / Ungrouping
  const handleGroupSelection = useCallback(() => {
    if (selectedIds.length < 2) return;
    const newGroupId = `grp-${Date.now()}`;
    const selectedSet = new Set(selectedIds);
    const next = elementsRef.current.map((el) =>
      selectedSet.has(el.id)
        ? { ...el, groupIds: [...(el.groupIds || []), newGroupId] }
        : el
    );
    commitElements(next);
  }, [commitElements, selectedIds]);

  const handleUngroupSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const next = elementsRef.current.map((el) => {
      if (!selectedSet.has(el.id) || !el.groupIds || el.groupIds.length === 0) return el;
      const updatedGroups = el.groupIds.slice(0, -1);
      return { ...el, groupIds: updatedGroups };
    });
    commitElements(next);
  }, [commitElements, selectedIds]);

  const handleToggleLock = useCallback(() => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const anyUnlocked = elementsRef.current.some((el) => selectedSet.has(el.id) && !el.locked);
    const next = elementsRef.current.map((el) =>
      selectedSet.has(el.id) ? { ...el, locked: anyUnlocked } : el
    );
    commitElements(next);
  }, [commitElements, selectedIds]);

  const handleDuplicateSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const copies = elementsRef.current
      .filter((el) => selectedSet.has(el.id))
      .map((el) => ({
        ...el,
        id: `${el.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        seed: Math.floor(Math.random() * 1000000),
        x: el.x + 24,
        y: el.y + 24,
        points: el.points?.map((p) => ({ x: p.x + 24, y: p.y + 24 })),
      }));
    commitElements([...elementsRef.current, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }, [commitElements, selectedIds]);

  // Alignment Tools (when 2+ elements selected)
  const handleAlignSelection = useCallback(
    (mode: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
      if (selectedIds.length < 2) return;
      const bounds = getMultiSelectionBounds(selectedIds);
      if (!bounds) return;
      const selectedSet = new Set(selectedIds);

      const next = elementsRef.current.map((el) => {
        if (!selectedSet.has(el.id) || el.locked) return el;
        const b = getElementBounds(el, elementsRef.current);
        const w = b.maxX - b.minX;
        const h = b.maxY - b.minY;
        let dx = 0;
        let dy = 0;
        if (mode === 'left') dx = bounds.minX - b.minX;
        if (mode === 'right') dx = bounds.maxX - w - b.minX;
        if (mode === 'center-h') dx = (bounds.minX + bounds.maxX) / 2 - (b.minX + w / 2);
        if (mode === 'top') dy = bounds.minY - b.minY;
        if (mode === 'bottom') dy = bounds.maxY - h - b.minY;
        if (mode === 'center-v') dy = (bounds.minY + bounds.maxY) / 2 - (b.minY + h / 2);

        return {
          ...el,
          x: el.x + dx,
          y: el.y + dy,
          points: el.points?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        };
      });
      commitElements(next);
    },
    [commitElements, getElementBounds, getMultiSelectionBounds, selectedIds]
  );

  // Zoom to Fit Content (Excalidraw Shift+1)
  const handleZoomToFit = useCallback(() => {
    const container = containerRef.current;
    if (!container || elementsRef.current.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const allBounds = getMultiSelectionBounds(elementsRef.current.map((e) => e.id));
    if (!allBounds) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const contentW = Math.max(100, allBounds.maxX - allBounds.minX);
    const contentH = Math.max(100, allBounds.maxY - allBounds.minY);
    const newZoom = Math.max(
      0.2,
      Math.min(2, Math.min((cw - 120) / contentW, (ch - 120) / contentH))
    );
    const cx = (allBounds.minX + allBounds.maxX) / 2;
    const cy = (allBounds.minY + allBounds.maxY) / 2;

    setZoom(newZoom);
    setPan({
      x: cw / 2 - cx * newZoom,
      y: ch / 2 - cy * newZoom,
    });
  }, [getMultiSelectionBounds]);

  // Main High-DPI Canvas Render Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background #141414
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Subtle Dot Grid
    if (showGrid) {
      const dotSpacing = 24;
      const startX = Math.floor(-pan.x / zoom / dotSpacing) * dotSpacing;
      const endX = startX + width / zoom + dotSpacing * 2;
      const startY = Math.floor(-pan.y / zoom / dotSpacing) * dotSpacing;
      const endY = startY + height / zoom + dotSpacing * 2;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let x = startX; x < endX; x += dotSpacing) {
        for (let y = startY; y < endY; y += dotSpacing) {
          ctx.fillRect(x - 0.5, y - 0.5, 1.5, 1.5);
        }
      }
    }

    // Highlight hovered bindable shape when drawing/dragging an arrow
    if (hoveredBindTargetId) {
      const targetEl = elements.find((item) => item.id === hoveredBindTargetId);
      if (targetEl) {
        const tb = getElementBounds(targetEl, elements);
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5 / zoom;
        ctx.setLineDash([5 / zoom, 4 / zoom]);
        ctx.strokeRect(
          tb.minX - 6 / zoom,
          tb.minY - 6 / zoom,
          tb.maxX - tb.minX + 12 / zoom,
          tb.maxY - tb.minY + 12 / zoom
        );
        ctx.restore();
      }
    }

    // Render all canvas elements
    elements.forEach((el) => {
      const isPendingErase = pendingEraseIdsRef.current.has(el.id);
      if (isPendingErase) ctx.save();
      if (isPendingErase) ctx.globalAlpha = 0.25;

      renderDrawingElement(ctx, el, {
        allElements: elements,
        editingTextId: editingText?.id,
        editingTextValue: editingText?.text,
        imageCache: imageCacheRef.current,
        onImageLoad: () => renderCanvasRef.current(),
        isPreview: false,
      });

      if (isPendingErase) ctx.restore();
    });

    // Render Current Element Being Drawn
    if (currentElementRef.current) {
      renderDrawingElement(ctx, currentElementRef.current, {
        allElements: elements,
        imageCache: imageCacheRef.current,
        isPreview: false,
      });
    }

    // Smart Alignment Guides
    if (smartGuides.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      smartGuides.forEach((g) => {
        ctx.beginPath();
        if (g.type === 'vertical') {
          ctx.moveTo(g.pos, g.start);
          ctx.lineTo(g.pos, g.end);
        } else {
          ctx.moveTo(g.start, g.pos);
          ctx.lineTo(g.end, g.pos);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // Selection Handles & Bounding Box
    const singleSelected = selectedElements.length === 1 ? selectedElements[0] : undefined;
    if (
      singleSelected &&
      (singleSelected.type === 'arrow' || singleSelected.type === 'line') &&
      tool === 'select'
    ) {
      // Linear Element Endpoint & Midpoint Control Handles
      const pts = resolveLinearPoints(singleSelected, elements);
      if (pts.length >= 2) {
        const pStart = pts[0];
        const pEnd = pts[pts.length - 1];
        const pMid =
          pts.length === 3
            ? pts[1]
            : { x: (pStart.x + pEnd.x) / 2, y: (pStart.y + pEnd.y) / 2 };

        ctx.save();
        const r = 5.5 / zoom;
        [
          { pt: pStart, isMid: false },
          { pt: pMid, isMid: pts.length < 3 },
          { pt: pEnd, isMid: false },
        ].forEach(({ pt, isMid }) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isMid ? '#181818' : '#ffffff';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5 / zoom;
          ctx.fill();
          ctx.stroke();
        });
        ctx.restore();
      }
    } else {
      const bounds = getMultiSelectionBounds(selectedIds);
      if (bounds && tool === 'select') {
        const padding = 6 / zoom;
        const bMinX = bounds.minX - padding;
        const bMinY = bounds.minY - padding;
        const bMaxX = bounds.maxX + padding;
        const bMaxY = bounds.maxY + padding;
        const bW = bMaxX - bMinX;
        const bH = bMaxY - bMinY;
        const midX = (bMinX + bMaxX) / 2;
        const midY = (bMinY + bMaxY) / 2;

        ctx.save();
        if (singleSelected?.angle) {
          ctx.translate(midX, midY);
          ctx.rotate(singleSelected.angle);
          ctx.translate(-midX, -midY);
        }

        ctx.strokeStyle = singleSelected?.locked ? '#f59e0b' : '#ffffff';
        ctx.lineWidth = 1.25 / zoom;
        ctx.setLineDash(selectedElements.length > 1 ? [5 / zoom, 4 / zoom] : []);
        ctx.strokeRect(bMinX, bMinY, bW, bH);
        ctx.setLineDash([]);

        if (!singleSelected?.locked) {
          // Rotation stem & circle handle above top center
          const rotHandleY = bMinY - 22 / zoom;
          ctx.beginPath();
          ctx.moveTo(midX, bMinY);
          ctx.lineTo(midX, rotHandleY);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(midX, rotHandleY, 4.5 / zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#141414';
          ctx.fill();
          ctx.stroke();

          // 8 Resize Handles
          const handleSize = 7 / zoom;
          const handles = [
            { x: bMinX, y: bMinY },
            { x: midX, y: bMinY },
            { x: bMaxX, y: bMinY },
            { x: bMaxX, y: midY },
            { x: bMaxX, y: bMaxY },
            { x: midX, y: bMaxY },
            { x: bMinX, y: bMaxY },
            { x: bMinX, y: midY },
          ];

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1 / zoom;
          handles.forEach((h) => {
            ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
          });
        }

        ctx.restore();
      }
    }

    // Marquee Selection Box
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1 / zoom;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.restore();
    }

    // Laser Trail Rendering
    const now = Date.now();
    laserTrailRef.current = laserTrailRef.current.filter((pt) => now - pt.time < 900);
    if (laserTrailRef.current.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < laserTrailRef.current.length; i++) {
        const p0 = laserTrailRef.current[i - 1];
        const p1 = laserTrailRef.current[i];
        const age = (now - p1.time) / 900;
        const alpha = Math.max(0, 1 - age);
        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8 / zoom;
        ctx.lineWidth = (5 * (1 - age * 0.6)) / zoom;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Eraser Trail Rendering
    eraserTrailRef.current = eraserTrailRef.current.filter((pt) => now - pt.time < 220);
    if (eraserTrailRef.current.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < eraserTrailRef.current.length; i++) {
        const p0 = eraserTrailRef.current[i - 1];
        const p1 = eraserTrailRef.current[i];
        const age = (now - p1.time) / 220;
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 0.55 - age * 0.55)})`;
        ctx.lineWidth = (10 * (1 - age * 0.5)) / zoom;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }, [
    elements,
    getElementBounds,
    getMultiSelectionBounds,
    hoveredBindTargetId,
    pan,
    selectedElements,
    selectedIds,
    selectionBox,
    showGrid,
    smartGuides,
    editingText?.id,
    editingText?.text,
    tool,
    zoom,
  ]);

  renderCanvasRef.current = renderCanvas;

  // Animation loop when laser or eraser trail is active
  useEffect(() => {
    let animId: number;
    const tick = () => {
      if (laserTrailRef.current.length > 0 || eraserTrailRef.current.length > 0) {
        renderCanvasRef.current();
      }
      animId = window.requestAnimationFrame(tick);
    };
    animId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animId);
  }, []);

  useEffect(() => {
    const handleResize = () => renderCanvasRef.current();
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Image Insertion (File or Clipboard Paste)
  const handleInsertImage = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const center = screenToWorld(
            (containerRef.current?.clientWidth || 800) / 2,
            (containerRef.current?.clientHeight || 600) / 2
          );
          const maxDim = 360;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = (h / w) * maxDim;
              w = maxDim;
            } else {
              w = (w / h) * maxDim;
              h = maxDim;
            }
          }
          const newEl: DrawingElement = {
            id: `img-${Date.now()}`,
            type: 'image',
            x: center.x - w / 2,
            y: center.y - h / 2,
            width: w,
            height: h,
            imageUrl: dataUrl,
            strokeColor: '#ffffff',
            fillColor: 'transparent',
            strokeWidth: 1,
            opacity: 100,
          };
          commitElements([...elementsRef.current, newEl]);
          setSelectedIds([newEl.id]);
          if (!keepToolActive) setTool('select');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [commitElements, keepToolActive, screenToWorld]
  );

  // Mouse Down Handler
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (contextMenu) setContextMenu(null);

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldPoint = screenToWorld(clientX, clientY, true);
    const rawWorldPoint = screenToWorld(clientX, clientY, false);

    dragMovedRef.current = false;
    altDuplicatedRef.current = false;
    dragStartClientRef.current = { x: e.clientX, y: e.clientY };

    broadcastCursor(rawWorldPoint.x, rawWorldPoint.y);

    // Pan with Middle Click, Spacebar, or Hand Tool
    if (e.button === 1 || tool === 'hand' || isSpacePressed) {
      isPanningRef.current = true;
      mouseModeRef.current = 'panning';
      panStartRef.current = { x: clientX - pan.x, y: clientY - pan.y };
      return;
    }

    if (e.button !== 0) return;

    if (editingText && Date.now() - textMountedAtRef.current > 250) {
      finishTextEditing();
    }

    startPointRef.current = worldPoint;

    // Laser Pointer Tool
    if (tool === 'laser') {
      mouseModeRef.current = 'lasering';
      laserTrailRef.current.push({ x: rawWorldPoint.x, y: rawWorldPoint.y, time: Date.now() });
      renderCanvas();
      return;
    }

    // 1. Select Tool: Check Handles First
    if (tool === 'select' && selectedIds.length > 0) {
      const bounds = getMultiSelectionBounds(selectedIds);
      const singleEl = selectedElements.length === 1 ? selectedElements[0] : undefined;
      if (bounds && !singleEl?.locked) {
        const handle = getHandleAtPoint(rawWorldPoint, bounds, singleEl);
        if (handle) {
          if (handle === 'rotate') {
            mouseModeRef.current = 'rotating';
            rotateCenterRef.current = {
              x: (bounds.minX + bounds.maxX) / 2,
              y: (bounds.minY + bounds.maxY) / 2,
            };
            dragInitialElementsRef.current = elements.map((el) => ({ ...el }));
            dragSelectedIdsRef.current = [...selectedIds];
            return;
          }
          if (handle === 'start' || handle === 'end' || handle === 'mid') {
            mouseModeRef.current = 'dragging_linear_point';
            activeHandleRef.current = handle;
            dragInitialElementsRef.current = elements.map((el) => ({
              ...el,
              points: el.points?.map((p) => ({ ...p })),
            }));
            dragSelectedIdsRef.current = [...selectedIds];
            return;
          }
          mouseModeRef.current = 'resizing_handle';
          activeHandleRef.current = handle;
          resizeInitialBoundsRef.current = bounds;
          dragInitialElementsRef.current = elements.map((el) => ({
            ...el,
            points: el.points?.map((p) => ({ ...p })),
          }));
          dragSelectedIdsRef.current = [...selectedIds];
          return;
        }
      }
    }

    // 2. Select Tool: Check Element Hit
    if (tool === 'select') {
      const hit = [...elements].reverse().find((el) => isPointInElement(rawWorldPoint, el));
      if (hit) {
        const groupExpandedIds = expandGroupSelection(hit, elements);
        let nextSel = selectedIds;
        if (e.shiftKey) {
          const alreadySelected = selectedIds.includes(hit.id);
          nextSel = alreadySelected
            ? selectedIds.filter((id) => !groupExpandedIds.includes(id))
            : Array.from(new Set([...selectedIds, ...groupExpandedIds]));
          setSelectedIds(nextSel);
        } else if (!selectedIds.includes(hit.id)) {
          nextSel = groupExpandedIds;
          setSelectedIds(nextSel);
        }

        // If dragging a Frame, also drag all elements contained inside the frame
        let idsToDrag = [...nextSel];
        nextSel.forEach((id) => {
          const el = elements.find((item) => item.id === id);
          if (el?.type === 'frame') {
            const fb = getElementBounds(el, elements);
            elements.forEach((child) => {
              if (child.id !== el.id) {
                const cb = getElementBounds(child, elements);
                if (
                  cb.minX >= fb.minX &&
                  cb.maxX <= fb.maxX &&
                  cb.minY >= fb.minY &&
                  cb.maxY <= fb.maxY
                ) {
                  idsToDrag.push(child.id);
                }
              }
            });
          }
        });
        idsToDrag = Array.from(new Set(idsToDrag));

        mouseModeRef.current = 'dragging_elements';
        dragInitialElementsRef.current = elements.map((el) => ({
          ...el,
          points: el.points?.map((p) => ({ ...p })),
        }));
        dragSelectedIdsRef.current = idsToDrag;
        return;
      } else {
        if (!e.shiftKey) setSelectedIds([]);
        mouseModeRef.current = 'marquee_selecting';
        setSelectionBox({
          startX: rawWorldPoint.x,
          startY: rawWorldPoint.y,
          currentX: rawWorldPoint.x,
          currentY: rawWorldPoint.y,
        });
        return;
      }
    }

    // 3. Text Tool
    if (tool === 'text') {
      const newId = `text-${Date.now()}`;
      setEditingText({
        id: newId,
        isContainerShape: false,
        worldX: worldPoint.x,
        worldY: worldPoint.y,
        text: '',
        fontSize,
        fontFamily,
        textAlign,
        color: strokeColor,
      });
      if (!keepToolActive) setTool('select');
      return;
    }

    // 4. Eraser Tool
    if (tool === 'eraser') {
      mouseModeRef.current = 'erasing';
      pendingEraseIdsRef.current.clear();
      eraserTrailRef.current.push({ x: rawWorldPoint.x, y: rawWorldPoint.y, time: Date.now() });
      const hit = [...elements].reverse().find((el) => !el.locked && isPointInElement(rawWorldPoint, el));
      if (hit) pendingEraseIdsRef.current.add(hit.id);
      renderCanvas();
      return;
    }

    // 5. Drawing Shapes (Pencil, Rectangle, Diamond, Ellipse, Frame, Line, Arrow)
    mouseModeRef.current = 'drawing';
    const newId = `el-${Date.now()}`;
    const seed = Math.floor(Math.random() * 1000000);

    if (tool === 'pencil') {
      currentElementRef.current = {
        id: newId,
        type: 'pencil',
        x: rawWorldPoint.x,
        y: rawWorldPoint.y,
        points: [rawWorldPoint],
        strokeColor,
        fillColor: 'transparent',
        strokeWidth,
        strokeStyle,
        opacity,
        seed,
      };
    } else if (tool === 'rectangle' || tool === 'diamond' || tool === 'ellipse' || tool === 'frame') {
      currentElementRef.current = {
        id: newId,
        type: tool,
        x: worldPoint.x,
        y: worldPoint.y,
        width: 0,
        height: 0,
        strokeColor: tool === 'frame' ? '#a1a1aa' : strokeColor,
        fillColor: tool === 'frame' ? 'transparent' : fillColor,
        fillStyle,
        strokeWidth,
        strokeStyle,
        roughness,
        roundness,
        opacity,
        seed,
        name: tool === 'frame' ? `Frame ${elements.filter((e) => e.type === 'frame').length + 1}` : undefined,
      };
    } else if (tool === 'line' || tool === 'arrow') {
      // Check if starting inside a bindable shape
      const bindHit =
        tool === 'arrow'
          ? [...elements]
              .reverse()
              .find((el) => BINDABLE_TYPES.has(el.type) && isPointInElement(rawWorldPoint, el))
          : undefined;

      currentElementRef.current = {
        id: newId,
        type: tool,
        x: worldPoint.x,
        y: worldPoint.y,
        points: [worldPoint, worldPoint],
        strokeColor,
        fillColor: 'transparent',
        strokeWidth,
        strokeStyle,
        roughness,
        opacity,
        seed,
        startArrowhead: tool === 'arrow' ? startArrowhead : 'none',
        endArrowhead: tool === 'arrow' ? endArrowhead : 'none',
        startBinding: bindHit ? { elementId: bindHit.id, focus: 0, gap: 6 } : null,
      };
    }
  };

  // Double Click on Canvas: Edit Standalone Text, Bound Shape Text, or Create Text at Empty Spot
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldPoint = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = [...elements].reverse().find((element) => isPointInElement(worldPoint, element));

    e.preventDefault();
    e.stopPropagation();

    if (hit && !hit.locked) {
      if (hit.type === 'text') {
        setSelectedIds([hit.id]);
        setEditingText({
          id: hit.id,
          isContainerShape: false,
          worldX: hit.x,
          worldY: hit.y,
          text: hit.text || '',
          fontSize: hit.fontSize || 20,
          fontFamily: hit.fontFamily || 'hand',
          textAlign: hit.textAlign || 'left',
          color: hit.strokeColor || '#ffffff',
        });
        return;
      }

      if (hit.type === 'rectangle' || hit.type === 'diamond' || hit.type === 'ellipse') {
        const box = getNormalizedBox(hit);
        setSelectedIds([hit.id]);
        setEditingText({
          id: hit.id,
          isContainerShape: true,
          worldX: box.x,
          worldY: box.y,
          width: box.width,
          height: box.height,
          text: hit.text || '',
          fontSize: hit.fontSize || 18,
          fontFamily: hit.fontFamily || 'hand',
          textAlign: 'center',
          color: hit.strokeColor || '#ffffff',
        });
        return;
      }
    }

    // Double-click on empty canvas creates text immediately (Excalidraw behavior)
    const newId = `text-${Date.now()}`;
    setEditingText({
      id: newId,
      isContainerShape: false,
      worldX: worldPoint.x,
      worldY: worldPoint.y,
      text: '',
      fontSize,
      fontFamily,
      textAlign,
      color: strokeColor,
    });
  };

  // Mouse Move Handler
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldPoint = screenToWorld(clientX, clientY, true);
    const rawWorldPoint = screenToWorld(clientX, clientY, false);

    broadcastCursor(rawWorldPoint.x, rawWorldPoint.y);

    // Panning
    if (isPanningRef.current || mouseModeRef.current === 'panning') {
      setPan({
        x: clientX - panStartRef.current.x,
        y: clientY - panStartRef.current.y,
      });
      return;
    }

    // Laser Pointer
    if (mouseModeRef.current === 'lasering') {
      laserTrailRef.current.push({ x: rawWorldPoint.x, y: rawWorldPoint.y, time: Date.now() });
      renderCanvas();
      return;
    }

    // Eraser Trail
    if (mouseModeRef.current === 'erasing') {
      eraserTrailRef.current.push({ x: rawWorldPoint.x, y: rawWorldPoint.y, time: Date.now() });
      const hit = [...elements].reverse().find((el) => !el.locked && isPointInElement(rawWorldPoint, el));
      if (hit) pendingEraseIdsRef.current.add(hit.id);
      renderCanvas();
      return;
    }

    // Rotating Selected Element
    if (mouseModeRef.current === 'rotating' && dragSelectedIdsRef.current.length > 0) {
      const center = rotateCenterRef.current;
      let angle = Math.atan2(rawWorldPoint.y - center.y, rawWorldPoint.x - center.x) + Math.PI / 2;
      if (e.shiftKey) {
        const snapRad = Math.PI / 12; // 15 degrees
        angle = Math.round(angle / snapRad) * snapRad;
      }
      const selectedSet = new Set(dragSelectedIdsRef.current);
      setElements((prev) =>
        prev.map((el) => (selectedSet.has(el.id) ? { ...el, angle } : el))
      );
      return;
    }

    // Dragging Linear Control Point (Start / Mid / End of Arrow or Line)
    if (mouseModeRef.current === 'dragging_linear_point' && dragSelectedIdsRef.current.length === 1) {
      const targetId = dragSelectedIdsRef.current[0];
      const handle = activeHandleRef.current;
      const bindCandidate = [...elements]
        .reverse()
        .find(
          (el) =>
            el.id !== targetId &&
            BINDABLE_TYPES.has(el.type) &&
            isPointInElement(rawWorldPoint, el)
        );
      setHoveredBindTargetId(
        (handle === 'start' || handle === 'end') && bindCandidate ? bindCandidate.id : null
      );

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== targetId) return el;
          const pts = resolveLinearPoints(el, prev);
          if (pts.length < 2) return el;

          if (handle === 'start') {
            const newPts = [...pts];
            newPts[0] = worldPoint;
            return {
              ...el,
              points: newPts,
              startBinding: bindCandidate
                ? { elementId: bindCandidate.id, focus: 0, gap: 6 }
                : null,
            };
          } else if (handle === 'end') {
            const newPts = [...pts];
            newPts[newPts.length - 1] = worldPoint;
            return {
              ...el,
              points: newPts,
              endBinding: bindCandidate
                ? { elementId: bindCandidate.id, focus: 0, gap: 6 }
                : null,
            };
          } else if (handle === 'mid') {
            const pStart = pts[0];
            const pEnd = pts[pts.length - 1];
            return {
              ...el,
              curved: true,
              points: [pStart, worldPoint, pEnd],
            };
          }
          return el;
        })
      );
      return;
    }

    // Resizing Handle
    if (
      mouseModeRef.current === 'resizing_handle' &&
      activeHandleRef.current &&
      resizeInitialBoundsRef.current
    ) {
      const handle = activeHandleRef.current;
      const initBounds = resizeInitialBoundsRef.current;
      const initW = Math.max(1, initBounds.maxX - initBounds.minX);
      const initH = Math.max(1, initBounds.maxY - initBounds.minY);

      let newMinX = initBounds.minX;
      let newMaxX = initBounds.maxX;
      let newMinY = initBounds.minY;
      let newMaxY = initBounds.maxY;

      if (handle.includes('e')) newMaxX = worldPoint.x;
      if (handle.includes('w')) newMinX = worldPoint.x;
      if (handle.includes('s')) newMaxY = worldPoint.y;
      if (handle.includes('n')) newMinY = worldPoint.y;

      // Shift locks aspect ratio
      if (e.shiftKey) {
        const ratio = initW / initH;
        const currW = Math.abs(newMaxX - newMinX);
        const currH = Math.abs(newMaxY - newMinY);
        if (currW / ratio > currH) {
          newMaxY = newMinY + Math.sign(newMaxY - newMinY || 1) * (currW / ratio);
        } else {
          newMaxX = newMinX + Math.sign(newMaxX - newMinX || 1) * (currH * ratio);
        }
      }

      const scaleX = (newMaxX - newMinX) / initW;
      const scaleY = (newMaxY - newMinY) / initH;
      const selectedSet = new Set(dragSelectedIdsRef.current);

      setElements((prev) =>
        prev.map((el) => {
          if (!selectedSet.has(el.id) || el.locked) return el;
          const initial = dragInitialElementsRef.current.find((item) => item.id === el.id);
          if (!initial) return el;

          const relX = (initial.x - initBounds.minX) / initW;
          const relY = (initial.y - initBounds.minY) / initH;
          const targetX = newMinX + relX * (newMaxX - newMinX);
          const targetY = newMinY + relY * (newMaxY - newMinY);

          if (initial.points && initial.points.length > 0) {
            const scaledPoints = initial.points.map((p) => ({
              x: newMinX + ((p.x - initBounds.minX) / initW) * (newMaxX - newMinX),
              y: newMinY + ((p.y - initBounds.minY) / initH) * (newMaxY - newMinY),
            }));
            return {
              ...el,
              x: targetX,
              y: targetY,
              points: scaledPoints,
            };
          }

          if (initial.type === 'text') {
            const initFontSize = initial.fontSize || 20;
            const uniformScale = Math.max(0.4, Math.min(Math.abs(scaleX), Math.abs(scaleY)));
            return {
              ...el,
              x: targetX,
              y: targetY,
              fontSize: Math.max(10, Math.round(initFontSize * uniformScale)),
            };
          }

          const initBox = getNormalizedBox(initial);
          const targetW = Math.max(12, initBox.width * Math.abs(scaleX));
          const targetH = Math.max(12, initBox.height * Math.abs(scaleY));

          return {
            ...el,
            x: Math.min(newMinX, newMaxX) + ((initBox.x - initBounds.minX) / initW) * Math.abs(newMaxX - newMinX),
            y: Math.min(newMinY, newMaxY) + ((initBox.y - initBounds.minY) / initH) * Math.abs(newMaxY - newMinY),
            width: targetW,
            height: targetH,
          };
        })
      );
      return;
    }

    // Dragging Selected Elements (Supports Alt+Drag Duplication & Smart Alignment Guides)
    if (mouseModeRef.current === 'dragging_elements' && dragSelectedIdsRef.current.length > 0) {
      const deltaScreen = Math.hypot(
        e.clientX - dragStartClientRef.current.x,
        e.clientY - dragStartClientRef.current.y
      );
      if (deltaScreen < 3 && !dragMovedRef.current) return;
      dragMovedRef.current = true;

      // Alt + Drag Clones Selected Elements in-place on first move
      if (e.altKey && !altDuplicatedRef.current) {
        altDuplicatedRef.current = true;
        const selectedSet = new Set(dragSelectedIdsRef.current);
        const clones = dragInitialElementsRef.current
          .filter((el) => selectedSet.has(el.id))
          .map((el) => ({
            ...el,
            id: `${el.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            seed: Math.floor(Math.random() * 1000000),
          }));
        const cloneIds = clones.map((c) => c.id);
        setElements([...dragInitialElementsRef.current, ...clones]);
        dragInitialElementsRef.current = [...dragInitialElementsRef.current, ...clones];
        dragSelectedIdsRef.current = cloneIds;
        setSelectedIds(cloneIds);
      }

      let dx = worldPoint.x - startPointRef.current.x;
      let dy = worldPoint.y - startPointRef.current.y;

      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }

      const selectedSet = new Set(dragSelectedIdsRef.current);

      // Compute Smart Alignment Guides against unselected elements
      const activeGuides: { type: 'vertical' | 'horizontal'; pos: number; start: number; end: number }[] = [];
      if (!snapToGrid) {
        const initSelBounds = (() => {
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          dragInitialElementsRef.current.forEach((el) => {
            if (selectedSet.has(el.id)) {
              const b = getElementBounds(el, dragInitialElementsRef.current);
              minX = Math.min(minX, b.minX);
              minY = Math.min(minY, b.minY);
              maxX = Math.max(maxX, b.maxX);
              maxY = Math.max(maxY, b.maxY);
            }
          });
          return { minX: minX + dx, minY: minY + dy, maxX: maxX + dx, maxY: maxY + dy };
        })();

        const selCx = (initSelBounds.minX + initSelBounds.maxX) / 2;
        const selCy = (initSelBounds.minY + initSelBounds.maxY) / 2;
        const snapThreshold = 5 / zoom;

        dragInitialElementsRef.current.forEach((other) => {
          if (selectedSet.has(other.id)) return;
          const ob = getElementBounds(other, dragInitialElementsRef.current);
          const oCx = (ob.minX + ob.maxX) / 2;
          const oCy = (ob.minY + ob.maxY) / 2;

          if (Math.abs(selCx - oCx) < snapThreshold) {
            dx += oCx - selCx;
            activeGuides.push({
              type: 'vertical',
              pos: oCx,
              start: Math.min(initSelBounds.minY, ob.minY) - 20,
              end: Math.max(initSelBounds.maxY, ob.maxY) + 20,
            });
          }
          if (Math.abs(selCy - oCy) < snapThreshold) {
            dy += oCy - selCy;
            activeGuides.push({
              type: 'horizontal',
              pos: oCy,
              start: Math.min(initSelBounds.minX, ob.minX) - 20,
              end: Math.max(initSelBounds.maxX, ob.maxX) + 20,
            });
          }
        });
      }
      setSmartGuides(activeGuides);

      setElements((prev) =>
        prev.map((el) => {
          if (!selectedSet.has(el.id) || el.locked) return el;
          const initial = dragInitialElementsRef.current.find((item) => item.id === el.id);
          if (!initial) return el;

          if (initial.points) {
            return {
              ...el,
              x: initial.x + dx,
              y: initial.y + dy,
              points: initial.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            };
          }
          return {
            ...el,
            x: initial.x + dx,
            y: initial.y + dy,
          };
        })
      );
      return;
    }

    // Marquee Selection
    if (mouseModeRef.current === 'marquee_selecting') {
      setSelectionBox((prev) =>
        prev ? { ...prev, currentX: rawWorldPoint.x, currentY: rawWorldPoint.y } : null
      );
      const box = {
        startX: startPointRef.current.x,
        startY: startPointRef.current.y,
        currentX: rawWorldPoint.x,
        currentY: rawWorldPoint.y,
      };
      const hits = elements.filter((el) => isElementInSelectionBox(el, box)).map((el) => el.id);
      setSelectedIds(hits);
      return;
    }

    // Drawing New Shape in Progress
    if (mouseModeRef.current === 'drawing' && currentElementRef.current) {
      const curr = currentElementRef.current;
      if (curr.type === 'pencil' && curr.points) {
        const lastPt = curr.points[curr.points.length - 1];
        if (!lastPt || Math.hypot(rawWorldPoint.x - lastPt.x, rawWorldPoint.y - lastPt.y) > 2 / zoom) {
          curr.points.push(rawWorldPoint);
        }
      } else if (
        curr.type === 'rectangle' ||
        curr.type === 'diamond' ||
        curr.type === 'ellipse' ||
        curr.type === 'frame'
      ) {
        let w = worldPoint.x - startPointRef.current.x;
        let h = worldPoint.y - startPointRef.current.y;
        if (e.shiftKey) {
          const maxSide = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * maxSide;
          h = Math.sign(h || 1) * maxSide;
        }
        if (e.altKey) {
          curr.x = startPointRef.current.x - w;
          curr.y = startPointRef.current.y - h;
          curr.width = w * 2;
          curr.height = h * 2;
        } else {
          curr.x = startPointRef.current.x;
          curr.y = startPointRef.current.y;
          curr.width = w;
          curr.height = h;
        }
      } else if ((curr.type === 'line' || curr.type === 'arrow') && curr.points) {
        let targetPt = worldPoint;
        if (e.shiftKey) {
          const dx = worldPoint.x - startPointRef.current.x;
          const dy = worldPoint.y - startPointRef.current.y;
          const len = Math.hypot(dx, dy);
          const snapAngle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
          targetPt = {
            x: startPointRef.current.x + len * Math.cos(snapAngle),
            y: startPointRef.current.y + len * Math.sin(snapAngle),
          };
        }

        if (curr.type === 'arrow') {
          const bindCandidate = [...elements]
            .reverse()
            .find(
              (el) =>
                el.id !== curr.startBinding?.elementId &&
                BINDABLE_TYPES.has(el.type) &&
                isPointInElement(rawWorldPoint, el)
            );
          setHoveredBindTargetId(bindCandidate ? bindCandidate.id : null);
          curr.endBinding = bindCandidate
            ? { elementId: bindCandidate.id, focus: 0, gap: 6 }
            : null;
        }

        curr.points[1] = targetPt;
      }
      renderCanvas();
    }
  };

  // Mouse Up Handler
  const handleMouseUp = () => {
    isPanningRef.current = false;
    setSmartGuides([]);
    setHoveredBindTargetId(null);

    if (mouseModeRef.current === 'erasing') {
      mouseModeRef.current = 'idle';
      if (pendingEraseIdsRef.current.size > 0) {
        const toDelete = new Set(pendingEraseIdsRef.current);
        pendingEraseIdsRef.current.clear();
        commitElements(elementsRef.current.filter((el) => !toDelete.has(el.id)));
      }
      renderCanvas();
      return;
    }

    if (mouseModeRef.current === 'lasering') {
      mouseModeRef.current = 'idle';
      return;
    }

    if (
      mouseModeRef.current === 'resizing_handle' ||
      mouseModeRef.current === 'rotating' ||
      mouseModeRef.current === 'dragging_linear_point'
    ) {
      mouseModeRef.current = 'idle';
      activeHandleRef.current = null;
      resizeInitialBoundsRef.current = null;
      dragInitialElementsRef.current = [];
      dragSelectedIdsRef.current = [];
      commitElements(elementsRef.current);
      return;
    }

    if (mouseModeRef.current === 'dragging_elements') {
      mouseModeRef.current = 'idle';
      dragInitialElementsRef.current = [];
      dragSelectedIdsRef.current = [];
      if (dragMovedRef.current) {
        commitElements(elementsRef.current);
      }
      return;
    }

    if (mouseModeRef.current === 'marquee_selecting') {
      mouseModeRef.current = 'idle';
      setSelectionBox(null);
      return;
    }

    if (mouseModeRef.current === 'drawing' && currentElementRef.current) {
      mouseModeRef.current = 'idle';
      const newEl = { ...currentElementRef.current };
      currentElementRef.current = null;

      // Normalize negative width/height on rectangles/diamonds/ellipses/frames
      if (
        newEl.type === 'rectangle' ||
        newEl.type === 'diamond' ||
        newEl.type === 'ellipse' ||
        newEl.type === 'frame'
      ) {
        const box = getNormalizedBox(newEl);
        // If user just clicked without dragging, give a sensible default size
        newEl.x = box.x;
        newEl.y = box.y;
        newEl.width = box.width < 6 ? 120 : box.width;
        newEl.height = box.height < 6 ? 80 : box.height;
      }

      commitElements([...elementsRef.current, newEl]);

      if (newEl.type !== 'pencil' && !keepToolActive) {
        setTool('select');
        setSelectedIds([newEl.id]);
      } else if (keepToolActive) {
        setSelectedIds([newEl.id]);
      } else {
        setSelectedIds([]);
      }
      return;
    }

    mouseModeRef.current = 'idle';
  };

  // Keyboard Shortcuts & Clipboard Paste (Images + Elements)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        editingText ||
        (target &&
          (target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA'))
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              handleInsertImage(file);
              return;
            }
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const isTyping = Boolean(
        target &&
          (target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.closest('[contenteditable="true"]'))
      );
      if (editingText || isTyping) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      // Enter on selected shape opens bound text editor
      if (e.key === 'Enter' && selectedIds.length === 1) {
        const sel = elementsRef.current.find((el) => el.id === selectedIds[0]);
        if (sel && !sel.locked) {
          if (sel.type === 'rectangle' || sel.type === 'diamond' || sel.type === 'ellipse') {
            e.preventDefault();
            const box = getNormalizedBox(sel);
            setEditingText({
              id: sel.id,
              isContainerShape: true,
              worldX: box.x,
              worldY: box.y,
              width: box.width,
              height: box.height,
              text: sel.text || '',
              fontSize: sel.fontSize || 18,
              fontFamily: sel.fontFamily || 'hand',
              textAlign: 'center',
              color: sel.strokeColor || '#ffffff',
            });
            return;
          }
        }
      }

      // Select All (Ctrl+A)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(elementsRef.current.map((el) => el.id));
        setTool('select');
        return;
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelection();
        return;
      }

      // Group (Ctrl+G) / Ungroup (Ctrl+Shift+G)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) handleUngroupSelection();
        else handleGroupSelection();
        return;
      }

      // Lock / Unlock (Ctrl+Shift+L)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleToggleLock();
        return;
      }

      // Layer Ordering ([ / ] / Ctrl+[ / Ctrl+])
      if (e.key === '[') {
        e.preventDefault();
        handleLayerOrder(e.ctrlKey || e.metaKey ? 'back' : 'backward');
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        handleLayerOrder(e.ctrlKey || e.metaKey ? 'front' : 'forward');
        return;
      }

      // Copy / Paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedIds.length === 0) return;
        const selectedSet = new Set(selectedIds);
        copiedElementsRef.current = elementsRef.current
          .filter((element) => selectedSet.has(element.id))
          .map((element) => ({
            ...element,
            points: element.points?.map((point) => ({ ...point })),
          }));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (copiedElementsRef.current.length === 0) return;
        e.preventDefault();
        const copies = copiedElementsRef.current.map((element) => ({
          ...element,
          id: `${element.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          seed: Math.floor(Math.random() * 1000000),
          x: element.x + 24,
          y: element.y + 24,
          points: element.points?.map((point) => ({ x: point.x + 24, y: point.y + 24 })),
        }));
        copiedElementsRef.current = copies.map((element) => ({
          ...element,
          points: element.points?.map((point) => ({ ...point })),
        }));
        commitElements([...elementsRef.current, ...copies]);
        setSelectedIds(copies.map((element) => element.id));
        setTool('select');
        return;
      }

      // Alt+Z Zen Mode / Ctrl+Z Undo
      if (e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setZenMode((prev) => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Toggle Grid (Ctrl + ')
      if ((e.ctrlKey || e.metaKey) && e.key === "'") {
        e.preventDefault();
        setShowGrid((prev) => !prev);
        return;
      }

      // Zoom to Fit (Shift + 1)
      if (e.shiftKey && e.code === 'Digit1') {
        e.preventDefault();
        handleZoomToFit();
        return;
      }

      if (e.code === 'Space') {
        setIsSpacePressed(true);
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          const selectedSet = new Set(selectedIds);
          const remaining = elementsRef.current.filter(
            (el) => !selectedSet.has(el.id) || el.locked
          );
          setSelectedIds([]);
          commitElements(remaining);
        }
      }

      // Arrow keys nudge selected elements
      if (
        selectedIds.length > 0 &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const selectedSet = new Set(selectedIds);
        const next = elementsRef.current.map((el) => {
          if (!selectedSet.has(el.id) || el.locked) return el;
          return {
            ...el,
            x: el.x + dx,
            y: el.y + dy,
            points: el.points?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          };
        });
        commitElements(next);
        return;
      }

      // Excalidraw Tool Hotkeys
      if (e.key.toLowerCase() === 'q') setKeepToolActive((prev) => !prev);
      if (e.key.toLowerCase() === 'h') setTool('hand');
      if (e.key.toLowerCase() === 'v' || e.key === '1') setTool('select');
      if (e.key.toLowerCase() === 'r' || e.key === '2') setTool('rectangle');
      if (e.key.toLowerCase() === 'd' || e.key === '3') setTool('diamond');
      if (e.key.toLowerCase() === 'o' || e.key === '4') setTool('ellipse');
      if (e.key.toLowerCase() === 'a' || e.key === '5') setTool('arrow');
      if (e.key.toLowerCase() === 'l' || e.key === '6') setTool('line');
      if (e.key.toLowerCase() === 'p' || e.key === '7') setTool('pencil');
      if (e.key.toLowerCase() === 't' || e.key === '8') setTool('text');
      if (e.key.toLowerCase() === 'i' || e.key === '9') imageInputRef.current?.click();
      if (e.key.toLowerCase() === 'e' || e.key === '0') setTool('eraser');
      if (e.key.toLowerCase() === 'f') setTool('frame');
      if (e.key.toLowerCase() === 'k') setTool('laser');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    commitElements,
    editingText,
    handleDuplicateSelection,
    handleGroupSelection,
    handleInsertImage,
    handleLayerOrder,
    handleRedo,
    handleToggleLock,
    handleUndo,
    handleUngroupSelection,
    handleZoomToFit,
    selectedIds,
  ]);

  // Wheel Zoom & Trackpad Pan
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // Shift+Wheel pans horizontally
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setPan((prev) => ({ x: prev.x - e.deltaY, y: prev.y }));
      return;
    }

    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.max(0.15, Math.min(5, zoom * zoomFactor));

    setPan((prev) => ({
      x: clientX - (clientX - prev.x) * (newZoom / zoom),
      y: clientY - (clientY - prev.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  };

  // Export High-Resolution PNG (Includes Embedded Cards Preview)
  const handleExportPNG = () => {
    const offscreen = document.createElement('canvas');
    const allBounds =
      elements.length > 0
        ? getMultiSelectionBounds(elements.map((e) => e.id))
        : { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    if (!allBounds) return;

    const pad = 48;
    const w = Math.max(400, allBounds.maxX - allBounds.minX + pad * 2);
    const h = Math.max(300, allBounds.maxY - allBounds.minY + pad * 2);
    const dpr = 2;

    offscreen.width = w * dpr;
    offscreen.height = h * dpr;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(pad - allBounds.minX, pad - allBounds.minY);
    elements.forEach((el) => {
      renderDrawingElement(ctx, el, {
        allElements: elements,
        imageCache: imageCacheRef.current,
        isPreview: true,
      });
    });

    const dataUrl = offscreen.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${title || 'desenho-tesseract'}.png`;
    link.href = dataUrl;
    link.click();
  };

  // Export / Import Scene JSON (.excalidraw.json)
  const handleExportJSON = () => {
    const payload = JSON.stringify(elements, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${title || 'desenho-tesseract'}.excalidraw.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        const importedElements = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.elements)
            ? parsed.elements
            : null;
        if (importedElements) {
          commitElements(importedElements);
          setSelectedIds([]);
        }
      } catch (err) {
        console.error('Erro ao importar arquivo de desenho:', err);
      }
    };
    reader.readAsText(file);
  };

  const getCanvasCursor = () => {
    if (tool === 'hand' || isSpacePressed)
      return isPanningRef.current ? 'cursor-grabbing' : 'cursor-grab';
    switch (tool) {
      case 'select':
        return selectedIds.length > 0 ? 'cursor-move' : 'cursor-default';
      case 'pencil':
      case 'rectangle':
      case 'diamond':
      case 'ellipse':
      case 'frame':
      case 'line':
      case 'arrow':
      case 'laser':
        return 'cursor-crosshair';
      case 'text':
        return 'cursor-text';
      case 'eraser':
        return 'cursor-cell';
      default:
        return 'cursor-default';
    }
  };

  const showPropertyInspector = isStylePanelOpen || (selectedElements.length > 0 && !zenMode);
  const firstSelected = selectedElements[0];

  const activeStrokeColor = firstSelected?.strokeColor ?? strokeColor;
  const activeFillColor = firstSelected?.fillColor ?? fillColor;
  const activeFillStyle = firstSelected?.fillStyle ?? fillStyle;
  const activeStrokeWidth = firstSelected?.strokeWidth ?? strokeWidth;
  const activeStrokeStyle = firstSelected?.strokeStyle ?? strokeStyle;
  const activeRoughness = firstSelected?.roughness ?? roughness;
  const activeRoundness = firstSelected?.roundness ?? roundness;
  const activeOpacity = firstSelected?.opacity ?? opacity;
  const activeFontFamily = firstSelected?.fontFamily ?? fontFamily;
  const activeFontSize = firstSelected?.fontSize ?? fontSize;
  const activeTextAlign = firstSelected?.textAlign ?? textAlign;
  const activeStartArrow = firstSelected?.startArrowhead ?? startArrowhead;
  const activeEndArrow = firstSelected?.endArrowhead ?? endArrowhead;

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const worldPt = screenToWorld(clientX, clientY);
        const hit = [...elements].reverse().find((el) => isPointInElement(worldPt, el));
        if (hit && !selectedIds.includes(hit.id)) {
          setSelectedIds(expandGroupSelection(hit, elements));
        }
        setContextMenu({
          x: clientX,
          y: clientY,
          worldX: worldPt.x,
          worldY: worldPt.y,
        });
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          if (files[0].type.startsWith('image/')) {
            handleInsertImage(files[0]);
          } else if (files[0].name.endsWith('.json') || files[0].name.endsWith('.excalidraw')) {
            handleImportJSON(files[0]);
          }
        }
      }}
      className="relative w-full h-full flex flex-col bg-[#141414] overflow-hidden select-none font-sansation"
    >
      {/* Collaborators Presence */}
      {(() => {
        const visibleUsers = users.filter(
          (user) =>
            !currentUserId || (user.id !== currentUserId && (user as any).userId !== currentUserId)
        );
        if (!workspaceId || !notaId || !isCollaborative || visibleUsers.length === 0) return null;

        return (
          <div
            className="absolute right-4 top-4 z-40 flex items-center gap-2"
            aria-label="Pessoas neste desenho"
          >
            <div className="flex items-center -space-x-2">
              {visibleUsers.map((user, index) => {
                const displayName = user.username ? `@${user.username}` : user.name || 'Anônimo';
                return (
                  <div key={user.id || index} className="group/drawing-collaborator relative">
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-none border-2 border-[#141414] bg-zinc-800 text-xs font-semibold text-white">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatarUrl}
                          alt={displayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (user.name || user.username || 'U').charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden whitespace-nowrap rounded border border-white/10 bg-[#121212] px-2 py-1 text-[11px] text-white shadow-xl group-hover/drawing-collaborator:block">
                      {displayName}
                    </span>
                  </div>
                );
              })}
            </div>
            {visibleUsers.length > 1 && (
              <span className="text-xs text-zinc-400">{visibleUsers.length}</span>
            )}
          </div>
        );
      })()}

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={imageInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleInsertImage(file);
          e.target.value = '';
        }}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={jsonInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportJSON(file);
          e.target.value = '';
        }}
        accept=".json,.excalidraw"
        className="hidden"
      />

      {/* Excalidraw Top Floating Toolbar */}
      {!zenMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 bg-[#181818]/95 backdrop-blur-md border border-white/10 p-1 rounded-none shadow-2xl max-w-[96vw] overflow-x-auto no-scrollbar select-none font-sansation">
          {/* Lock Tool Active (Q) */}
          <button
            type="button"
            onClick={() => setKeepToolActive((prev) => !prev)}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              keepToolActive
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Manter ferramenta selecionada após desenhar (Q)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="1" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">Q</span>
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1 shrink-0" />

          {/* Hand (H) */}
          <button
            type="button"
            onClick={() => {
              setTool('hand');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'hand'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Mão / Mover Canvas (H ou Espaço)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">H</span>
          </button>

          {/* Select (1 / V) */}
          <button
            type="button"
            onClick={() => setTool('select')}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'select'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Seleção (1 ou V)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
              <path d="m13 13 6 6" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">1</span>
          </button>

          {/* Rectangle (2 / R) */}
          <button
            type="button"
            onClick={() => {
              setTool('rectangle');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'rectangle'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Retângulo (2 ou R)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="2" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">2</span>
          </button>

          {/* Diamond (3 / D) */}
          <button
            type="button"
            onClick={() => {
              setTool('diamond');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'diamond'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Losango / Decisão (3 ou D)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 22 12 12 22 2 12 12 2" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">3</span>
          </button>

          {/* Ellipse (4 / O) */}
          <button
            type="button"
            onClick={() => {
              setTool('ellipse');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'ellipse'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Elipse / Círculo (4 ou O)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">4</span>
          </button>

          {/* Arrow (5 / A) */}
          <button
            type="button"
            onClick={() => {
              setTool('arrow');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'arrow'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Seta Inteligente (5 ou A)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">5</span>
          </button>

          {/* Line (6 / L) */}
          <button
            type="button"
            onClick={() => {
              setTool('line');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'line'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Linha (6 ou L)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="19" x2="19" y2="5" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">6</span>
          </button>

          {/* Freehand Pencil (7 / P) */}
          <button
            type="button"
            onClick={() => {
              setTool('pencil');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'pencil'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Desenho Livre (7 ou P)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">7</span>
          </button>

          {/* Text (8 / T) */}
          <button
            type="button"
            onClick={() => {
              setTool('text');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'text'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Texto (8 ou T)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">8</span>
          </button>

          {/* Image (9 / I) */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer text-zinc-400 hover:text-white hover:bg-white/10"
            title="Inserir Imagem (9 ou I)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="1" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">9</span>
          </button>

          {/* Eraser (0 / E) */}
          <button
            type="button"
            onClick={() => {
              setTool('eraser');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'eraser'
                ? 'bg-red-500 text-white font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Borracha com Rastro (0 ou E)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
              <path d="M22 21H7" />
              <path d="m5 11 9 9" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">0</span>
          </button>

          {/* Frame (F) */}
          <button
            type="button"
            onClick={() => {
              setTool('frame');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'frame'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Frame / Quadro Agrupador (F)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="6" x2="2" y2="6" />
              <line x1="22" y1="18" x2="2" y2="18" />
              <line x1="6" y1="2" x2="6" y2="22" />
              <line x1="18" y1="2" x2="18" y2="22" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">F</span>
          </button>

          {/* Laser Pointer (K) */}
          <button
            type="button"
            onClick={() => {
              setTool('laser');
              setSelectedIds([]);
            }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
              tool === 'laser'
                ? 'bg-red-500 text-white font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Apontador Laser (K)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M19.07 4.93l-2.12 2.12M7.05 16.95l-2.12 2.12" />
            </svg>
            <span className="absolute right-0.5 bottom-0.5 text-[7px] font-mono leading-none">K</span>
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1 shrink-0" />

          {/* Tesseract Native Tools: Insert Note, Flashcard, Math, YouTube */}
          <button
            type="button"
            onClick={() => setPickerModal('nota')}
            className="w-8 h-8 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Inserir Nota do Workspace no Desenho"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setPickerModal('card')}
            className="w-8 h-8 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Inserir Flashcard no Desenho"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="14" x="3" y="5" rx="0" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="17" x2="12" y2="13" />
              <line x1="10" y1="15" x2="14" y2="15" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setMathModal({ visible: true, editingElementId: null, initialLatex: '' })}
            className="w-8 h-8 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer font-mono font-bold text-xs"
            title="Inserir Equação Matemática LaTeX"
          >
            f(x)
          </button>

          <button
            type="button"
            onClick={() => setIsYouTubeModalOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Inserir Vídeo do YouTube"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
              <polygon points="10 15 15 12 10 9 10 15" />
            </svg>
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1 shrink-0" />

          {/* Toggle Left Style Inspector */}
          <button
            type="button"
            onClick={() => setIsStylePanelOpen((prev) => !prev)}
            className={`w-8 h-8 flex items-center justify-center rounded-none transition-colors cursor-pointer ${
              showPropertyInspector
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
            title="Painel de Propriedades do Excalidraw"
          >
            <div
              className="w-3.5 h-3.5 border border-white/40"
              style={{ backgroundColor: activeStrokeColor }}
            />
          </button>
        </div>
      )}

      {/* Excalidraw Left Properties Inspector */}
      {showPropertyInspector && (
        <div className="absolute top-16 left-4 z-40 flex flex-col gap-3 bg-[#181818]/95 backdrop-blur-md border border-white/10 p-3.5 rounded-none shadow-2xl text-xs text-white w-56 max-h-[calc(100%-8.5rem)] overflow-y-auto no-scrollbar font-sansation animate-in fade-in duration-100">
          {/* Stroke Color */}
          <div className="flex flex-col gap-1.5">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
              Traço
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {STROKE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setStrokeColor(c);
                    applyStyleChange((el) => ({ ...el, strokeColor: c }));
                  }}
                  className={`w-5 h-5 rounded-none border transition-transform cursor-pointer ${
                    activeStrokeColor === c
                      ? 'scale-110 border-white ring-1 ring-white'
                      : 'border-white/15 hover:scale-105 opacity-85 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={activeStrokeColor.startsWith('#') ? activeStrokeColor : '#ffffff'}
                onChange={(e) => {
                  setStrokeColor(e.target.value);
                  applyStyleChange((el) => ({ ...el, strokeColor: e.target.value }));
                }}
                className="w-5 h-5 bg-transparent border border-white/20 cursor-pointer p-0"
                title="Cor personalizada"
              />
            </div>
          </div>

          {/* Background Fill Color */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
              Fundo
            </span>
            <div className="flex flex-wrap gap-1.5">
              {FILL_COLORS.map((fc, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setFillColor(fc);
                    applyStyleChange((el) => ({ ...el, fillColor: fc }));
                  }}
                  className={`w-5 h-5 rounded-none border flex items-center justify-center transition-transform cursor-pointer ${
                    activeFillColor === fc
                      ? 'scale-110 border-white ring-1 ring-white'
                      : 'border-white/15 hover:scale-105 opacity-85 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: fc === 'transparent' ? '#141414' : fc }}
                >
                  {fc === 'transparent' && <span className="text-[9px] text-zinc-500">✕</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Fill Pattern (Hachure / Cross-Hatch / Dots / Solid) */}
          {activeFillColor !== 'transparent' && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
                Preenchimento
              </span>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { id: 'hachure', label: 'Hachura' },
                    { id: 'cross-hatch', label: 'Cruzado' },
                    { id: 'dots', label: 'Pontos' },
                    { id: 'solid', label: 'Sólido' },
                  ] as { id: FillStyleType; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setFillStyle(item.id);
                      applyStyleChange((el) => ({ ...el, fillStyle: item.id }));
                    }}
                    className={`h-6 text-[10px] rounded-none border cursor-pointer transition-colors ${
                      activeFillStyle === item.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-[#121212] text-zinc-400 border-white/10 hover:text-white'
                    }`}
                    title={item.label}
                  >
                    {item.label.slice(0, 4)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stroke Width */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
              Espessura
            </span>
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 4, 8].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    setStrokeWidth(w);
                    applyStyleChange((el) => ({ ...el, strokeWidth: w }));
                  }}
                  className={`h-6 flex items-center justify-center rounded-none border text-[11px] font-mono cursor-pointer transition-colors ${
                    activeStrokeWidth === w
                      ? 'bg-white text-black font-bold border-white'
                      : 'bg-[#121212] text-zinc-400 hover:text-white border-white/10'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>

          {/* Stroke Style (Solid / Dashed / Dotted) */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
              Estilo da Linha
            </span>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'solid', label: '───' },
                  { id: 'dashed', label: '- - -' },
                  { id: 'dotted', label: '• • •' },
                ] as { id: StrokeStyleType; label: string }[]
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setStrokeStyle(st.id);
                    applyStyleChange((el) => ({ ...el, strokeStyle: st.id }));
                  }}
                  className={`h-6 flex items-center justify-center rounded-none border text-[10px] font-mono cursor-pointer transition-colors ${
                    activeStrokeStyle === st.id
                      ? 'bg-white text-black font-bold border-white'
                      : 'bg-[#121212] text-zinc-400 hover:text-white border-white/10'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sloppiness / Roughness (Architect 0, Artist 1, Cartoonist 2) */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
              Traço Manual (Excalidraw)
            </span>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 0, label: 'Preciso' },
                  { id: 1, label: 'Artista' },
                  { id: 2, label: 'Rascunho' },
                ] as { id: SloppinessType; label: string }[]
              ).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRoughness(r.id);
                    applyStyleChange((el) => ({ ...el, roughness: r.id }));
                  }}
                  className={`h-6 flex items-center justify-center rounded-none border text-[10px] cursor-pointer transition-colors ${
                    activeRoughness === r.id
                      ? 'bg-white text-black font-bold border-white'
                      : 'bg-[#121212] text-zinc-400 hover:text-white border-white/10'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Edges (Sharp vs Round) */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
              Cantos
            </span>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  { id: 'sharp', label: 'Retos' },
                  { id: 'round', label: 'Arredondados' },
                ] as { id: EdgeRoundnessType; label: string }[]
              ).map((ed) => (
                <button
                  key={ed.id}
                  type="button"
                  onClick={() => {
                    setRoundness(ed.id);
                    applyStyleChange((el) => ({ ...el, roundness: ed.id }));
                  }}
                  className={`h-6 flex items-center justify-center rounded-none border text-[10px] cursor-pointer transition-colors ${
                    activeRoundness === ed.id
                      ? 'bg-white text-black font-bold border-white'
                      : 'bg-[#121212] text-zinc-400 hover:text-white border-white/10'
                  }`}
                >
                  {ed.label}
                </button>
              ))}
            </div>
          </div>

          {/* Typography Settings */}
          {(tool === 'text' ||
            selectedElements.some((el) =>
              ['text', 'rectangle', 'diamond', 'ellipse'].includes(el.type)
            )) && (
            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
                Tipografia
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'hand', label: 'Mão' },
                    { id: 'sans', label: 'Sans' },
                    { id: 'mono', label: 'Código' },
                  ] as { id: FontFamilyType; label: string }[]
                ).map((ff) => (
                  <button
                    key={ff.id}
                    type="button"
                    onClick={() => {
                      setFontFamily(ff.id);
                      applyStyleChange((el) => ({ ...el, fontFamily: ff.id }));
                    }}
                    className={`h-6 flex items-center justify-center rounded-none border text-[10px] cursor-pointer transition-colors ${
                      activeFontFamily === ff.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-[#121212] text-zinc-400 hover:text-white border-white/10'
                    }`}
                  >
                    {ff.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { sz: 14, label: 'S' },
                  { sz: 20, label: 'M' },
                  { sz: 28, label: 'L' },
                  { sz: 36, label: 'XL' },
                ].map((item) => (
                  <button
                    key={item.sz}
                    type="button"
                    onClick={() => {
                      setFontSize(item.sz);
                      applyStyleChange((el) => ({ ...el, fontSize: item.sz }));
                    }}
                    className={`h-6 flex items-center justify-center rounded-none border text-[10px] font-mono cursor-pointer transition-colors ${
                      activeFontSize === item.sz
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-[#121212] text-zinc-400 hover:text-white border-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'left', label: 'Esq' },
                    { id: 'center', label: 'Centro' },
                    { id: 'right', label: 'Dir' },
                  ] as { id: TextAlignType; label: string }[]
                ).map((al) => (
                  <button
                    key={al.id}
                    type="button"
                    onClick={() => {
                      setTextAlign(al.id);
                      applyStyleChange((el) => ({ ...el, textAlign: al.id }));
                    }}
                    className={`h-6 flex items-center justify-center rounded-none border text-[10px] cursor-pointer transition-colors ${
                      activeTextAlign === al.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-[#121212] text-zinc-400 hover:text-white border-white/10'
                    }`}
                  >
                    {al.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Arrowheads Selector */}
          {(tool === 'arrow' || selectedElements.some((el) => el.type === 'arrow')) && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
                Pontas da Seta (Início / Fim)
              </span>
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    { id: 'none', label: '—' },
                    { id: 'arrow', label: '→' },
                    { id: 'triangle', label: '▶' },
                    { id: 'bar', label: '⇥' },
                    { id: 'dot', label: '•' },
                  ] as { id: ArrowheadType; label: string }[]
                ).map((ah) => (
                  <button
                    key={`start-${ah.id}`}
                    type="button"
                    onClick={() => {
                      setStartArrowhead(ah.id);
                      applyStyleChange((el) => ({ ...el, startArrowhead: ah.id }));
                    }}
                    className={`h-6 flex items-center justify-center rounded-none border text-[11px] font-mono cursor-pointer ${
                      activeStartArrow === ah.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-[#121212] text-zinc-400 border-white/10'
                    }`}
                    title={`Início: ${ah.id}`}
                  >
                    {ah.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    { id: 'none', label: '—' },
                    { id: 'arrow', label: '→' },
                    { id: 'triangle', label: '▶' },
                    { id: 'bar', label: '⇥' },
                    { id: 'dot', label: '•' },
                  ] as { id: ArrowheadType; label: string }[]
                ).map((ah) => (
                  <button
                    key={`end-${ah.id}`}
                    type="button"
                    onClick={() => {
                      setEndArrowhead(ah.id);
                      applyStyleChange((el) => ({ ...el, endArrowhead: ah.id }));
                    }}
                    className={`h-6 flex items-center justify-center rounded-none border text-[11px] font-mono cursor-pointer ${
                      activeEndArrow === ah.id
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-[#121212] text-zinc-400 border-white/10'
                    }`}
                    title={`Fim: ${ah.id}`}
                  >
                    {ah.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Opacity Slider */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
                Opacidade
              </span>
              <span className="text-[11px] font-mono text-white">{activeOpacity}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={activeOpacity}
              onChange={(e) => {
                const val = Number(e.target.value);
                setOpacity(val);
                applyStyleChange((el) => ({ ...el, opacity: val }));
              }}
              className="w-full accent-white cursor-pointer h-1.5 bg-zinc-700"
            />
          </div>

          {/* Layer Ordering & Actions for Selected Elements */}
          {selectedElements.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
                Camadas & Ações
              </span>
              <div className="grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => handleLayerOrder('back')}
                  className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                  title="Enviar para trás (Ctrl+[)"
                >
                  ⇊
                </button>
                <button
                  type="button"
                  onClick={() => handleLayerOrder('backward')}
                  className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                  title="Recuar ( [ )"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleLayerOrder('forward')}
                  className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                  title="Avançar ( ] )"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleLayerOrder('front')}
                  className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                  title="Trazer para frente (Ctrl+])"
                >
                  ⇈
                </button>
              </div>

              {selectedElements.length >= 2 && (
                <div className="grid grid-cols-6 gap-1">
                  <button
                    type="button"
                    onClick={() => handleAlignSelection('left')}
                    className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                    title="Alinhar à esquerda"
                  >
                    ⇤
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignSelection('center-h')}
                    className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                    title="Centralizar horizontalmente"
                  >
                    ↔
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignSelection('right')}
                    className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                    title="Alinhar à direita"
                  >
                    ⇥
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignSelection('top')}
                    className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                    title="Alinhar ao topo"
                  >
                    ⇡
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignSelection('center-v')}
                    className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                    title="Centralizar verticalmente"
                  >
                    ↕
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignSelection('bottom')}
                    className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                    title="Alinhar à base"
                  >
                    ⇣
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={handleDuplicateSelection}
                  className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                  title="Duplicar (Ctrl+D)"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  onClick={handleToggleLock}
                  className="h-6 bg-[#121212] hover:bg-white/10 border border-white/10 text-[10px] text-zinc-300 cursor-pointer"
                  title="Bloquear / Desbloquear (Ctrl+Shift+L)"
                >
                  {firstSelected?.locked ? 'Desbloq.' : 'Bloquear'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const selectedSet = new Set(selectedIds);
                    commitElements(
                      elementsRef.current.filter((el) => !selectedSet.has(el.id) || el.locked)
                    );
                    setSelectedIds([]);
                  }}
                  className="h-6 bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-[10px] text-red-300 cursor-pointer"
                  title="Excluir (Del)"
                >
                  Excluir
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HTML5 Canvas Surface */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleCanvasDoubleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          if (isCollaborative && notaId) broadcastCursor(0, 0, false);
        }}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className={`w-full h-full block ${getCanvasCursor()}`}
      />

      {/* Live Collaborative Cursors */}
      {workspaceId && notaId && isCollaborative && (
        <LiveCursors
          cursors={cursors}
          transformCoord={(cursor) => ({
            x: cursor.x * zoom + pan.x,
            y: cursor.y * zoom + pan.y,
          })}
        />
      )}

      {/* Interactive Embedded Containers (Notes, Flashcards, Math, YouTube) */}
      {elements
        .filter((el) => ['note_card', 'flashcard', 'math', 'youtube'].includes(el.type))
        .map((el) => (
          <DrawingItemContainer
            key={el.id}
            element={el}
            zoom={zoom}
            pan={pan}
            isSelected={selectedIds.includes(el.id)}
            isInteractiveTool={tool === 'select'}
            onSelect={(shiftKey) => {
              if (shiftKey) {
                setSelectedIds((prev) =>
                  prev.includes(el.id) ? prev.filter((id) => id !== el.id) : [...prev, el.id]
                );
              } else {
                setSelectedIds([el.id]);
              }
            }}
            onUpdateElement={(updated, shouldCommit = true) => {
              const next = elementsRef.current.map((item) =>
                item.id === updated.id ? updated : item
              );
              if (shouldCommit) {
                commitElements(next);
              } else {
                setElements(next);
              }
            }}
            onDeleteElement={() => {
              const remaining = elementsRef.current.filter((item) => item.id !== el.id);
              commitElements(remaining);
              setSelectedIds([]);
            }}
            onEditMath={(item) =>
              setMathModal({
                visible: true,
                editingElementId: item.id,
                initialLatex: item.latex || '',
              })
            }
            onOpenNota={onOpenNota}
            onOpenCard={onOpenCard}
          />
        ))}

      {/* Inline Textarea Editor for Standalone Text and Bound Container Text */}
      {editingText && (() => {
        const lines = (editingText.text || ' ').split('\n');
        const longestLineLen = Math.max(...lines.map((l) => l.length), 12);
        const scaledFontSize = editingText.fontSize * zoom;
        const dynamicWidth =
          editingText.isContainerShape && editingText.width
            ? editingText.width * zoom
            : Math.max(160, (longestLineLen + 3) * scaledFontSize * 0.65);
        const dynamicHeight = Math.max(
          scaledFontSize * 1.5,
          lines.length * scaledFontSize * 1.35 + 8
        );

        return (
          <textarea
            ref={textareaRef}
            value={editingText.text}
            onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
            rows={Math.max(1, lines.length)}
            style={{
              position: 'absolute',
              left: `${editingText.worldX * zoom + pan.x}px`,
              top: `${
                editingText.isContainerShape && editingText.height
                  ? (editingText.worldY + editingText.height / 2) * zoom +
                    pan.y -
                    dynamicHeight / 2
                  : editingText.worldY * zoom + pan.y
              }px`,
              width: `${dynamicWidth}px`,
              height: `${dynamicHeight}px`,
              fontSize: `${scaledFontSize}px`,
              color: editingText.color,
              WebkitTextFillColor: editingText.color,
              caretColor: editingText.color,
              fontFamily: getFontFamilyCss(editingText.fontFamily),
              lineHeight: 1.32,
              textAlign: editingText.isContainerShape ? 'center' : editingText.textAlign,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: 0,
              margin: 0,
              resize: 'none',
              overflow: 'hidden',
              whiteSpace: 'pre',
              zIndex: 60,
            }}
            placeholder="Digite aqui..."
            onBlur={() => {
              if (Date.now() - textMountedAtRef.current > 250) finishTextEditing();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                editingTextIdRef.current = null;
                setEditingText(null);
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                finishTextEditing();
              }
            }}
          />
        );
      })()}

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          className="absolute z-50 w-52 bg-[#181818]/98 backdrop-blur-md border border-white/15 shadow-2xl py-1 text-xs text-zinc-200 font-sansation"
          onClick={(e) => e.stopPropagation()}
        >
          {selectedIds.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => {
                  handleDuplicateSelection();
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
              >
                <span>Duplicar</span>
                <span className="text-[10px] font-mono text-zinc-500">Ctrl+D</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleLayerOrder('front');
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
              >
                <span>Trazer para frente</span>
                <span className="text-[10px] font-mono text-zinc-500">Ctrl+]</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleLayerOrder('back');
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
              >
                <span>Enviar para trás</span>
                <span className="text-[10px] font-mono text-zinc-500">Ctrl+[</span>
              </button>
              {selectedIds.length >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    handleGroupSelection();
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
                >
                  <span>Agrupar seleção</span>
                  <span className="text-[10px] font-mono text-zinc-500">Ctrl+G</span>
                </button>
              )}
              {selectedElements.some((el) => el.groupIds && el.groupIds.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    handleUngroupSelection();
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
                >
                  <span>Desagrupar</span>
                  <span className="text-[10px] font-mono text-zinc-500">Ctrl+Shift+G</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  handleToggleLock();
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
              >
                <span>{firstSelected?.locked ? 'Desbloquear' : 'Bloquear'}</span>
                <span className="text-[10px] font-mono text-zinc-500">Ctrl+Shift+L</span>
              </button>
              <div className="my-1 border-t border-white/10" />
              <button
                type="button"
                onClick={() => {
                  const selectedSet = new Set(selectedIds);
                  commitElements(
                    elementsRef.current.filter((el) => !selectedSet.has(el.id) || el.locked)
                  );
                  setSelectedIds([]);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-red-500/20 text-red-400 flex items-center justify-between cursor-pointer"
              >
                <span>Excluir</span>
                <span className="text-[10px] font-mono">Del</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowGrid((prev) => !prev);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
              >
                <span>{showGrid ? 'Ocultar Grade' : 'Mostrar Grade'}</span>
                <span className="text-[10px] font-mono text-zinc-500">Ctrl+&apos;</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSnapToGrid((prev) => !prev);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
              >
                <span>{snapToGrid ? 'Desativar Snap na Grade' : 'Ativar Snap na Grade'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleZoomToFit();
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
              >
                <span>Ajustar Zoom ao Conteúdo</span>
                <span className="text-[10px] font-mono text-zinc-500">Shift+1</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setZenMode((prev) => !prev);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer"
              >
                <span>Modo Zen</span>
                <span className="text-[10px] font-mono text-zinc-500">Alt+Z</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Bottom-Left HUD: Zoom, Fit, Undo/Redo, Grid */}
      {!zenMode && (
        <div className="absolute bottom-4 left-4 z-40 flex items-center gap-1 bg-[#181818]/95 backdrop-blur-md border border-white/10 p-1 rounded-none shadow-2xl select-none font-sansation text-xs text-zinc-300">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.15, z - 0.15))}
            className="w-7 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-sm font-bold"
            title="Diminuir Zoom"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white transition-colors cursor-pointer font-mono text-[11px]"
            title="Resetar Zoom (100%)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(5, z + 0.15))}
            className="w-7 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-sm font-bold"
            title="Aumentar Zoom"
          >
            +
          </button>
          <button
            type="button"
            onClick={handleZoomToFit}
            className="px-2 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-[10px] font-mono"
            title="Ajustar ao Conteúdo (Shift+1)"
          >
            Fit
          </button>

          <div className="w-[1px] h-4 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="w-7 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Desfazer (Ctrl+Z)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="w-7 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Refazer (Ctrl+Y)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
            </svg>
          </button>
        </div>
      )}

      {/* Bottom-Right HUD: Export PNG, JSON, Shortcuts Help */}
      <div className="absolute bottom-4 right-4 z-40 flex items-center gap-1.5 select-none font-sansation">
        {zenMode ? (
          <button
            type="button"
            onClick={() => setZenMode(false)}
            className="h-8 px-3 rounded-none bg-[#181818]/95 border border-white/10 text-zinc-300 hover:text-white text-xs cursor-pointer"
          >
            Sair do Modo Zen (Alt+Z)
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => jsonInputRef.current?.click()}
              className="h-8 px-2.5 rounded-none bg-[#181818]/95 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs flex items-center gap-1 shadow-2xl"
              title="Importar arquivo .excalidraw / .json"
            >
              <span>Importar</span>
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="h-8 px-2.5 rounded-none bg-[#181818]/95 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs flex items-center gap-1 shadow-2xl"
              title="Salvar arquivo .excalidraw.json"
            >
              <span>JSON</span>
            </button>
            <button
              type="button"
              onClick={handleExportPNG}
              className="h-8 px-3 rounded-none bg-[#181818]/95 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs font-medium flex items-center gap-1.5 shadow-2xl"
              title="Exportar como imagem PNG"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>PNG</span>
            </button>
            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="w-8 h-8 rounded-none bg-[#181818]/95 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs font-mono font-bold flex items-center justify-center shadow-2xl"
              title="Atalhos do Teclado (?)"
            >
              ?
            </button>
          </>
        )}
      </div>

      {/* Shortcuts Help Modal */}
      {showShortcutsModal && (
        <div
          className="fixed inset-0 z-[2600] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div
            className="bg-[#181818] border border-white/15 w-full max-w-lg p-5 text-xs text-zinc-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white m-0">Atalhos do Excalidraw / Tesseract</h3>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-[11px]">
              <div className="flex justify-between"><span>Seleção</span><kbd className="font-mono text-white">V / 1</kbd></div>
              <div className="flex justify-between"><span>Retângulo</span><kbd className="font-mono text-white">R / 2</kbd></div>
              <div className="flex justify-between"><span>Losango</span><kbd className="font-mono text-white">D / 3</kbd></div>
              <div className="flex justify-between"><span>Elipse</span><kbd className="font-mono text-white">O / 4</kbd></div>
              <div className="flex justify-between"><span>Seta Conectora</span><kbd className="font-mono text-white">A / 5</kbd></div>
              <div className="flex justify-between"><span>Linha</span><kbd className="font-mono text-white">L / 6</kbd></div>
              <div className="flex justify-between"><span>Lápis Livre</span><kbd className="font-mono text-white">P / 7</kbd></div>
              <div className="flex justify-between"><span>Texto</span><kbd className="font-mono text-white">T / 8</kbd></div>
              <div className="flex justify-between"><span>Borracha</span><kbd className="font-mono text-white">E / 0</kbd></div>
              <div className="flex justify-between"><span>Frame / Quadro</span><kbd className="font-mono text-white">F</kbd></div>
              <div className="flex justify-between"><span>Laser Pointer</span><kbd className="font-mono text-white">K</kbd></div>
              <div className="flex justify-between"><span>Travar Ferramenta</span><kbd className="font-mono text-white">Q</kbd></div>
              <div className="flex justify-between"><span>Duplicar Arrastando</span><kbd className="font-mono text-white">Alt + Arrastar</kbd></div>
              <div className="flex justify-between"><span>Agrupar / Desagrupar</span><kbd className="font-mono text-white">Ctrl+G / Ctrl+Shift+G</kbd></div>
              <div className="flex justify-between"><span>Texto Dentro da Forma</span><kbd className="font-mono text-white">Enter / Duplo Clique</kbd></div>
              <div className="flex justify-between"><span>Ajustar Zoom</span><kbd className="font-mono text-white">Shift + 1</kbd></div>
              <div className="flex justify-between"><span>Modo Zen</span><kbd className="font-mono text-white">Alt + Z</kbd></div>
              <div className="flex justify-between"><span>Mostrar/Ocultar Grade</span><kbd className="font-mono text-white">Ctrl + &apos;</kbd></div>
            </div>
          </div>
        </div>
      )}

      {/* Tesseract Modals: Note/Flashcard Picker, Math LaTeX, YouTube */}
      {pickerModal && (
        <DrawingItemPickerModal
          type={pickerModal}
          notas={notas}
          workspaceId={workspaceId}
          onSelect={(item) => {
            const center = screenToWorld(
              (containerRef.current?.clientWidth || 800) / 2,
              (containerRef.current?.clientHeight || 600) / 2
            );
            const isCard = pickerModal === 'card';
            const newEl: DrawingElement = {
              id: `item-${Date.now()}`,
              type: isCard ? 'flashcard' : 'note_card',
              x: center.x - 150,
              y: center.y - 110,
              width: 300,
              height: 220,
              itemNota: item,
              strokeColor: '#ffffff',
              fillColor: 'transparent',
              strokeWidth: 1,
              opacity: 100,
            };
            commitElements([...elementsRef.current, newEl]);
            setSelectedIds([newEl.id]);
            setTool('select');
          }}
          onClose={() => setPickerModal(null)}
        />
      )}

      <MathEquationModal
        isOpen={mathModal.visible}
        initialLatex={mathModal.initialLatex}
        onClose={() => setMathModal({ visible: false, editingElementId: null, initialLatex: '' })}
        onConfirm={(latex) => {
          if (mathModal.editingElementId) {
            const next = elementsRef.current.map((item) =>
              item.id === mathModal.editingElementId ? { ...item, latex } : item
            );
            commitElements(next);
          } else {
            const center = screenToWorld(
              (containerRef.current?.clientWidth || 800) / 2,
              (containerRef.current?.clientHeight || 600) / 2
            );
            const newEl: DrawingElement = {
              id: `math-${Date.now()}`,
              type: 'math',
              x: center.x - 140,
              y: center.y - 60,
              width: 280,
              height: 120,
              latex,
              strokeColor: '#ffffff',
              fillColor: 'transparent',
              strokeWidth: 1,
              opacity: 100,
            };
            commitElements([...elementsRef.current, newEl]);
            setSelectedIds([newEl.id]);
            setTool('select');
          }
        }}
      />

      <DrawingYouTubeModal
        isOpen={isYouTubeModalOpen}
        onClose={() => setIsYouTubeModalOpen(false)}
        onConfirm={(youtubeId, url) => {
          const center = screenToWorld(
            (containerRef.current?.clientWidth || 800) / 2,
            (containerRef.current?.clientHeight || 600) / 2
          );
          const newEl: DrawingElement = {
            id: `yt-${Date.now()}`,
            type: 'youtube',
            x: center.x - 200,
            y: center.y - 120,
            width: 400,
            height: 240,
            youtubeId,
            youtubeUrl: url,
            strokeColor: '#ffffff',
            fillColor: 'transparent',
            strokeWidth: 1,
            opacity: 100,
          };
          commitElements([...elementsRef.current, newEl]);
          setSelectedIds([newEl.id]);
          setTool('select');
        }}
      />
    </div>
  );
}
