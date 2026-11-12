'use client';

import React from 'react';

export type StrokeStyleType = 'solid' | 'dashed' | 'dotted';
export type FillStyleType = 'solid' | 'hachure' | 'cross-hatch' | 'dots';
export type SloppinessType = 0 | 1 | 2;
export type EdgeRoundnessType = 'sharp' | 'round';
export type FontFamilyType = 'hand' | 'sans' | 'mono';
export type TextAlignType = 'left' | 'center' | 'right';
export type ArrowheadType = 'none' | 'arrow' | 'bar' | 'dot' | 'triangle';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface BoundElement {
  id: string;
  type: 'arrow' | 'text';
}

export interface PointBinding {
  elementId: string;
  focus: number;
  gap: number;
}

export interface DrawingElement {
  id: string;
  type:
    | 'pencil'
    | 'rectangle'
    | 'diamond'
    | 'ellipse'
    | 'line'
    | 'arrow'
    | 'text'
    | 'image'
    | 'frame'
    | 'note_card'
    | 'flashcard'
    | 'math'
    | 'youtube';
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number; // radians
  seed?: number;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeStyle?: StrokeStyleType;
  fillStyle?: FillStyleType;
  roughness?: SloppinessType;
  roundness?: EdgeRoundnessType;
  opacity?: number; // 0 - 100
  locked?: boolean;
  groupIds?: string[];
  frameId?: string | null;
  // Text properties
  text?: string;
  fontSize?: number;
  fontFamily?: FontFamilyType;
  textAlign?: TextAlignType;
  containerId?: string | null; // Bound text inside shape
  // Linear / Freehand properties
  points?: Point[];
  startBinding?: PointBinding | null;
  endBinding?: PointBinding | null;
  startArrowhead?: ArrowheadType;
  endArrowhead?: ArrowheadType;
  curved?: boolean;
  // Frame label
  name?: string;
  // Media & Tesseract Custom Items
  imageUrl?: string;
  latex?: string;
  youtubeUrl?: string;
  youtubeId?: string;
  itemNota?: any;
  cardData?: any;
}

// Deterministic PRNG (Mulberry32) so hand-drawn jitter never flickers across frames
export function createPRNG(seed: number) {
  let a = seed || 1337;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getElementSeed(el: DrawingElement): number {
  if (typeof el.seed === 'number') return el.seed;
  return hashString(el.id || 'seed');
}

export function getFontFamilyCss(family?: FontFamilyType): string {
  switch (family) {
    case 'hand':
      return '"Short Stack", "Virgil", "Comic Sans MS", cursive, sans-serif';
    case 'mono':
      return '"Fira Code", "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
    case 'sans':
    default:
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }
}

export function rotatePoint(px: number, py: number, cx: number, cy: number, angle: number): Point {
  if (!angle) return { x: px, y: py };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export function getNormalizedBox(el: DrawingElement): NormalizedBox {
  const w = el.width ?? (el.type === 'youtube' ? 400 : el.type === 'math' ? 280 : el.type === 'note_card' || el.type === 'flashcard' ? 300 : 0);
  const h = el.height ?? (el.type === 'youtube' ? 240 : el.type === 'math' ? 120 : el.type === 'note_card' || el.type === 'flashcard' ? 200 : 0);
  const x = w < 0 ? el.x + w : el.x;
  const y = h < 0 ? el.y + h : el.y;
  const width = Math.abs(w);
  const height = Math.abs(h);
  return {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
  };
}

// Excalidraw-style Rough Line between two points
function drawRoughSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  roughness: number,
  rng: () => number
) {
  if (roughness === 0) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return;
  }

  const len = Math.hypot(x2 - x1, y2 - y1);
  const maxOffset = Math.min(len * 0.04, roughness * 1.6);

  // Double pass like RoughJS / Excalidraw
  for (let pass = 0; pass < 2; pass++) {
    const o = pass === 0 ? maxOffset : maxOffset * 0.65;
    const sx = x1 + (rng() - 0.5) * o;
    const sy = y1 + (rng() - 0.5) * o;
    const ex = x2 + (rng() - 0.5) * o;
    const ey = y2 + (rng() - 0.5) * o;

    const mid1X = x1 + (x2 - x1) * 0.35 + (rng() - 0.5) * o * 1.4;
    const mid1Y = y1 + (y2 - y1) * 0.35 + (rng() - 0.5) * o * 1.4;
    const mid2X = x1 + (x2 - x1) * 0.68 + (rng() - 0.5) * o * 1.4;
    const mid2Y = y1 + (y2 - y1) * 0.68 + (rng() - 0.5) * o * 1.4;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(mid1X, mid1Y, mid2X, mid2Y, ex, ey);
    ctx.stroke();
  }
}

