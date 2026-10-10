import DOMPurify from 'dompurify';

/** Sanitize rich note content before it reaches an HTML parsing sink. */
export function sanitizeHtml(dirtyHtml: string): string {
  if (typeof window === 'undefined') return '';

  return DOMPurify.sanitize(dirtyHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['srcdoc'],
  });
}
