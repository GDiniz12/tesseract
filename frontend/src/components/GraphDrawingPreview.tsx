'use client';

import React, { useEffect, useRef } from 'react';
import {
  DrawingElement,
  getNormalizedBox,
  renderDrawingElement,
  resolveLinearPoints,
} from '@/lib/excalidrawRenderer';

interface GraphDrawingPreviewProps {
  conteudoJson?: string;
  className?: string;
  height?: number | string;
}

export default function GraphDrawingPreview({
  conteudoJson,
  className,
  height = 200,
}: GraphDrawingPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let elements: DrawingElement[] = [];
    if (conteudoJson) {
      try {
        const parsed = JSON.parse(conteudoJson);
        if (Array.isArray(parsed)) elements = parsed;
      } catch {}
    }

    const renderPreview = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = 340;
      const canvasHeight = typeof height === 'number' ? height : 200;

      canvas.width = width * dpr;
      canvas.height = canvasHeight * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, width, canvasHeight);

      // Dot grid
      const gridSize = 20;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let x = 0; x < width; x += gridSize) {
        for (let y = 0; y < canvasHeight; y += gridSize) {
          ctx.fillRect(x, y, 1.5, 1.5);
        }
      }

      if (elements.length > 0) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;

        elements.forEach((el) => {
          if ((el.type === 'line' || el.type === 'arrow') && el.points && el.points.length > 0) {
            const pts = resolveLinearPoints(el, elements);
            pts.forEach((p) => {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            });
          } else if (el.points && el.points.length > 0) {
            el.points.forEach((p) => {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            });
          } else {
            const box = getNormalizedBox(el);
            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);
            maxX = Math.max(maxX, box.x + Math.max(60, box.width));
            maxY = Math.max(maxY, box.y + Math.max(40, box.height));
          }
        });

        const drawWidth = Math.max(1, maxX - minX);
        const drawHeight = Math.max(1, maxY - minY);
        const scale = Math.min(
          1.2,
          Math.min((width - 36) / drawWidth, (canvasHeight - 36) / drawHeight)
        );
        const offsetX = (width - drawWidth * scale) / 2 - minX * scale;
        const offsetY = (canvasHeight - drawHeight * scale) / 2 - minY * scale;

        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        elements.forEach((el) => {
          renderDrawingElement(ctx, el, {
            allElements: elements,
            imageCache: imageCacheRef.current,
            onImageLoad: renderPreview,
            isPreview: true,
          });
        });
      }

      ctx.restore();
    };

    renderPreview();
  }, [conteudoJson, height]);

  return (
    <div
      style={{
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        overflow: 'hidden',
      }}
      className={className || 'rounded-none border border-white/10 bg-[#121212]'}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
