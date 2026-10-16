'use client';

import React, { useState } from 'react';
import katex from 'katex';

interface FormattedAiContentProps {
  content: string;
}

export default function FormattedAiContent({ content }: FormattedAiContentProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCode = (codeText: string, idx: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const renderFormattedText = (text: string) => {
    if (!text) return null;

    // 1. Split code blocks (```lang ... ```)
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let codeIndex = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const precedingText = text.substring(lastIndex, match.index);
      if (precedingText) {
        parts.push(renderTextAndMath(precedingText, `text-${lastIndex}`));
      }

      const lang = match[1] || 'plaintext';
      const codeContent = match[2];
      const currentCodeIndex = codeIndex++;

      parts.push(
        <div
          key={`code-block-${match.index}`}
          className="my-3 rounded-none border border-white/10 bg-[#161616] overflow-hidden font-mono text-xs shadow-lg"
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10 text-zinc-400 text-[11px] select-none">
            <span className="font-mono text-zinc-400 font-medium">{lang}</span>
            <button
              type="button"
              onClick={() => handleCopyCode(codeContent, currentCodeIndex)}
              className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded-none hover:bg-white/5"
              title="Copiar código"
            >
              {copiedIndex === currentCodeIndex ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-emerald-400">Copiado</span>
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-3.5 overflow-x-auto text-zinc-200 leading-relaxed whitespace-pre font-mono select-text">
            <code>{codeContent}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      parts.push(renderTextAndMath(remainingText, `text-${lastIndex}`));
    }

    return parts;
  };

  const renderTextAndMath = (plainText: string, keyPrefix: string): React.ReactNode => {
    // Split block math $$...$$
    const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = blockMathRegex.exec(plainText)) !== null) {
      const preceding = plainText.substring(lastIndex, match.index);
      if (preceding) {
        parts.push(renderInlineFormatting(preceding, `${keyPrefix}-pre-${lastIndex}`));
      }

      const mathSource = match[1];
      let html = '';
      try {
        html = katex.renderToString(mathSource, { displayMode: true, throwOnError: false });
      } catch {
        html = mathSource;
      }

      parts.push(
        <div
          key={`${keyPrefix}-math-block-${match.index}`}
          className="my-3 overflow-x-auto py-2 text-center text-zinc-100 font-sansation"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );

      lastIndex = match.index + match[0].length;
    }

    const remaining = plainText.substring(lastIndex);
    if (remaining) {
      parts.push(renderInlineFormatting(remaining, `${keyPrefix}-post-${lastIndex}`));
    }

    return <div key={keyPrefix} className="space-y-1">{parts}</div>;
  };

  const renderInlineFormatting = (chunk: string, key: string): React.ReactNode => {
    const lines = chunk.replace(/\\(?=\s*(?:[-*_]\s*){3,}\s*$)/gm, '').split('\n');
    const renderedLines: React.ReactNode[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      if (!line.trim()) {
        renderedLines.push(<div key={`space-${lineIdx}`} className="h-2" />);
        continue;
      }

      // Markdown horizontal rules (---, ***, ___), including escaped variants.
      if (/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})\s*$/.test(line)) {
        renderedLines.push(<hr key={`rule-${lineIdx}`} className="my-3 border-0 border-t border-white/15" />);
        continue;
      }

      // Group adjacent Markdown list items into a single semantic list.
      const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bulletMatch) {
        const items: string[] = [];
        while (lineIdx < lines.length) {
          const itemMatch = lines[lineIdx].match(/^\s*[-*+]\s+(.*)$/);
          if (!itemMatch) break;
          items.push(itemMatch[1]);
          lineIdx++;
        }
        lineIdx--;
        renderedLines.push(
          <ul key={`list-${lineIdx}`} className="my-1 list-disc space-y-1 pl-6 text-sm sm:text-[15px] font-sansation text-zinc-200 leading-relaxed">
            {items.map((item, itemIdx) => <li key={itemIdx}>{parseInlineSpans(item)}</li>)}
          </ul>
        );
        continue;
      }

      const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (orderedMatch) {
        const items: string[] = [];
        while (lineIdx < lines.length) {
          const itemMatch = lines[lineIdx].match(/^\s*\d+[.)]\s+(.*)$/);
          if (!itemMatch) break;
          items.push(itemMatch[1]);
          lineIdx++;
        }
        lineIdx--;
        renderedLines.push(
          <ol key={`ordered-list-${lineIdx}`} className="my-1 list-decimal space-y-1 pl-6 text-sm sm:text-[15px] font-sansation text-zinc-200 leading-relaxed">
            {items.map((item, itemIdx) => <li key={itemIdx}>{parseInlineSpans(item)}</li>)}
          </ol>
        );
        continue;
      }

      {
          if (!line.trim()) {
            continue;
          }

          // Markdown Image standalone line
          const imgMatch = line.trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/uploads\/[^\s)]+|data:image\/[^\s)]+)\)$/);
          if (imgMatch) {
            const altText = imgMatch[1] || 'Imagem';
            const src = imgMatch[2];
            renderedLines.push(
              <div key={lineIdx} className="my-3 max-w-xl rounded-none border border-white/10 bg-[#161616] overflow-hidden shadow-lg">
                <img
                  src={src}
                  alt={altText}
                  className="w-full max-h-96 object-contain rounded-none bg-black/40"
                  loading="lazy"
                />
                {altText && altText !== 'Imagem' && (
                  <div className="px-3 py-1.5 bg-white/5 border-t border-white/10 text-[11px] font-mono text-zinc-400">
                    {altText}
                  </div>
                )}
              </div>
            );
            continue;
          }

          // Headers
          if (line.startsWith('### ')) {
            renderedLines.push(
              <h3 key={lineIdx} className="text-base font-bold font-sansation text-white mt-3 mb-1 tracking-tight">
                {parseInlineSpans(line.replace('### ', ''))}
              </h3>
            );
            continue;
          }
          if (line.startsWith('## ')) {
            renderedLines.push(
              <h2 key={lineIdx} className="text-lg font-bold font-sansation text-white mt-4 mb-1.5 tracking-tight border-b border-white/5 pb-1">
                {parseInlineSpans(line.replace('## ', ''))}
              </h2>
            );
            continue;
          }
          if (line.startsWith('# ')) {
            renderedLines.push(
              <h1 key={lineIdx} className="text-xl font-bold font-sansation text-white mt-5 mb-2 tracking-tight">
                {parseInlineSpans(line.replace('# ', ''))}
              </h1>
            );
            continue;
          }

          // Blockquote
          if (line.startsWith('> ')) {
            renderedLines.push(
              <blockquote
                key={lineIdx}
                className="border-l-2 border-zinc-600 pl-3.5 py-0.5 text-sm sm:text-[15px] font-sansation text-zinc-400 italic my-1"
              >
                {parseInlineSpans(line.replace('> ', ''))}
              </blockquote>
            );
            continue;
          }

          // Regular paragraph
          renderedLines.push(
            <p key={lineIdx} className="text-sm sm:text-[15px] font-sansation text-zinc-200 leading-relaxed break-words">
              {parseInlineSpans(line)}
            </p>
          );
      }
    }

    return <div key={key} className="space-y-2">{renderedLines}</div>;
  };

  const parseInlineSpans = (text: string): React.ReactNode[] => {
    // Regex for inline math $...$, inline code `...`, bold **...**, italic *...*, images ![alt](url), links [text](url)
    const tokens = text.split(/(\$[^\$]+?\$|`[^`]+?`|\*\*[^\*]+?\*\*|\*[^\*]+?\*|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g);

    return tokens.map((token, idx) => {
      if (token.startsWith('$') && token.endsWith('$') && token.length > 2) {
        const mathSource = token.slice(1, -1);
        let html = '';
        try {
          html = katex.renderToString(mathSource, { displayMode: false, throwOnError: false });
        } catch {
          html = mathSource;
        }
        return (
          <span
            key={idx}
            className="inline-math px-0.5 text-white"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }

      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return (
          <code
            key={idx}
            className="font-mono text-xs px-1.5 py-0.5 rounded-none bg-white/10 text-zinc-200 border border-white/10"
          >
            {token.slice(1, -1)}
          </code>
        );
      }

      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return (
          <strong key={idx} className="font-bold text-white">
            {token.slice(2, -2)}
          </strong>
        );
      }

      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        return (
          <em key={idx} className="italic text-zinc-300">
            {token.slice(1, -1)}
          </em>
        );
      }

      // Inline Image ![alt](url)
      const imgMatch = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        const altText = imgMatch[1] || 'Imagem';
        const src = imgMatch[2];
        return (
          <span key={idx} className="inline-block my-1 max-w-full align-middle">
            <img
              src={src}
              alt={altText}
              className="max-h-60 max-w-full rounded-none border border-white/10 object-contain shadow-sm bg-black/40"
              loading="lazy"
            />
          </span>
        );
      }

      // Inline Link [text](url)
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const href = linkMatch[2];
        return (
          <a
            key={idx}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all"
          >
            {linkText}
          </a>
        );
      }

      return <span key={idx}>{token}</span>;
    });
  };

  return <div className="space-y-2">{renderFormattedText(content)}</div>;
}
