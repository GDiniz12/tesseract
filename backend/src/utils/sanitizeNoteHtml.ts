import sanitizeHtml from 'sanitize-html';

const allowedTags = Array.from(new Set([
  ...sanitizeHtml.defaults.allowedTags,
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
]));

export function sanitizeNoteHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags,
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['class', 'style', 'data-note-id', 'data-card-id'],
      a: ['href', 'name', 'target', 'rel', 'class', 'data-note-id', 'data-card-id'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'class', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
  });
}
