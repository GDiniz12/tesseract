'use client';

export type AiStatusState = 'thinking' | 'researching' | 'analyzing' | 'writing' | 'done' | 'error';

interface InlineAiStatusProps {
  label: string;
  state?: AiStatusState;
  detail?: string;
  className?: string;
}

export default function InlineAiStatus({ label, state = 'thinking', detail, className = '' }: InlineAiStatusProps) {
  const normalizedLabel = label.toLocaleLowerCase();
  const resolvedState = state === 'thinking' && normalizedLabel
    ? normalizedLabel.includes('erro') || normalizedLabel.includes('falh')
      ? 'error'
      : normalizedLabel.includes('pesquis') || normalizedLabel.includes('busc')
        ? 'researching'
        : normalizedLabel.includes('criando') || normalizedLabel.includes('atualizando') || normalizedLabel.includes('escrevendo')
          ? 'writing'
          : normalizedLabel.includes('analis') || normalizedLabel.includes('conclu')
            ? 'analyzing'
            : state
    : state;
  const isActive = resolvedState === 'thinking' || resolvedState === 'researching' || resolvedState === 'analyzing' || resolvedState === 'writing';

  return (
    <span
      role="status"
      aria-live="polite"
      data-state={resolvedState}
      className={`inline-flex min-w-0 items-center gap-2 text-xs ${isActive ? 'text-zinc-300' : 'text-zinc-500'} ${className}`}
    >
      <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden="true">
        {isActive ? (
          <svg className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
            <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : resolvedState === 'error' ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.5v4M8 11h.01" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" />
            <path d="m5 8 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0 truncate">{label}</span>
      {detail && <span className="shrink-0 truncate text-zinc-500">{detail}</span>}
    </span>
  );
}
