export interface NoteLinkItem {
  id: string;
  titulo?: string;
  conteudo?: string;
  pastaId?: string | null;
  tipo?: string;
  [key: string]: any;
}

export interface GraphLink {
  source: string;
  target: string;
}

/**
 * Extracts links between notes based strictly on explicit references:
 * 1. HTML attributes: data-note-id="..."
 * 2. Anchors: href="#note-..."
 * 3. Wikilinks: [[Note Title]] or [[note-id]]
 * 4. Markdown links: [Title](#note-id)
 *
 * Strictly avoids connecting notes that do NOT have genuine references/links.
 */
export function extractGraphLinks(notas: NoteLinkItem[]): GraphLink[] {
  if (!notas || notas.length === 0) return [];

  // Map lowercase Note ID -> Canonical ID
  const idMap = new Map<string, string>();
  // Map lowercase Title -> Canonical ID
  const titleToIdMap = new Map<string, string>();

  notas.forEach((n) => {
    if (n.id) {
      idMap.set(n.id.toLowerCase().trim(), n.id);
    }
    if (n.titulo) {
      titleToIdMap.set(n.titulo.toLowerCase().trim(), n.id);
    }
  });

  const extracted: GraphLink[] = [];

  notas.forEach((sourceNota) => {
    const rawContent = sourceNota.conteudo || '';
    if (!rawContent) return;

    // 1. Match data-note-id="..." or data-note-id='...'
    const dataIdRegex = /data-note-id=["']([^"']+)["']/gi;
    let m;
    while ((m = dataIdRegex.exec(rawContent)) !== null) {
      const rawTargetId = m[1].trim().toLowerCase();
      const canonicalTargetId = idMap.get(rawTargetId);
      if (canonicalTargetId && canonicalTargetId !== sourceNota.id) {
        extracted.push({ source: sourceNota.id, target: canonicalTargetId });
      }
    }

    // 2. Match href="#note-..."
    const hrefRegex = /href=["']#note-([^"']+)["']/gi;
    while ((m = hrefRegex.exec(rawContent)) !== null) {
      const rawTargetId = m[1].trim().toLowerCase();
      const canonicalTargetId = idMap.get(rawTargetId);
      if (canonicalTargetId && canonicalTargetId !== sourceNota.id) {
        extracted.push({ source: sourceNota.id, target: canonicalTargetId });
      }
    }

    // 3. Match [[...]] (wikilinks with title or ID)
    const wikiRegex = /\[\[(.*?)\]\]/gi;
    while ((m = wikiRegex.exec(rawContent)) !== null) {
      const rawTarget = m[1].toLowerCase().trim();
      let canonicalTargetId = titleToIdMap.get(rawTarget);
      if (!canonicalTargetId) {
        canonicalTargetId = idMap.get(rawTarget);
      }
      if (canonicalTargetId && canonicalTargetId !== sourceNota.id) {
        extracted.push({ source: sourceNota.id, target: canonicalTargetId });
      }
    }

    // 4. Match markdown link [text](#note-uuid)
    const mdLinkRegex = /\[.*?\]\(#note-([^)]+)\)/gi;
    while ((m = mdLinkRegex.exec(rawContent)) !== null) {
      const rawTargetId = m[1].trim().toLowerCase();
      const canonicalTargetId = idMap.get(rawTargetId);
      if (canonicalTargetId && canonicalTargetId !== sourceNota.id) {
        extracted.push({ source: sourceNota.id, target: canonicalTargetId });
      }
    }

    // 5. Match embedded drawing blocks data-drawing-id="..."
    const drawingEmbedRegex = /data-drawing-id=["']([^"']+)["']/gi;
    while ((m = drawingEmbedRegex.exec(rawContent)) !== null) {
      const rawTargetId = m[1].trim().toLowerCase();
      const canonicalTargetId = idMap.get(rawTargetId);
      if (canonicalTargetId && canonicalTargetId !== sourceNota.id) {
        extracted.push({ source: sourceNota.id, target: canonicalTargetId });
      }
    }

    // 6. If sourceNota is a drawing (or JSON array of elements), extract note_card references
    if (sourceNota.tipo === 'desenho' || rawContent.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(rawContent);
        if (Array.isArray(parsed)) {
          parsed.forEach((el: any) => {
            if (el && el.type === 'note_card' && el.itemNota?.id) {
              const targetId = String(el.itemNota.id).trim().toLowerCase();
              const canonicalTargetId = idMap.get(targetId);
              if (canonicalTargetId && canonicalTargetId !== sourceNota.id) {
                extracted.push({ source: sourceNota.id, target: canonicalTargetId });
              }
            }
          });
        }
      } catch {
        // Ignore invalid JSON
      }
    }
  });

  // Deduplicate undirected edges
  const uniqueMap = new Map<string, GraphLink>();
  extracted.forEach((l) => {
    const key = [l.source, l.target].sort().join('---');
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, l);
    }
  });

  return Array.from(uniqueMap.values());
}
