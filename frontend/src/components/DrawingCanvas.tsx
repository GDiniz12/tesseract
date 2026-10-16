'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import DrawingItemPickerModal from './DrawingItemPickerModal';
import DrawingItemContainer from './DrawingItemContainer';
import MathEquationModal from './MathEquationModal';
import DrawingYouTubeModal from './DrawingYouTubeModal';
import { useCollaboration } from '@/hooks/useCollaboration';
import LiveCursors from './LiveCursors';

export type ToolType =
  | 'hand'
  | 'select'
  | 'pencil'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'text'
  | 'image'
  | 'eraser';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingElement {
  id: string;
  type:
    | 'pencil'
    | 'rectangle'
    | 'ellipse'
    | 'line'
    | 'arrow'
    | 'text'
    | 'image'
    | 'note_card'
    | 'flashcard'
    | 'math'
    | 'youtube';
  x: number;
  y: number;
  width?: number;
  height?: number;
  imageUrl?: string;
  points?: Point[];
  text?: string;
  fontSize?: number;
  latex?: string;
  youtubeUrl?: string;
  youtubeId?: string;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  itemNota?: any;
  cardData?: any;
}

export type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end';

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
}

const STROKE_COLORS = [
  '#ffffff', // White
  '#d4d4d8', // Light Gray
  '#a1a1aa', // Zinc
  '#71717a', // Dark Gray
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
];

