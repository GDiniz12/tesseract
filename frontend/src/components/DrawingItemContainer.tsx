'use client';

import React, { useRef, useState } from 'react';
import katex from 'katex';
import { DrawingElement, Point } from '@/lib/excalidrawRenderer';
import { getYouTubeEmbedUrl } from '@/lib/youtube';
import { ensureHtmlContent } from './Editor';

interface DrawingItemContainerProps {
  element: DrawingElement;
  zoom: number;
  pan: Point;
  isSelected: boolean;
  isInteractiveTool: boolean; // true when tool === 'select', false when drawing over cards
  onSelect: (shiftKey?: boolean) => void;
  onUpdateElement: (updated: DrawingElement, commit?: boolean) => void;
  onDeleteElement: () => void;
  onEditMath?: (element: DrawingElement) => void;
  onOpenNota?: (nota: any) => void;
  onOpenCard?: (card: any) => void;
}

export default function DrawingItemContainer({
  element,
  zoom,
  pan,
  isSelected,
  isInteractiveTool,
  onSelect,
  onUpdateElement,
  onDeleteElement,
  onEditMath,
  onOpenNota,
  onOpenCard,
}: DrawingItemContainerProps) {
  const [isInteractingContent, setIsInteractingContent] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const w =
    element.width ||
    (element.type === 'youtube' ? 420 : element.type === 'math' ? 280 : 300);
  const h =
    element.height ||
    (element.type === 'math' ? 140 : element.type === 'youtube' ? 260 : 220);

  const normX = w < 0 ? element.x + w : element.x;
  const normY = h < 0 ? element.y + h : element.y;
  const normW = Math.abs(w);
  const normH = Math.abs(h);

  const screenX = normX * zoom + pan.x;
  const screenY = normY * zoom + pan.y;
  const screenWidth = normW * zoom;
  const screenHeight = normH * zoom;

  const isMath = element.type === 'math';
  const isCard = element.type === 'flashcard';
  const isYouTube = element.type === 'youtube';
  const isNote = element.type === 'note_card';
  const item = element.itemNota || element.cardData || {};

  let mathHtml = '';
  if (isMath && element.latex) {
    try {
      mathHtml = katex.renderToString(element.latex, { throwOnError: false, displayMode: true });
    } catch (e) {
      mathHtml = `<span style="color:#ef4444;font-family:monospace;font-size:12px;">${element.latex}</span>`;
    }
  }

  const handleCardDragStart = (e: React.MouseEvent) => {
    if (!isInteractiveTool || element.locked) return;
    if ((e.target as HTMLElement).closest('button')) return;

    e.stopPropagation();
    onSelect(e.shiftKey);

    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: element.x,
      origY: element.y,
      moved: false,
    };

    const handleWindowMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStateRef.current) return;
      const dxScreen = moveEvent.clientX - dragStateRef.current.startX;
      const dyScreen = moveEvent.clientY - dragStateRef.current.startY;
      if (Math.hypot(dxScreen, dyScreen) > 3) {
        dragStateRef.current.moved = true;
      }
      if (!dragStateRef.current.moved) return;

      const dxWorld = dxScreen / zoom;
      const dyWorld = dyScreen / zoom;
      onUpdateElement(
        {
          ...element,
          x: dragStateRef.current.origX + dxWorld,
          y: dragStateRef.current.origY + dyWorld,
        },
        false
      );
    };

    const handleWindowMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      if (dragStateRef.current?.moved) {
        const dxWorld = (upEvent.clientX - dragStateRef.current.startX) / zoom;
        const dyWorld = (upEvent.clientY - dragStateRef.current.startY) / zoom;
        onUpdateElement(
          {
            ...element,
            x: dragStateRef.current.origX + dxWorld,
            y: dragStateRef.current.origY + dyWorld,
          },
          true
        );
      }
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (element.locked) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(false);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startW = normW;
    const startH = normH;

    let latestW = startW;
    let latestH = startH;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startClientX) / zoom;
      const deltaY = (moveEvent.clientY - startClientY) / zoom;
      latestW = Math.max(160, startW + deltaX);
      latestH = Math.max(90, startH + deltaY);

      onUpdateElement(
        {
          ...element,
          x: normX,
          y: normY,
          width: latestW,
          height: latestH,
        },
        false
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onUpdateElement(
        {
          ...element,
          x: normX,
          y: normY,
          width: latestW,
          height: latestH,
        },
        true
      );
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const opacityVal = Math.max(0.1, Math.min(1, (element.opacity ?? 100) / 100));

  return (
    <div
      onMouseDown={handleCardDragStart}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isMath && onEditMath) {
          onEditMath(element);
        } else if (isNote && onOpenNota && item?.id) {
          onOpenNota(item);
        } else if (isCard && onOpenCard && item?.id) {
          onOpenCard(item);
        }
      }}
      style={{
        position: 'absolute',
        left: `${screenX}px`,
        top: `${screenY}px`,
        width: `${screenWidth}px`,
        height: `${screenHeight}px`,
        opacity: opacityVal,
        transform: element.angle ? `rotate(${element.angle}rad)` : undefined,
        transformOrigin: 'center center',
        pointerEvents: isInteractiveTool ? 'auto' : 'none',
      }}
      className={`flex flex-col bg-[#181818] border transition-[border-color,box-shadow] rounded-none shadow-2xl overflow-hidden font-sansation select-none ${
        isSelected
          ? 'border-white ring-1 ring-white/60 z-30'
          : 'border-white/15 hover:border-white/35 z-10'
      }`}
    >
      {/* Unified Header Bar for Dragging, Opening, and Actions */}
      <div
        onMouseDown={handleCardDragStart}
        className="h-8 px-3 border-b border-white/10 bg-[#141414] flex items-center justify-between shrink-0 select-none cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
          {isMath ? (
            <span className="text-[11px] font-mono font-bold text-white shrink-0">f(x)</span>
          ) : isYouTube ? (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-400 shrink-0"
            >
              <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
              <polygon points="10 15 15 12 10 9 10 15" />
            </svg>
          ) : isCard ? (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-400 shrink-0"
            >
              <rect width="18" height="14" x="3" y="5" rx="1" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          ) : (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-400 shrink-0"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          )}
          <span className="text-xs font-semibold text-zinc-200 truncate">
            {isMath
              ? 'Equação LaTeX'
              : isYouTube
                ? 'Vídeo YouTube'
                : isCard
                  ? 'Flashcard'
                  : item.titulo || 'Nota'}
          </span>
          {element.locked && (
            <span className="text-[10px] font-mono text-amber-400/90 ml-1" title="Elemento bloqueado">
              🔒
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isNote && onOpenNota && item?.id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenNota(item);
              }}
              className="bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 rounded-none px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer"
              title="Abrir esta nota"
            >
              Abrir ↗
            </button>
          )}

          {isCard && onOpenCard && item?.id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCard(item);
              }}
              className="bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 rounded-none px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer"
              title="Abrir este flashcard"
            >
              Abrir ↗
            </button>
          )}

          {isMath && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onEditMath) onEditMath(element);
              }}
              className="bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 rounded-none px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer"
            >
              Editar
            </button>
          )}

          {isYouTube && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsInteractingContent((prev) => !prev);
                }}
                className={`border border-white/10 rounded-none px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                  isInteractingContent
                    ? 'bg-white text-black font-bold'
                    : 'bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white'
                }`}
                title="Alternar controle do player de vídeo"
              >
                {isInteractingContent ? 'Mover' : 'Player'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const ytUrl =
                    element.youtubeUrl || `https://www.youtube.com/watch?v=${element.youtubeId}`;
                  window.open(ytUrl, '_blank', 'noopener,noreferrer');
                }}
                className="bg-white text-black hover:bg-zinc-200 rounded-none px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer"
              >
                Abrir ↗
              </button>
            </>
          )}

          {!element.locked && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteElement();
              }}
              className="w-5 h-5 flex items-center justify-center rounded-none text-zinc-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Remover elemento do desenho"
              aria-label="Remover elemento do desenho"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Real Content Surface */}
      <div
        style={{
          flex: 1,
          padding: isYouTube ? 0 : '14px 16px',
          overflowY: isYouTube ? 'hidden' : 'auto',
          fontSize: `${Math.max(10, 12 * zoom)}px`,
          color: '#e4e4e7',
          lineHeight: 1.6,
          background: '#181818',
          display: isYouTube ? 'flex' : 'block',
        }}
        className="no-scrollbar"
      >
        {isYouTube ? (
          <iframe
            src={getYouTubeEmbedUrl(element.youtubeId || '')}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
              pointerEvents: isInteractingContent ? 'auto' : 'none',
            }}
          />
        ) : isMath ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: `${Math.max(12, 15 * zoom)}px`,
              textAlign: 'center',
              cursor: 'pointer',
              overflowX: 'auto',
            }}
            title="Duplo clique para editar a fórmula"
            dangerouslySetInnerHTML={{ __html: mathHtml }}
          />
        ) : isCard ? (
          <div className="flex min-h-full flex-col justify-center gap-3">
            <p className="m-0 text-sm font-medium leading-relaxed text-zinc-100">
              {item.frente || item.titulo || 'Flashcard sem pergunta.'}
            </p>
            {(item.verso || item.conteudo) && (
              <p className="m-0 border-t border-white/10 pt-3 text-xs leading-relaxed text-zinc-400">
                {item.verso || item.conteudo}
              </p>
            )}
          </div>
        ) : (
          <div className="flex min-h-full flex-col gap-2.5">
            <h3 className="m-0 text-sm font-semibold leading-snug text-zinc-100">
              {item.titulo || 'Nota sem título'}
            </h3>
            {item.conteudo && item.conteudo.trim() ? (
              <div
                className="notion-editor text-xs leading-relaxed text-zinc-300"
                dangerouslySetInnerHTML={{ __html: ensureHtmlContent(item.conteudo) }}
                style={{ wordBreak: 'break-word' }}
              />
            ) : (
              <p className="m-0 text-xs italic text-zinc-500">Nota sem conteúdo.</p>
            )}
          </div>
        )}
      </div>

      {/* Resize Grip Handle (Bottom-Right) */}
      {!element.locked && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '16px',
            height: '16px',
            cursor: 'se-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.65,
          }}
          className="hover:opacity-100 transition-opacity bg-[#141414]/80"
          title="Arraste para redimensionar"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <line x1="8" y1="2" x2="2" y2="8" stroke="#a1a1aa" strokeWidth="1.5" />
            <line x1="9" y1="6" x2="6" y2="9" stroke="#a1a1aa" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
}