// Clip path for shape interior fill (Hachure / Cross-hatch / Dots / Solid)
function buildShapePath(
  ctx: CanvasRenderingContext2D,
  type: DrawingElement['type'],
  x: number,
  y: number,
  w: number,
  h: number,
  roundness: EdgeRoundnessType
) {
  ctx.beginPath();
  if (type === 'rectangle' || type === 'frame') {
    const r = roundness === 'round' ? Math.min(w, h, 32) * 0.22 : 0;
    if (r > 0 && typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
  } else if (type === 'diamond') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (roundness === 'round' && w > 16 && h > 16) {
      const t = 0.12;
      ctx.moveTo(cx + (w / 2) * t, y + (h / 2) * t);
      ctx.lineTo(x + w - (w / 2) * t, cy - (h / 2) * t);
      ctx.quadraticCurveTo(x + w, cy, x + w - (w / 2) * t, cy + (h / 2) * t);
      ctx.lineTo(cx + (w / 2) * t, y + h - (h / 2) * t);
      ctx.quadraticCurveTo(cx, y + h, cx - (w / 2) * t, y + h - (h / 2) * t);
      ctx.lineTo(x + (w / 2) * t, cy + (h / 2) * t);
      ctx.quadraticCurveTo(x, cy, x + (w / 2) * t, cy - (h / 2) * t);
      ctx.lineTo(cx - (w / 2) * t, y + (h / 2) * t);
      ctx.quadraticCurveTo(cx, y, cx + (w / 2) * t, y + (h / 2) * t);
    } else {
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
    }
    ctx.closePath();
  } else if (type === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  }
}

