'use client';

import React from 'react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

export interface CardModalData {
  id: string;
  frente: string;
  verso: string;
  tipo: string;
  reps: number;
  interval: number;
  easeFactor: number;
  proximaRevisao: string;
  deck?: {
    id: string;
    nome: string;
  };
  notaId?: string;
  nota?: {
    id: string;
    titulo: string;
    conteudo?: string;
  };
}

interface CardModalProps {
  card: CardModalData | null;
  onOpenNota?: (nota: any) => void;
  onClose: () => void;
}

export default function CardModal({ card, onOpenNota, onClose }: CardModalProps) {
  const [isFlipped, setIsFlipped] = React.useState(false);

  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none font-sansation"
      onClick={onClose}
    >
      <div
        className="bg-[#181818] border border-white/10 rounded-none w-full max-w-[540px] p-6 shadow-2xl flex flex-col text-white animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-white/10">
          <div className="flex items-center gap-2 overflow-hidden">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white shrink-0">
              <rect width="18" height="18" x="3" y="3" rx="0" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span className="text-xs sm:text-sm font-bold text-white truncate uppercase tracking-wider">
              Flashcard Conectado {card.deck ? `• ${card.deck.nome}` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title="Fechar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Card interactive flip area */}
        <div
          onClick={() => setIsFlipped((prev) => !prev)}
          className="min-h-[220px] bg-white/[0.02] hover:bg-white/5 border border-white/10 hover:border-white/20 rounded-none p-5 sm:p-6 flex flex-col justify-between cursor-pointer text-center transition-all shadow-md"
        >
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
            <span className="px-2 py-0.5 rounded-none bg-white/5 border border-white/10 text-zinc-400">
              {card.nota ? 'Nota Vinculada' : 'Flashcard'}
            </span>
            <span className={isFlipped ? 'text-white font-bold' : 'text-zinc-400 font-bold'}>
              {isFlipped ? 'Verso (Resposta)' : 'Frente (Pergunta)'}
            </span>
          </div>

          <div className="my-4">
            <p className="text-base sm:text-lg font-medium text-white leading-relaxed m-0">
              {card.frente}
            </p>

            {isFlipped && (
              <div className="mt-4 pt-4 border-t border-white/10 animate-in fade-in duration-150 text-left">
                {card.verso && (
                  <p className="text-sm text-zinc-300 leading-relaxed m-0 whitespace-pre-wrap font-sansation mb-3">
                    {card.verso}
                  </p>
                )}

                {/* Embedded Note Container */}
                {card.nota && (
                  <div className="bg-[#141414] border border-white/10 rounded-none p-3.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white shrink-0">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
                          {card.nota.titulo}
                        </span>
                      </div>
                      {onOpenNota && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenNota(card.nota);
                            onClose();
                          }}
                          className="h-6 px-2 text-[11px] font-semibold rounded-none bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                        >
                          Abrir no Editor
                        </button>
                      )}
                    </div>
                    {card.nota.conteudo && (
                      <div
                        className="max-h-[160px] overflow-y-auto text-xs leading-relaxed text-zinc-300 prose dark:prose-invert max-w-none custom-scrollbar"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.nota.conteudo) }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-[11px] text-zinc-500 font-sansation">
            {!isFlipped ? 'Toque para revelar a resposta' : 'Toque para virar novamente'}
          </div>
        </div>

        {/* Card SRS Metadata Stats */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10 text-[11px] text-zinc-400 font-mono">
          <span>Intervalo: <strong className="text-white font-semibold">{card.interval}d</strong></span>
          <span>Facilidade: <strong className="text-white font-semibold">{card.easeFactor}x</strong></span>
          <span>Repetições: <strong className="text-white font-semibold">{card.reps}</strong></span>
        </div>
      </div>
    </div>
  );
}