const FILL_COLORS = [
  'transparent',
  'rgba(255, 255, 255, 0.12)',
  'rgba(255, 255, 255, 0.25)',
  'rgba(59, 130, 246, 0.25)',
  'rgba(34, 197, 94, 0.25)',
  'rgba(234, 179, 8, 0.25)',
  'rgba(239, 68, 68, 0.25)',
  'rgba(168, 85, 247, 0.25)',
];

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
}: DrawingCanvasProps) {
  const [elements, setElements] = useState<DrawingElement[]>(() => {
    if (initialData) {
      try {
        const parsed = JSON.parse(initialData);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  });

  const { users, cursors, status, broadcastChange, broadcastCursor } = useCollaboration(
    isCollaborative && notaId ? `${workspaceId}:${notaId}` : undefined,
    'drawing_change',
    (newVal: string) => {
      try {
        const parsed = JSON.parse(newVal);
        if (Array.isArray(parsed)) setElements(parsed);
      } catch (e) {}
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

  // Tools & Styling States
  const [tool, setTool] = useState<ToolType>('select');
  const [strokeColor, setStrokeColor] = useState<string>('#ffffff');
  const [fillColor, setFillColor] = useState<string>('transparent');
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [isStylePanelOpen, setIsStylePanelOpen] = useState<boolean>(false);

  // Picker Modal State
  const [pickerModal, setPickerModal] = useState<'nota' | 'card' | null>(null);

  // Math Modal State
  const [mathModal, setMathModal] = useState<{
    visible: boolean;
    editingElementId: string | null;
    initialLatex: string;
  }>({
    visible: false,
    editingElementId: null,
    initialLatex: '',
  });

  // YouTube Modal State
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);

  // History Stack
  const [history, setHistory] = useState<DrawingElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const copiedElementsRef = useRef<DrawingElement[]>([]);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Pan & Zoom
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Text Input State
  const [editingText, setEditingText] = useState<{
    id: string;
    worldX: number;
    worldY: number;
    text: string;
    fontSize: number;
    color: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textMountedAtRef = useRef<number>(0);
  const editingTextIdRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const renderCanvasRef = useRef<() => void>(() => undefined);

  // Mouse action refs
  const mouseModeRef = useRef<
    'drawing' | 'dragging_elements' | 'resizing_handle' | 'marquee_selecting' | 'panning' | 'idle'
  >('idle');
  const activeHandleRef = useRef<HandleType | null>(null);
  const resizeInitialBoundsRef = useRef<Bounds | null>(null);
  const currentElementRef = useRef<DrawingElement | null>(null);
  const startPointRef = useRef<Point>({ x: 0, y: 0 });
  const dragInitialElementsRef = useRef<DrawingElement[]>([]);
  const dragSelectedIdsRef = useRef<string[]>([]);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const editOnClickRef = useRef<string | null>(null);
  const dragStartClientRef = useRef<Point>({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);

  // Touch gesture refs
  const initialTouchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  useEffect(() => {
    if (!editingText || editingTextIdRef.current === editingText.id) return;

    editingTextIdRef.current = editingText.id;
    const frameId = window.requestAnimationFrame(() => {
      if (textareaRef.current && editingTextIdRef.current === editingText.id) {
        textareaRef.current.focus();
        textMountedAtRef.current = Date.now();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [editingText]);

  const commitElements = useCallback(
    (newElements: DrawingElement[]) => {
      setElements(newElements);
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

  const finishTextEditing = useCallback(() => {
    if (!editingText) return;

    const trimmed = editingText.text.trim();
    if (trimmed) {
      const existingIdx = elements.findIndex((el) => el.id === editingText.id);
      if (existingIdx >= 0) {
        const updated = [...elements];
        updated[existingIdx] = { ...updated[existingIdx], text: trimmed };
        commitElements(updated);
      } else {
        const newEl: DrawingElement = {
          id: editingText.id,
          type: 'text',
          x: editingText.worldX,
          y: editingText.worldY,
          text: trimmed,
          fontSize: editingText.fontSize,
          strokeColor: editingText.color,
          fillColor: 'transparent',
          strokeWidth: 1,
        };
        commitElements([...elements, newEl]);
      }
    }
    editingTextIdRef.current = null;
    setEditingText(null);
  }, [commitElements, editingText, elements]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      const targetState = history[targetIndex];
      setElements(targetState);
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
      setHistoryIndex(targetIndex);
      onChange(JSON.stringify(targetState));
      setSelectedIds([]);
    }
  }, [history, historyIndex, onChange]);

  // Coordinate Conversion
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      return {
        x: (screenX - pan.x) / zoom,
        y: (screenY - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const getElementBounds = useCallback((el: DrawingElement): Bounds => {
    if (el.type === 'text') {
      const fontSize = el.fontSize || 18;
      const lines = (el.text || '').split('\n');
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (context) context.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      const measuredWidth = lines.reduce((width, line) => {
        const lineWidth = context?.measureText(line).width ?? line.length * fontSize * 0.6;
        return Math.max(width, lineWidth);
      }, 0);
      const width = Math.max(measuredWidth, fontSize * 0.6);
      const height = Math.max(lines.length, 1) * fontSize * 1.3;
      return { minX: el.x, minY: el.y, maxX: el.x + width, maxY: el.y + height };
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
    const w = el.width || 0;
    const h = el.height || 0;
    const minX = Math.min(el.x, el.x + w);
    const maxX = Math.max(el.x, el.x + w);
    const minY = Math.min(el.y, el.y + h);
    const maxY = Math.max(el.y, el.y + h);
    return { minX, minY, maxX, maxY };
  }, []);

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
          const b = getElementBounds(el);
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

  const isPointInElement = useCallback(
    (point: Point, el: DrawingElement): boolean => {
      const padding = 8;
      const b = getElementBounds(el);
      return (
        point.x >= b.minX - padding &&
        point.x <= b.maxX + padding &&
        point.y >= b.minY - padding &&
        point.y <= b.maxY + padding
      );
    },
    [getElementBounds]
  );

  const isElementInSelectionBox = useCallback(
    (
      el: DrawingElement,
      box: { startX: number; startY: number; currentX: number; currentY: number }
    ): boolean => {
      const minBoxX = Math.min(box.startX, box.currentX);
      const maxBoxX = Math.max(box.startX, box.currentX);
      const minBoxY = Math.min(box.startY, box.currentY);
      const maxBoxY = Math.max(box.startY, box.currentY);

      const b = getElementBounds(el);
      return b.maxX >= minBoxX && b.minX <= maxBoxX && b.maxY >= minBoxY && b.minY <= maxBoxY;
    },
    [getElementBounds]
  );

  // Resize Handle Hit Testing
  const getHandleAtPoint = useCallback(
    (point: Point, bounds: Bounds): HandleType | null => {
      const handleSize = 10 / zoom;
      const { minX, minY, maxX, maxY } = bounds;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

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
          point.x >= h.x - handleSize &&
          point.x <= h.x + handleSize &&
          point.y >= h.y - handleSize &&
          point.y <= h.y + handleSize
        ) {
          return h.type;
        }
      }
      return null;
    },
    [zoom]
  );

  // Main Canvas Render Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Fundo #141414
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Grid de pontos sutis
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

    // Renderizar Elementos
    elements.forEach((el) => {
      ctx.save();
      ctx.strokeStyle = el.strokeColor || '#ffffff';
      ctx.fillStyle = el.fillColor || 'transparent';
      ctx.lineWidth = el.strokeWidth || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.type === 'pencil' && el.points && el.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
      } else if (el.type === 'rectangle') {
        const w = el.width || 0;
        const h = el.height || 0;
        if (el.fillColor && el.fillColor !== 'transparent') {
          ctx.fillRect(el.x, el.y, w, h);
        }
        ctx.strokeRect(el.x, el.y, w, h);
      } else if (el.type === 'ellipse') {
        const w = Math.abs(el.width || 0);
        const h = Math.abs(el.height || 0);
        const centerX = el.x + (el.width || 0) / 2;
        const centerY = el.y + (el.height || 0) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, w / 2, h / 2, 0, 0, Math.PI * 2);
        if (el.fillColor && el.fillColor !== 'transparent') {
          ctx.fill();
        }
        ctx.stroke();
      } else if (el.type === 'line' && el.points && el.points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        ctx.lineTo(el.points[1].x, el.points[1].y);
        ctx.stroke();
      } else if (el.type === 'arrow' && el.points && el.points.length === 2) {
        const [p1, p2] = el.points;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Cabeça da seta
        const headlen = 14;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headlen * Math.cos(angle - Math.PI / 6),
          p2.y - headlen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headlen * Math.cos(angle + Math.PI / 6),
          p2.y - headlen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      } else if (el.type === 'text' && (el.id === editingText?.id || el.text)) {
        const fSize = el.fontSize || 18;
        ctx.font = `${fSize}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        ctx.fillStyle = el.strokeColor || '#ffffff';
        ctx.textBaseline = 'top';
        const text = el.id === editingText?.id ? editingText.text : el.text || '';
        const lines = text.split('\n');
        lines.forEach((line, i) => {
          ctx.fillText(line, el.x, el.y + i * (fSize * 1.3));
        });
      } else if (el.type === 'image' && el.imageUrl) {
        let img = imageCacheRef.current.get(el.imageUrl);
        if (!img) {
          img = new Image();
          img.src = el.imageUrl;
          img.onload = () => renderCanvas();
          imageCacheRef.current.set(el.imageUrl, img);
        } else if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, el.x, el.y, el.width || 200, el.height || 150);
        }
      }

      ctx.restore();
    });

    // Renderizar Elemento Atual sendo Desenhado
    if (currentElementRef.current) {
      const el = currentElementRef.current;
      ctx.save();
      ctx.strokeStyle = el.strokeColor || '#ffffff';
      ctx.fillStyle = el.fillColor || 'transparent';
      ctx.lineWidth = el.strokeWidth || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.type === 'pencil' && el.points && el.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
      } else if (el.type === 'rectangle') {
        const w = el.width || 0;
        const h = el.height || 0;
        if (el.fillColor && el.fillColor !== 'transparent') {
          ctx.fillRect(el.x, el.y, w, h);
        }
        ctx.strokeRect(el.x, el.y, w, h);
      } else if (el.type === 'ellipse') {
        const w = Math.abs(el.width || 0);
        const h = Math.abs(el.height || 0);
        const centerX = el.x + (el.width || 0) / 2;
        const centerY = el.y + (el.height || 0) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, w / 2, h / 2, 0, 0, Math.PI * 2);
        if (el.fillColor && el.fillColor !== 'transparent') {
          ctx.fill();
        }
        ctx.stroke();
      } else if (el.type === 'line' && el.points && el.points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        ctx.lineTo(el.points[1].x, el.points[1].y);
        ctx.stroke();
      } else if (el.type === 'arrow' && el.points && el.points.length === 2) {
        const [p1, p2] = el.points;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const headlen = 14;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headlen * Math.cos(angle - Math.PI / 6),
          p2.y - headlen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headlen * Math.cos(angle + Math.PI / 6),
          p2.y - headlen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }

      ctx.restore();
    }

    // Caixa de Seleção / Bounding Box dos Elementos Selecionados
    const bounds = getMultiSelectionBounds(selectedIds);
    if (bounds && tool === 'select') {
      const padding = 6 / zoom;
      const bMinX = bounds.minX - padding;
      const bMinY = bounds.minY - padding;
      const bMaxX = bounds.maxX + padding;
      const bMaxY = bounds.maxY + padding;
      const bW = bMaxX - bMinX;
      const bH = bMaxY - bMinY;

      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.strokeRect(bMinX, bMinY, bW, bH);

      // Alças de redimensionamento (Handles)
      const handleSize = 7 / zoom;
      const midX = (bMinX + bMaxX) / 2;
      const midY = (bMinY + bMaxY) / 2;
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

      ctx.restore();
    }

    // Caixa de Seleção Marquee (Arrastar para selecionar)
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1 / zoom;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.restore();
    }

    ctx.restore();
  }, [
    elements,
    getMultiSelectionBounds,
    pan,
    selectedIds,
    selectionBox,
    editingText?.id,
    editingText?.text,
    tool,
    zoom,
  ]);

  renderCanvasRef.current = renderCanvas;

  // Redimensionamento do canvas conforme container
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      renderCanvasRef.current();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Inserção de Imagem
  const handleInsertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const center = screenToWorld(
          (containerRef.current?.clientWidth || 800) / 2,
          (containerRef.current?.clientHeight || 600) / 2
        );
        const maxDim = 320;
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
        };
        commitElements([...elements, newEl]);
        setSelectedIds([newEl.id]);
        setTool('select');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldPoint = screenToWorld(clientX, clientY);

    editOnClickRef.current = null;
    dragMovedRef.current = false;
    dragStartClientRef.current = { x: e.clientX, y: e.clientY };

    broadcastCursor(worldPoint.x, worldPoint.y);

    // Pan com botão do meio ou Spacebar ou Tool Hand
    if (e.button === 1 || tool === 'hand' || isSpacePressed) {
      isPanningRef.current = true;
      mouseModeRef.current = 'panning';
      panStartRef.current = { x: clientX - pan.x, y: clientY - pan.y };
      return;
    }

    if (e.button !== 0) return;

    // Concluir edição ao clicar fora da área de texto.
    if (editingText && Date.now() - textMountedAtRef.current > 300) finishTextEditing();

    startPointRef.current = worldPoint;

    // 1. Tool Select: Checar Resize Handles se houver seleção
    if (tool === 'select' && selectedIds.length > 0) {
      const bounds = getMultiSelectionBounds(selectedIds);
      if (bounds) {
        const handle = getHandleAtPoint(worldPoint, bounds);
        if (handle) {
          mouseModeRef.current = 'resizing_handle';
          activeHandleRef.current = handle;
          resizeInitialBoundsRef.current = bounds;
          dragInitialElementsRef.current = elements.map((el) => ({ ...el }));
          dragSelectedIdsRef.current = [...selectedIds];
          return;
        }
      }
    }

    // 2. Tool Select: Checar Clique em Elementos
    if (tool === 'select') {
      const hit = [...elements].reverse().find((el) => isPointInElement(worldPoint, el));
      if (hit) {
        if (hit.type === 'text' && selectedIds.includes(hit.id)) {
          editOnClickRef.current = hit.id;
        }

        if (e.shiftKey) {
          setSelectedIds((prev) =>
            prev.includes(hit.id) ? prev.filter((id) => id !== hit.id) : [...prev, hit.id]
          );
        } else {
          if (!selectedIds.includes(hit.id)) {
            setSelectedIds([hit.id]);
          }
        }
        mouseModeRef.current = 'dragging_elements';
        dragInitialElementsRef.current = elements.map((el) => ({ ...el }));
        dragSelectedIdsRef.current = selectedIds.includes(hit.id)
          ? [...selectedIds]
          : [hit.id];
        return;
      } else {
        if (!e.shiftKey) {
          setSelectedIds([]);
        }
        const bounds = getMultiSelectionBounds(selectedIds);
        if (
          bounds &&
          worldPoint.x >= bounds.minX &&
          worldPoint.x <= bounds.maxX &&
          worldPoint.y >= bounds.minY &&
          worldPoint.y <= bounds.maxY
        ) {
          mouseModeRef.current = 'dragging_elements';
          dragInitialElementsRef.current = elements.map((el) => ({ ...el }));
          dragSelectedIdsRef.current = [...selectedIds];
          return;
        }
        mouseModeRef.current = 'marquee_selecting';
        setSelectionBox({
          startX: worldPoint.x,
          startY: worldPoint.y,
          currentX: worldPoint.x,
          currentY: worldPoint.y,
        });
        return;
      }
    }

    // 3. Tool Text: Inserir novo texto
    if (tool === 'text') {
      const newId = `text-${Date.now()}`;
      setEditingText({
        id: newId,
        worldX: worldPoint.x,
        worldY: worldPoint.y,
        text: '',
        fontSize: 18,
        color: strokeColor,
      });
      setTool('select');
      return;
    }

    // 4. Tool Eraser
    if (tool === 'eraser') {
      const hit = [...elements].reverse().find((el) => isPointInElement(worldPoint, el));
      if (hit) {
        const remaining = elements.filter((el) => el.id !== hit.id);
        commitElements(remaining);
      }
      return;
    }

    // 5. Drawing Shapes (Pencil, Rect, Ellipse, Line, Arrow)
    mouseModeRef.current = 'drawing';
    const newId = `el-${Date.now()}`;

    if (tool === 'pencil') {
      currentElementRef.current = {
        id: newId,
        type: 'pencil',
        x: worldPoint.x,
        y: worldPoint.y,
        points: [worldPoint],
        strokeColor,
        fillColor: 'transparent',
        strokeWidth,
      };
    } else if (tool === 'rectangle') {
      currentElementRef.current = {
        id: newId,
        type: 'rectangle',
        x: worldPoint.x,
        y: worldPoint.y,
        width: 0,
        height: 0,
        strokeColor,
        fillColor,
        strokeWidth,
      };
    } else if (tool === 'ellipse') {
      currentElementRef.current = {
        id: newId,
        type: 'ellipse',
        x: worldPoint.x,
        y: worldPoint.y,
        width: 0,
        height: 0,
        strokeColor,
        fillColor,
        strokeWidth,
      };
    } else if (tool === 'line') {
      currentElementRef.current = {
        id: newId,
        type: 'line',
        x: worldPoint.x,
        y: worldPoint.y,
        points: [worldPoint, worldPoint],
        strokeColor,
        fillColor: 'transparent',
        strokeWidth,
      };
    } else if (tool === 'arrow') {
      currentElementRef.current = {
        id: newId,
        type: 'arrow',
        x: worldPoint.x,
        y: worldPoint.y,
        points: [worldPoint, worldPoint],
        strokeColor,
        fillColor: 'transparent',
        strokeWidth,
      };
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'select') return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldPoint = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = [...elements].reverse().find(
      (element) => element.type === 'text' && isPointInElement(worldPoint, element)
    );
    if (!hit) return;

    e.preventDefault();
    e.stopPropagation();
    setSelectedIds([hit.id]);
    setEditingText({
      id: hit.id,
      worldX: hit.x,
      worldY: hit.y,
      text: hit.text || '',
      fontSize: hit.fontSize || 18,
      color: hit.strokeColor || '#ffffff',
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldPoint = screenToWorld(clientX, clientY);

    broadcastCursor(worldPoint.x, worldPoint.y);

    // Panning
    if (isPanningRef.current || mouseModeRef.current === 'panning') {
      setPan({
        x: clientX - panStartRef.current.x,
        y: clientY - panStartRef.current.y,
      });
      return;
    }

    // 1. Resizing Handle
    if (
      mouseModeRef.current === 'resizing_handle' &&
      activeHandleRef.current &&
      resizeInitialBoundsRef.current
    ) {
      const handle = activeHandleRef.current;
      const initBounds = resizeInitialBoundsRef.current;
      const initW = initBounds.maxX - initBounds.minX || 1;
      const initH = initBounds.maxY - initBounds.minY || 1;

      let newMinX = initBounds.minX;
      let newMaxX = initBounds.maxX;
      let newMinY = initBounds.minY;
      let newMaxY = initBounds.maxY;

      if (handle.includes('e')) newMaxX = worldPoint.x;
      if (handle.includes('w')) newMinX = worldPoint.x;
      if (handle.includes('s')) newMaxY = worldPoint.y;
      if (handle.includes('n')) newMinY = worldPoint.y;

      let newW = newMaxX - newMinX;
      let newH = newMaxY - newMinY;
      if (Math.abs(newW) < 10) newW = 10;
      if (Math.abs(newH) < 10) newH = 10;

      const scaleX = (newMaxX - newMinX) / initW;
      const scaleY = (newMaxY - newMinY) / initH;
      const selectedSet = new Set(dragSelectedIdsRef.current);

      setElements((prev) =>
        prev.map((el) => {
          if (!selectedSet.has(el.id)) return el;
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
            const initFontSize = initial.fontSize || 18;
            const uniformScale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
            const newFontSize = Math.max(10, Math.round(initFontSize * uniformScale));
            return {
              ...el,
              x: targetX,
              y: targetY,
              fontSize: newFontSize,
            };
          }

          const targetW = Math.max(10, (initial.width || 50) * Math.abs(scaleX));
          const targetH = Math.max(10, (initial.height || 50) * Math.abs(scaleY));

          return {
            ...el,
            x: targetX,
            y: targetY,
            width: targetW,
            height: targetH,
          };
        })
      );
      return;
    }

    // 2. Dragging Selected Elements
    if (mouseModeRef.current === 'dragging_elements' && dragSelectedIdsRef.current.length > 0) {
      if (editOnClickRef.current && !dragMovedRef.current) {
        const deltaX = e.clientX - dragStartClientRef.current.x;
        const deltaY = e.clientY - dragStartClientRef.current.y;
        if (Math.hypot(deltaX, deltaY) < 4) return;
        dragMovedRef.current = true;
      }

      const dx = worldPoint.x - startPointRef.current.x;
      const dy = worldPoint.y - startPointRef.current.y;
      const selectedSet = new Set(dragSelectedIdsRef.current);

      setElements((prev) =>
        prev.map((el) => {
          if (!selectedSet.has(el.id)) return el;
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

    // 3. Marquee Selection Box
    if (mouseModeRef.current === 'marquee_selecting') {
      setSelectionBox((prev) =>
        prev ? { ...prev, currentX: worldPoint.x, currentY: worldPoint.y } : null
      );
      const box = {
        startX: startPointRef.current.x,
        startY: startPointRef.current.y,
        currentX: worldPoint.x,
        currentY: worldPoint.y,
      };
      const hits = elements.filter((el) => isElementInSelectionBox(el, box)).map((el) => el.id);
      setSelectedIds(hits);
      return;
    }

    // 4. Eraser Drag
    if (tool === 'eraser' && e.buttons === 1) {
      const hit = [...elements].reverse().find((el) => isPointInElement(worldPoint, el));
      if (hit) {
        const remaining = elements.filter((el) => el.id !== hit.id);
        commitElements(remaining);
      }
      return;
    }

    // 5. Drawing Shape in Progress
    if (mouseModeRef.current === 'drawing' && currentElementRef.current) {
      const curr = currentElementRef.current;
      if (curr.type === 'pencil' && curr.points) {
        curr.points.push(worldPoint);
      } else if (curr.type === 'rectangle' || curr.type === 'ellipse') {
        curr.width = worldPoint.x - startPointRef.current.x;
        curr.height = worldPoint.y - startPointRef.current.y;
      } else if ((curr.type === 'line' || curr.type === 'arrow') && curr.points) {
        curr.points[1] = worldPoint;
      }
      renderCanvas();
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;

    if (mouseModeRef.current === 'resizing_handle') {
      mouseModeRef.current = 'idle';
      activeHandleRef.current = null;
      resizeInitialBoundsRef.current = null;
      dragInitialElementsRef.current = [];
      dragSelectedIdsRef.current = [];
      commitElements(elements);
      return;
    }

    if (mouseModeRef.current === 'dragging_elements') {
      const editTextId = editOnClickRef.current;
      const shouldEditText = editTextId !== null && !dragMovedRef.current;
      mouseModeRef.current = 'idle';
      dragInitialElementsRef.current = [];
      dragSelectedIdsRef.current = [];
      editOnClickRef.current = null;
      if (shouldEditText) {
        const textElement = elements.find((element) => element.id === editTextId);
        if (textElement) {
          setEditingText({
            id: textElement.id,
            worldX: textElement.x,
            worldY: textElement.y,
            text: textElement.text || '',
            fontSize: textElement.fontSize || 18,
            color: textElement.strokeColor || '#ffffff',
          });
          return;
        }
      }
      commitElements(elements);
      return;
    }

    if (mouseModeRef.current === 'marquee_selecting') {
      mouseModeRef.current = 'idle';
      setSelectionBox(null);
      return;
    }

    if (mouseModeRef.current === 'drawing' && currentElementRef.current) {
      mouseModeRef.current = 'idle';
      const newEl = currentElementRef.current;
      currentElementRef.current = null;
      commitElements([...elements, newEl]);

      if (newEl.type !== 'pencil') {
        setTool('select');
        setSelectedIds([newEl.id]);
      } else {
        setSelectedIds([]);
      }
      return;
    }

    mouseModeRef.current = 'idle';
  };

  // Keyboard Shortcuts
  useEffect(() => {
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

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedIds.length === 0) return;
        const selectedSet = new Set(selectedIds);
        copiedElementsRef.current = elements
          .filter((element) => selectedSet.has(element.id))
          .map((element) => ({ ...element, points: element.points?.map((point) => ({ ...point })) }));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (copiedElementsRef.current.length === 0) return;
        e.preventDefault();
        const copies = copiedElementsRef.current.map((element) => ({
          ...element,
          id: `${element.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          x: element.x + 20,
          y: element.y + 20,
          points: element.points?.map((point) => ({ x: point.x + 20, y: point.y + 20 })),
        }));
        copiedElementsRef.current = copies.map((element) => ({
          ...element,
          points: element.points?.map((point) => ({ ...point })),
        }));
        commitElements([...elements, ...copies]);
        setSelectedIds(copies.map((element) => element.id));
        setTool('select');
        return;
      }

      if (e.code === 'Space') {
        setIsSpacePressed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          const selectedSet = new Set(selectedIds);
          const remaining = elements.filter((el) => !selectedSet.has(el.id));
          setSelectedIds([]);
          commitElements(remaining);
        }
      }
      // Tool Hotkeys
      if (e.key === 'h' || e.key === '0') setTool('hand');
      if (e.key === 'v' || e.key === '1') setTool('select');
      if (e.key === 'p' || e.key === '2') setTool('pencil');
      if (e.key === 'r' || e.key === '3') setTool('rectangle');
      if (e.key === 'o' || e.key === '4') setTool('ellipse');
      if (e.key === 'a' || e.key === '5') setTool('arrow');
      if (e.key === 'l' || e.key === '6') setTool('line');
      if (e.key === 't' || e.key === '7') setTool('text');
      if (e.key === 'i' || e.key === '8') imageInputRef.current?.click();
      if (e.key === 'e' || e.key === '9') setTool('eraser');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [commitElements, editingText, elements, handleRedo, handleUndo, selectedIds]);

  // Zoom Scroll Handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.max(0.2, Math.min(4, zoom * zoomFactor));

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    setPan((prev) => ({
      x: clientX - (clientX - prev.x) * (newZoom / zoom),
      y: clientY - (clientY - prev.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  };

  // Export to PNG Image
  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${title || 'desenho-synap'}.png`;
    link.href = dataUrl;
    link.click();
  };

  const getCanvasCursor = () => {
    if (tool === 'hand' || isSpacePressed)
      return isPanningRef.current ? 'cursor-grabbing' : 'cursor-grab';
    switch (tool) {
      case 'select':
        return selectedIds.length > 0 ? 'cursor-move' : 'cursor-default';
      case 'pencil':
      case 'rectangle':
      case 'ellipse':
      case 'line':
      case 'arrow':
        return 'cursor-crosshair';
      case 'text':
        return 'cursor-text';
      case 'eraser':
        return 'cursor-pointer';
      default:
        return 'cursor-default';
    }
  };

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
          handleInsertImage(files[0]);
        }
      }}
      className="relative w-full h-full flex flex-col bg-[#141414] overflow-hidden select-none font-sansation"
    >
      {workspaceId && notaId && isCollaborative && users.length > 0 && (
        <div className="absolute right-4 top-4 z-40 flex items-center gap-2" aria-label="Pessoas neste desenho">
          <div className="flex items-center -space-x-2">
            {users.map((user, index) => {
              const displayName = user.username ? `@${user.username}` : (user.name || 'Anônimo');
              return (
                <div key={user.id || index} className="group/drawing-collaborator relative">
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-none border-2 border-[#141414] bg-zinc-800 text-xs font-semibold text-white">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                    ) : (user.name || user.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <span className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden whitespace-nowrap rounded border border-white/10 bg-[#121212] px-2 py-1 text-[11px] text-white shadow-xl group-hover/drawing-collaborator:block">
                    {displayName}
                  </span>
                </div>
              );
            })}
          </div>
          {users.length > 1 && <span className="text-xs text-zinc-400">{users.length}</span>}
        </div>
      )}

      {/* Input de Imagem Invisível */}
      <input
        type="file"
        ref={imageInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleInsertImage(file);
          }
          e.target.value = '';
        }}
        accept="image/*"
        className="hidden"
      />

      {/* Barra de Ferramentas Flutuante Superior */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 bg-[#181818]/95 backdrop-blur-md border border-white/10 p-1 rounded-none shadow-2xl max-w-[95vw] overflow-x-auto no-scrollbar select-none font-sansation">
        {/* Hand (0) */}
        <button
          type="button"
          onClick={() => {
            setTool('hand');
            setSelectedIds([]);
          }}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'hand'
              ? 'bg-white text-black font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Mão / Navegar (0 ou H)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            0
          </span>
        </button>

        {/* Select (1) */}
        <button
          type="button"
          onClick={() => setTool('select')}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'select'
              ? 'bg-white text-black font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Seleção / Mover (1 ou V)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
            <path d="m13 13 6 6"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            1
          </span>
        </button>

        {/* Pencil (2) */}
        <button
          type="button"
          onClick={() => {
            setTool('pencil');
            setSelectedIds([]);
          }}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'pencil'
              ? 'bg-white text-black font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Lápis Livre (2 ou P)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            2
          </span>
        </button>

        {/* Rectangle (3) */}
        <button
          type="button"
          onClick={() => {
            setTool('rectangle');
            setSelectedIds([]);
          }}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'rectangle'
              ? 'bg-white text-black font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Retângulo (3 ou R)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="0"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            3
          </span>
        </button>

        {/* Ellipse (4) */}
        <button
          type="button"
          onClick={() => {
            setTool('ellipse');
            setSelectedIds([]);
          }}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'ellipse'
              ? 'bg-white text-black font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Círculo / Elipse (4 ou O)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            4
          </span>
        </button>

        {/* Arrow (5) */}
        <button
          type="button"
          onClick={() => {
            setTool('arrow');
            setSelectedIds([]);
          }}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'arrow'
              ? 'bg-white text-black font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Seta Conectora (5 ou A)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            5
          </span>
        </button>

        {/* Line (6) */}
        <button
          type="button"
          onClick={() => {
            setTool('line');
            setSelectedIds([]);
          }}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'line'
              ? 'bg-white text-black font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Linha Reta (6 ou L)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="19" x2="19" y2="5"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            6
          </span>
        </button>

        {/* Text (7) */}
        <button
          type="button"
          onClick={() => {
            setTool('text');
            setSelectedIds([]);
          }}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'text'
              ? 'bg-white text-black font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Texto (7 ou T)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 4 4 20 4 20 7"/>
            <line x1="9" y1="20" x2="15" y2="20"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            7
          </span>
        </button>

        {/* Image (8) */}
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className="relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer text-zinc-400 hover:text-white hover:bg-white/10"
          title="Adicionar Imagem (8 ou I)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="0"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
          </svg>
          <span className="absolute right-0.5 bottom-0.5 text-[8px] font-mono leading-none select-none">
            8
          </span>
        </button>

        {/* Eraser (9) */}
        <button
          type="button"
          onClick={() => {
            setTool('eraser');
            setSelectedIds([]);
          }}
          className={`relative w-8 h-8 flex items-center justify-center rounded-none text-xs transition-colors cursor-pointer ${
            tool === 'eraser'
              ? 'bg-red-500 text-white font-bold shadow-xs'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Borracha (9 ou E)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
            <path d="M22 21H7"/>
            <path d="m5 11 9 9"/>
          </svg>
          <span className="absolute -top-1 -right-1 text-[8px] font-mono w-3.5 h-3.5 flex items-center justify-center rounded-none bg-[#121212] border border-white/15 text-zinc-400 leading-none select-none">
            9
          </span>
        </button>

        <div className="w-[1px] h-4 bg-white/10 mx-1 shrink-0" />

        {/* Insert Note Container */}
        <button
          type="button"
          onClick={() => setPickerModal('nota')}
          className="w-8 h-8 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Inserir Nota no Canvas"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </button>

        {/* Insert Flashcard Container */}
        <button
          type="button"
          onClick={() => setPickerModal('card')}
          className="w-8 h-8 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Inserir Flashcard no Canvas"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="14" x="3" y="5" rx="0"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="12" y1="17" x2="12" y2="13"/>
            <line x1="10" y1="15" x2="14" y2="15"/>
          </svg>
        </button>

        {/* Insert Math Equation */}
        <button
          type="button"
          onClick={() => setMathModal({ visible: true, editingElementId: null, initialLatex: '' })}
          className="w-8 h-8 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer font-mono font-bold text-xs"
          title="Inserir Equação Matemática LaTeX"
        >
          f(x)
        </button>

        {/* Insert YouTube Video */}
        <button
          type="button"
          onClick={() => setIsYouTubeModalOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Inserir Vídeo do YouTube"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
            <polygon points="10 15 15 12 10 9 10 15"/>
          </svg>
        </button>

        <div className="w-[1px] h-4 bg-white/10 mx-1 shrink-0" />

        {/* Botão de abrir/fechar painel de estilos */}
        <button
          type="button"
          onClick={() => setIsStylePanelOpen((prev) => !prev)}
          className={`w-8 h-8 flex items-center justify-center rounded-none transition-colors cursor-pointer ${
            isStylePanelOpen
              ? 'bg-white text-black font-bold'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="Estilo (Cores e Espessura)"
        >
          <div
            className="w-3.5 h-3.5 border border-white/40"
            style={{ backgroundColor: strokeColor }}
          />
        </button>
      </div>

      {/* Painel Flutuante Lateral de Estilo (Cores e Espessura) */}
      {isStylePanelOpen && (
        <div className="absolute top-16 left-4 z-40 flex flex-col gap-3 bg-[#181818]/95 backdrop-blur-md border border-white/10 p-3 rounded-none shadow-2xl text-xs text-white w-48 font-sansation animate-in fade-in zoom-in-95 duration-100">
          {/* Cor do Traço */}
          <div className="flex flex-col gap-1.5">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
              Cor do Traço
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {STROKE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setStrokeColor(c)}
                  className={`w-6 h-6 rounded-none border transition-transform cursor-pointer ${
                    strokeColor === c
                      ? 'scale-110 border-white ring-1 ring-white'
                      : 'border-white/15 hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Cor do Preenchimento */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
              Preenchimento
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {FILL_COLORS.map((fc, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFillColor(fc)}
                  className={`w-6 h-6 rounded-none border flex items-center justify-center transition-transform cursor-pointer ${
                    fillColor === fc
                      ? 'scale-110 border-white ring-1 ring-white'
                      : 'border-white/15 hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: fc === 'transparent' ? '#141414' : fc }}
                >
                  {fc === 'transparent' && <span className="text-[10px] text-zinc-500">✕</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Espessura do Traço */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                Espessura
              </span>
              <span className="text-xs font-mono font-bold text-white">{strokeWidth}px</span>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 4, 8].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setStrokeWidth(w)}
                  className={`flex-1 h-6 flex items-center justify-center rounded-none border text-[11px] font-mono cursor-pointer transition-colors ${
                    strokeWidth === w
                      ? 'bg-white text-black font-bold border-white'
                      : 'bg-[#121212] text-zinc-400 hover:text-white border-white/10 hover:bg-white/5'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>
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

      {workspaceId && notaId && isCollaborative && (
        <LiveCursors
          cursors={cursors}
          transformCoord={(cursor) => ({
            x: cursor.x * zoom + pan.x,
            y: cursor.y * zoom + pan.y,
          })}
        />
      )}

      {/* Interactive Embedded Containers (Cards, Notes, Math, YouTube) */}
      {elements
        .filter((el) => ['note_card', 'flashcard', 'math', 'youtube'].includes(el.type))
        .map((el) => (
          <DrawingItemContainer
            key={el.id}
            element={el}
            zoom={zoom}
            pan={pan}
            isSelected={selectedIds.includes(el.id)}
            onSelect={() => setSelectedIds([el.id])}
            onUpdateElement={(updated) => {
              const next = elements.map((item) => (item.id === updated.id ? updated : item));
              commitElements(next);
            }}
            onDeleteElement={() => {
              const remaining = elements.filter((item) => item.id !== el.id);
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
          />
        ))}

      {/* Inline Text Area Editor for Double-Click / Insert Text */}
      {editingText && (
        <textarea
          ref={textareaRef}
          value={editingText.text}
          onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
          style={{
            position: 'absolute',
            left: `${editingText.worldX * zoom + pan.x}px`,
            top: `${editingText.worldY * zoom + pan.y}px`,
            fontSize: `${editingText.fontSize * zoom}px`,
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
            caretColor: editingText.color,
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            lineHeight: 1.3,
            fontWeight: 400,
            letterSpacing: 'normal',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
            resize: 'none',
            minWidth: '100px',
            minHeight: '30px',
            zIndex: 60,
          }}
          placeholder="Digite aqui"
          onBlur={() => {
            if (Date.now() - textMountedAtRef.current > 300) finishTextEditing();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              editingTextIdRef.current = null;
              setEditingText(null);
            }
          }}
        />
      )}

      {/* Bottom-Left HUD: Zoom & Desfazer / Refazer */}
      <div className="absolute bottom-4 left-4 z-40 flex items-center gap-1 bg-[#181818]/95 backdrop-blur-md border border-white/10 p-1 rounded-none shadow-2xl select-none font-sansation text-xs text-zinc-300">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.2, z - 0.15))}
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
          onClick={() => setZoom((z) => Math.min(4, z + 0.15))}
          className="w-7 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-sm font-bold"
          title="Aumentar Zoom"
        >
          +
        </button>

        <div className="w-[1px] h-4 bg-white/10 mx-1" />

        <button
          type="button"
          onClick={handleUndo}
          disabled={historyIndex <= 0}
          className="w-7 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
          title="Desfazer (Ctrl+Z)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>

        <button
          type="button"
          onClick={handleRedo}
          disabled={historyIndex >= history.length - 1}
          className="w-7 h-7 flex items-center justify-center rounded-none hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
          title="Refazer (Ctrl+Y)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
          </svg>
        </button>
      </div>

      {/* Bottom-Right HUD: Exportar PNG */}
      <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 select-none font-sansation">
        <button
          type="button"
          onClick={handleExportPNG}
          className="h-8 px-3 rounded-none bg-[#181818]/95 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs font-medium flex items-center gap-1.5 shadow-2xl"
          title="Exportar como imagem PNG"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Exportar PNG</span>
        </button>
      </div>

      {/* Modais */}
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
              y: center.y - 100,
              width: 300,
              height: 200,
              itemNota: item,
              strokeColor: '#ffffff',
              fillColor: 'transparent',
              strokeWidth: 1,
            };
            commitElements([...elements, newEl]);
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
            const next = elements.map((item) =>
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
            };
            commitElements([...elements, newEl]);
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
          };
          commitElements([...elements, newEl]);
          setSelectedIds([newEl.id]);
          setTool('select');
        }}
      />
    </div>
  );
}