function renderPatternFill(
  ctx: CanvasRenderingContext2D,
  el: DrawingElement,
  x: number,
  y: number,
  w: number,
  h: number,
  rng: () => number
) {
  if (!el.fillColor || el.fillColor === 'transparent' || w <= 1 || h <= 1) return;

  const fillStyle: FillStyleType = el.fillStyle || 'solid';
  const roundness: EdgeRoundnessType = el.roundness || 'round';

  ctx.save();
  buildShapePath(ctx, el.type, x, y, w, h, roundness);

  if (fillStyle === 'solid') {
    ctx.fillStyle = el.fillColor;
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.clip();
  ctx.strokeStyle = el.fillColor;
  ctx.fillStyle = el.fillColor;
  ctx.lineWidth = Math.max(1.25, (el.strokeWidth || 2) * 0.65);
  ctx.setLineDash([]);

  const gap = Math.max(7, (el.strokeWidth || 2) * 3.5);
  const diag = Math.hypot(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (fillStyle === 'dots') {
    const dotStep = Math.max(10, gap * 1.3);
    for (let px = x + dotStep / 2; px < x + w; px += dotStep) {
      for (let py = y + dotStep / 2; py < y + h; py += dotStep) {
        const jx = px + (rng() - 0.5) * 2;
        const jy = py + (rng() - 0.5) * 2;
        ctx.beginPath();
        ctx.arc(jx, jy, Math.max(1.2, ctx.lineWidth * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }

  const drawHatchPass = (angleDeg: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angleDeg * Math.PI) / 180);
    for (let offset = -diag; offset <= diag; offset += gap) {
      const jitter = (el.roughness ?? 1) * 1.1;
      const yOff1 = offset + (rng() - 0.5) * jitter;
      const yOff2 = offset + (rng() - 0.5) * jitter;
      ctx.beginPath();
      ctx.moveTo(-diag, yOff1);
      ctx.lineTo(diag, yOff2);
      ctx.stroke();
    }
    ctx.restore();
  };

  drawHatchPass(-45);
  if (fillStyle === 'cross-hatch') {
    drawHatchPass(45);
  }

  ctx.restore();
}

function drawRoughRectangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  roughness: number,
  roundness: EdgeRoundnessType,
  rng: () => number
) {
  if (roughness === 0 || roundness === 'round') {
    const r = roundness === 'round' ? Math.min(w, h, 32) * 0.22 : 0;
    const passes = roughness === 0 ? 1 : 2;
    for (let pass = 0; pass < passes; pass++) {
      const j = pass === 0 ? roughness * 0.85 : roughness * 0.5;
      const jx = (rng() - 0.5) * j;
      const jy = (rng() - 0.5) * j;
      const jw = w + (rng() - 0.5) * j * 1.2;
      const jh = h + (rng() - 0.5) * j * 1.2;
      ctx.beginPath();
      if (r > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(x + jx, y + jy, Math.max(1, jw), Math.max(1, jh), r);
      } else {
        ctx.rect(x + jx, y + jy, Math.max(1, jw), Math.max(1, jh));
      }
      ctx.stroke();
    }
    return;
  }

  // Sharp hand-drawn 4 edges
  drawRoughSegment(ctx, x, y, x + w, y, roughness, rng);
  drawRoughSegment(ctx, x + w, y, x + w, y + h, roughness, rng);
  drawRoughSegment(ctx, x + w, y + h, x, y + h, roughness, rng);
  drawRoughSegment(ctx, x, y + h, x, y, roughness, rng);
}

function drawRoughDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  roughness: number,
  roundness: EdgeRoundnessType,
  rng: () => number
) {
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (roundness === 'round' && w > 16 && h > 16) {
    const passes = roughness === 0 ? 1 : 2;
    for (let pass = 0; pass < passes; pass++) {
      const j = roughness * 0.8;
      const ox = (rng() - 0.5) * j;
      const oy = (rng() - 0.5) * j;
      buildShapePath(ctx, 'diamond', x + ox, y + oy, w, h, 'round');
      ctx.stroke();
    }
    return;
  }

  drawRoughSegment(ctx, cx, y, x + w, cy, roughness, rng);
  drawRoughSegment(ctx, x + w, cy, cx, y + h, roughness, rng);
  drawRoughSegment(ctx, cx, y + h, x, cy, roughness, rng);
  drawRoughSegment(ctx, x, cy, cx, y, roughness, rng);
}

function drawRoughEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  roughness: number,
  rng: () => number
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (rx <= 0.5 || ry <= 0.5) return;

  if (roughness === 0) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  for (let pass = 0; pass < 2; pass++) {
    const j = (pass === 0 ? 1 : 0.65) * roughness * 1.15;
    const steps = 16;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const px = cx + Math.cos(theta) * rx + (rng() - 0.5) * j;
      const py = cy + Math.sin(theta) * ry + (rng() - 0.5) * j;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

export function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  from: Point,
  type: ArrowheadType | undefined,
  strokeWidth: number,
  strokeColor: string
) {
  if (!type || type === 'none') return;
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const headLen = Math.max(11, strokeWidth * 3.8);

  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(
      tip.x - headLen * Math.cos(angle - Math.PI / 6),
      tip.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(
      tip.x - headLen * Math.cos(angle + Math.PI / 6),
      tip.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  } else if (type === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(
      tip.x - headLen * Math.cos(angle - Math.PI / 6.5),
      tip.y - headLen * Math.sin(angle - Math.PI / 6.5)
    );
    ctx.lineTo(
      tip.x - headLen * Math.cos(angle + Math.PI / 6.5),
      tip.y - headLen * Math.sin(angle + Math.PI / 6.5)
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (type === 'bar') {
    const barHalf = headLen * 0.55;
    const perp = angle + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(tip.x + Math.cos(perp) * barHalf, tip.y + Math.sin(perp) * barHalf);
    ctx.lineTo(tip.x - Math.cos(perp) * barHalf, tip.y - Math.sin(perp) * barHalf);
    ctx.stroke();
  } else if (type === 'dot') {
    const r = Math.max(4, strokeWidth * 1.7);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Smooth freehand stroke (Catmull-Rom / Quadratic midpoint spline + velocity width modulation)
function drawSmoothFreehand(ctx: CanvasRenderingContext2D, points: Point[], strokeWidth: number) {
  if (points.length === 0) return;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

// Compute the boundary point of a shape along a ray from its center toward targetPoint
export function getShapeBorderPoint(
  shape: DrawingElement,
  targetPoint: Point,
  gap: number = 6
): Point {
  const box = getNormalizedBox(shape);
  const cx = box.cx;
  const cy = box.cy;
  const halfW = Math.max(1, box.width / 2) + gap;
  const halfH = Math.max(1, box.height / 2) + gap;

  // Transform target into shape's unrotated local frame if rotated
  const localTarget = shape.angle
    ? rotatePoint(targetPoint.x, targetPoint.y, cx, cy, -shape.angle)
    : targetPoint;

  const dx = localTarget.x - cx;
  const dy = localTarget.y - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx + halfW, y: cy };
  }

  let localHit: Point;

  if (shape.type === 'ellipse') {
    const angle = Math.atan2(dy, dx);
    localHit = {
      x: cx + halfW * Math.cos(angle),
      y: cy + halfH * Math.sin(angle),
    };
  } else if (shape.type === 'diamond') {
    // |x / halfW| + |y / halfH| = 1
    const denom = Math.abs(dx) / halfW + Math.abs(dy) / halfH;
    const t = denom > 0 ? 1 / denom : 1;
    localHit = {
      x: cx + dx * t,
      y: cy + dy * t,
    };
  } else {
    // Rectangle / Note Card / Flashcard / Math / YouTube / Frame
    const scaleX = halfW / Math.max(0.001, Math.abs(dx));
    const scaleY = halfH / Math.max(0.001, Math.abs(dy));
    const t = Math.min(scaleX, scaleY);
    localHit = {
      x: cx + dx * t,
      y: cy + dy * t,
    };
  }

  return shape.angle ? rotatePoint(localHit.x, localHit.y, cx, cy, shape.angle) : localHit;
}

// Resolve dynamic arrow endpoints if bound to shapes
export function resolveLinearPoints(el: DrawingElement, allElements: DrawingElement[]): Point[] {
  const raw = el.points && el.points.length >= 2 ? [...el.points] : [{ x: el.x, y: el.y }, { x: el.x + (el.width || 80), y: el.y + (el.height || 0) }];
  if (el.type !== 'arrow' && el.type !== 'line') return raw;

  const pts = raw.map((p) => ({ ...p }));

  if (el.startBinding?.elementId) {
    const target = allElements.find((item) => item.id === el.startBinding?.elementId);
    if (target) {
      const nextPt = pts.length > 1 ? pts[1] : pts[0];
      pts[0] = getShapeBorderPoint(target, nextPt, el.startBinding.gap ?? 6);
    }
  }

  if (el.endBinding?.elementId) {
    const target = allElements.find((item) => item.id === el.endBinding?.elementId);
    if (target) {
      const prevPt = pts.length > 1 ? pts[pts.length - 2] : pts[0];
      pts[pts.length - 1] = getShapeBorderPoint(target, prevPt, el.endBinding.gap ?? 6);
    }
  }

  return pts;
}

export interface RenderElementOptions {
  allElements?: DrawingElement[];
  editingTextId?: string | null;
  editingTextValue?: string;
  imageCache?: Map<string, HTMLImageElement>;
  onImageLoad?: () => void;
  isPreview?: boolean; // When true, also draws simplified representations of DOM cards (note_card, flashcard, math, youtube)
}

export function renderDrawingElement(
  ctx: CanvasRenderingContext2D,
  el: DrawingElement,
  options: RenderElementOptions = {}
) {
  const { allElements = [], editingTextId, editingTextValue, imageCache, onImageLoad, isPreview = false } = options;

  const seed = getElementSeed(el);
  const rng = createPRNG(seed);
  const roughness = el.roughness ?? 1;
  const roundness = el.roundness ?? 'round';
  const strokeWidth = el.strokeWidth || 2;
  const strokeColor = el.strokeColor || '#ffffff';

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, (el.opacity ?? 100) / 100));
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = el.fillColor || 'transparent';
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Stroke Dash Pattern
  if (el.strokeStyle === 'dashed') {
    ctx.setLineDash([strokeWidth * 4, strokeWidth * 2.8]);
  } else if (el.strokeStyle === 'dotted') {
    ctx.setLineDash([strokeWidth * 1.2, strokeWidth * 2.6]);
  } else {
    ctx.setLineDash([]);
  }

  const box = getNormalizedBox(el);
  if (el.angle && el.type !== 'line' && el.type !== 'arrow' && el.type !== 'pencil') {
    ctx.translate(box.cx, box.cy);
    ctx.rotate(el.angle);
    ctx.translate(-box.cx, -box.cy);
  }

  if (el.type === 'pencil' && el.points && el.points.length > 0) {
    drawSmoothFreehand(ctx, el.points, strokeWidth);
  } else if (el.type === 'rectangle') {
    renderPatternFill(ctx, el, box.x, box.y, box.width, box.height, rng);
    drawRoughRectangle(ctx, box.x, box.y, box.width, box.height, roughness, roundness, rng);
  } else if (el.type === 'diamond') {
    renderPatternFill(ctx, el, box.x, box.y, box.width, box.height, rng);
    drawRoughDiamond(ctx, box.x, box.y, box.width, box.height, roughness, roundness, rng);
  } else if (el.type === 'ellipse') {
    renderPatternFill(ctx, el, box.x, box.y, box.width, box.height, rng);
    drawRoughEllipse(ctx, box.x, box.y, box.width, box.height, roughness, rng);
  } else if (el.type === 'frame') {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : 'rgba(255, 255, 255, 0.015)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(box.x, box.y, box.width, box.height, 6);
    } else {
      ctx.rect(box.x, box.y, box.width, box.height);
    }
    ctx.fill();
    ctx.stroke();

    // Frame header label
    const label = el.name || el.text || 'Frame';
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, box.x + 2, box.y - 6);
    ctx.restore();
  } else if (el.type === 'line' || el.type === 'arrow') {
    const pts = resolveLinearPoints(el, allElements);
    if (pts.length >= 2) {
      if (pts.length === 2 && !el.curved) {
        drawRoughSegment(ctx, pts[0].x, pts[0].y, pts[1].x, pts[1].y, roughness, rng);
      } else {
        // Multi-point or curved spline
        const passes = roughness === 0 ? 1 : 2;
        for (let pass = 0; pass < passes; pass++) {
          const j = pass === 0 ? roughness * 0.9 : roughness * 0.5;
          ctx.beginPath();
          ctx.moveTo(pts[0].x + (rng() - 0.5) * j, pts[0].y + (rng() - 0.5) * j);
          if (pts.length === 2) {
            ctx.lineTo(pts[1].x + (rng() - 0.5) * j, pts[1].y + (rng() - 0.5) * j);
          } else {
            for (let i = 1; i < pts.length - 1; i++) {
              const xc = (pts[i].x + pts[i + 1].x) / 2;
              const yc = (pts[i].y + pts[i + 1].y) / 2;
              ctx.quadraticCurveTo(
                pts[i].x + (rng() - 0.5) * j,
                pts[i].y + (rng() - 0.5) * j,
                xc,
                yc
              );
            }
            const last = pts[pts.length - 1];
            ctx.lineTo(last.x + (rng() - 0.5) * j, last.y + (rng() - 0.5) * j);
          }
          ctx.stroke();
        }
      }

      if (el.type === 'arrow') {
        const startHead = el.startArrowhead ?? 'none';
        const endHead = el.endArrowhead ?? 'arrow';
        if (startHead !== 'none') {
          drawArrowhead(ctx, pts[0], pts[1], startHead, strokeWidth, strokeColor);
        }
        if (endHead !== 'none') {
          drawArrowhead(
            ctx,
            pts[pts.length - 1],
            pts[pts.length - 2],
            endHead,
            strokeWidth,
            strokeColor
          );
        }
      }
    }
  } else if (el.type === 'text') {
    const isEditingThis = editingTextId === el.id;
    if (!isEditingThis && el.text) {
      const fSize = el.fontSize || 20;
      const fontCss = getFontFamilyCss(el.fontFamily || 'hand');
      ctx.font = `${fSize}px ${fontCss}`;
      ctx.fillStyle = strokeColor;
      ctx.textBaseline = 'top';
      const lines = el.text.split('\n');
      const lineHeight = fSize * 1.32;
      const align = el.textAlign || 'left';

      let maxW = 0;
      lines.forEach((l) => {
        maxW = Math.max(maxW, ctx.measureText(l).width);
      });

      lines.forEach((line, i) => {
        let drawX = el.x;
        if (align === 'center') {
          const lw = ctx.measureText(line).width;
          drawX = el.x + (maxW - lw) / 2;
        } else if (align === 'right') {
          const lw = ctx.measureText(line).width;
          drawX = el.x + (maxW - lw);
        }
        ctx.fillText(line, drawX, el.y + i * lineHeight);
      });
    }
  } else if (el.type === 'image' && el.imageUrl) {
    if (imageCache) {
      let img = imageCache.get(el.imageUrl);
      if (!img) {
        img = new Image();
        img.src = el.imageUrl;
        if (onImageLoad) img.onload = onImageLoad;
        imageCache.set(el.imageUrl, img);
      } else if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, box.x, box.y, box.width || 200, box.height || 150);
      }
    }
  } else if (isPreview && ['note_card', 'flashcard', 'math', 'youtube'].includes(el.type)) {
    // Draw clean card representation in previews and PNG exports
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = '#181818';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    let badge = 'ITEM';
    let title = '';
    if (el.type === 'note_card') {
      badge = 'NOTA';
      title = el.itemNota?.titulo || 'Nota vinculada';
    } else if (el.type === 'flashcard') {
      badge = 'FLASHCARD';
      title = el.itemNota?.frente || el.itemNota?.titulo || 'Flashcard';
    } else if (el.type === 'math') {
      badge = 'f(x) EQUAÇÃO';
      title = el.latex || 'LaTeX';
    } else if (el.type === 'youtube') {
      badge = 'YOUTUBE';
      title = el.youtubeUrl || el.youtubeId || 'Vídeo';
    }
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillText(badge, box.x + 14, box.y + 14);

    ctx.fillStyle = '#f4f4f5';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(title.slice(0, 34), box.x + 14, box.y + 34);
    ctx.restore();
  }

  // Render bound label text centered inside geometric shapes (rectangle, diamond, ellipse)
  if ((el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse') && el.text && editingTextId !== el.id) {
    const rawText = el.text;
    if (rawText) {
      const fSize = el.fontSize || 18;
      const fontCss = getFontFamilyCss(el.fontFamily || 'hand');
      ctx.save();
      ctx.setLineDash([]);
      ctx.font = `${fSize}px ${fontCss}`;
      ctx.fillStyle = strokeColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = rawText.split('\n');
      const lineHeight = fSize * 1.3;
      const totalH = lines.length * lineHeight;
      const startY = box.cy - totalH / 2 + lineHeight / 2;
      lines.forEach((line, idx) => {
        ctx.fillText(line, box.cx, startY + idx * lineHeight, Math.max(20, box.width - 16));
      });
      ctx.restore();
    }
  }

  ctx.restore();
}
