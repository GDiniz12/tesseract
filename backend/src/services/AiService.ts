import { prisma } from '../config/prisma';
import { Response } from 'express';
import { marked } from 'marked';
import { sanitizeNoteHtml } from '../utils/sanitizeNoteHtml';

export function ensureHtmlContent(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let trimmed = raw.trim();

  // Convert markdown image syntax ![alt](url) to HTML img tags
  const mdImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/uploads\/[^\s)]+|data:image\/[^\s)]+)\)/g;
  if (mdImageRegex.test(trimmed)) {
    trimmed = trimmed.replace(mdImageRegex, (_match, alt, src) => {
      const altText = alt || 'Imagem';
      return `<img src="${src}" alt="${altText}" loading="lazy" />`;
    });
  }

  const hasHtmlTag = /<[a-z][\s\S]*>/i.test(trimmed);
  const hasMarkdownSigns =
    trimmed.startsWith('#') ||
    trimmed.includes('\n#') ||
    trimmed.includes('|---') ||
    trimmed.includes('* ') ||
    trimmed.includes('- ') ||
    trimmed.includes('![');
  if (hasHtmlTag && !hasMarkdownSigns) {
    return trimmed;
  }
  try {
    return marked.parse(trimmed, { gfm: true, breaks: true }) as string;
  } catch (err) {
    console.error('Error converting markdown to HTML in AiService:', err);
    return raw;
  }
}

export function generateCanvasElements(
  nodes: Array<{ id: string; label: string; description?: string; color?: string }>,
  connections: Array<{ from: string; to: string; label?: string }> = [],
  layoutType: 'flowchart' | 'mindmap' | 'hierarchy' | string = 'flowchart'
): any[] {
  if (!nodes || nodes.length === 0) return [];

  const elements: any[] = [];
  const palette = ['#20b8cd', '#38bdf8', '#23a55a', '#f0b232', '#ec4899', '#9b59b6'];

  const nodePositions = new Map<
    string,
    { x: number; y: number; width: number; height: number; color: string }
  >();

  if (layoutType === 'mindmap' && nodes.length > 1) {
    const root = nodes[0];
    const rootWidth = Math.max(180, Math.min(300, (root.label.length || 10) * 11 + 30));
    const rootHeight = root.description ? 75 : 55;
    nodePositions.set(root.id, {
      x: 600 - rootWidth / 2,
      y: 450 - rootHeight / 2,
      width: rootWidth,
      height: rootHeight,
      color: root.color || palette[0],
    });

    const children = nodes.slice(1);
    const total = children.length;
    const radiusX = Math.max(280, total * 32);
    const radiusY = Math.max(200, total * 26);

    children.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / total - Math.PI / 2;
      const w = Math.max(160, Math.min(260, (node.label.length || 10) * 10 + 24));
      const h = node.description ? 70 : 50;
      const x = 600 + Math.cos(angle) * radiusX - w / 2;
      const y = 450 + Math.sin(angle) * radiusY - h / 2;
      const color = node.color || palette[(idx + 1) % palette.length];
      nodePositions.set(node.id, { x, y, width: w, height: h, color });
    });
  } else {
    // Flowchart / Hierarchy / DAG layering
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    nodes.forEach((n) => {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    });

    connections.forEach((c) => {
      if (inDegree.has(c.to)) {
        inDegree.set(c.to, (inDegree.get(c.to) || 0) + 1);
      }
      if (adj.has(c.from)) {
        adj.get(c.from)!.push(c.to);
      }
    });

    const layer = new Map<string, number>();
    const queue: string[] = [];

    nodes.forEach((n) => {
      if ((inDegree.get(n.id) || 0) === 0) {
        layer.set(n.id, 0);
        queue.push(n.id);
      }
    });

    if (queue.length === 0 && nodes.length > 0) {
      layer.set(nodes[0].id, 0);
      queue.push(nodes[0].id);
    }

    while (queue.length > 0) {
      const u = queue.shift()!;
      const currentLayer = layer.get(u) || 0;
      for (const v of adj.get(u) || []) {
        const nextLayer = currentLayer + 1;
        if (!layer.has(v) || (layer.get(v)! < nextLayer && nextLayer < 10)) {
          layer.set(v, nextLayer);
          queue.push(v);
        }
      }
    }

    let maxAssignedLayer = 0;
    layer.forEach((lvl) => {
      if (lvl > maxAssignedLayer) maxAssignedLayer = lvl;
    });

    nodes.forEach((n) => {
      if (!layer.has(n.id)) {
        maxAssignedLayer++;
        layer.set(n.id, maxAssignedLayer);
      }
    });

    const layerGroups = new Map<number, typeof nodes>();
    nodes.forEach((n) => {
      const lvl = layer.get(n.id) || 0;
      if (!layerGroups.has(lvl)) layerGroups.set(lvl, []);
      layerGroups.get(lvl)!.push(n);
    });

    const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
    const startY = 100;
    const layerHeight = 150;
    const nodeGapX = 220;

    sortedLayers.forEach((lvl) => {
      const group = layerGroups.get(lvl)!;
      const totalWidth = group.length * nodeGapX;
      const startX = 600 - totalWidth / 2 + nodeGapX / 2;

      group.forEach((node, idx) => {
        const w = Math.max(170, Math.min(260, (node.label.length || 10) * 10 + 24));
        const h = node.description ? 70 : 52;
        const x = startX + idx * nodeGapX - w / 2;
        const y = startY + lvl * layerHeight;
        const color = node.color || palette[idx % palette.length];
        nodePositions.set(node.id, { x, y, width: w, height: h, color });
      });
    });
  }

  let elemCounter = 1;
  nodes.forEach((node) => {
    const pos = nodePositions.get(node.id);
    if (!pos) return;

    // 1. Rectangle container
    elements.push({
      id: `rect_${node.id}_${elemCounter++}`,
      type: 'rectangle',
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: Math.round(pos.width),
      height: Math.round(pos.height),
      strokeColor: pos.color,
      fillColor: 'rgba(30, 31, 34, 0.95)',
      strokeWidth: 2,
    });

    // 2. Main label text
    const labelY = node.description ? Math.round(pos.y + 16) : Math.round(pos.y + pos.height / 2 - 8);
    elements.push({
      id: `text_label_${node.id}_${elemCounter++}`,
      type: 'text',
      x: Math.round(pos.x + 12),
      y: labelY,
      text: node.label,
      fontSize: 14,
      strokeColor: '#f2f3f5',
      fillColor: 'transparent',
      strokeWidth: 1,
    });

    // 3. Optional description text
    if (node.description) {
      elements.push({
        id: `text_desc_${node.id}_${elemCounter++}`,
        type: 'text',
        x: Math.round(pos.x + 12),
        y: Math.round(pos.y + 44),
        text: node.description.length > 32 ? node.description.slice(0, 30) + '...' : node.description,
        fontSize: 11,
        strokeColor: '#949ba4',
        fillColor: 'transparent',
        strokeWidth: 1,
      });
    }
  });

  connections.forEach((conn) => {
    const fromPos = nodePositions.get(conn.from);
    const toPos = nodePositions.get(conn.to);
    if (!fromPos || !toPos) return;

    let p1 = { x: fromPos.x + fromPos.width / 2, y: fromPos.y + fromPos.height };
    let p2 = { x: toPos.x + toPos.width / 2, y: toPos.y };

    if (layoutType === 'mindmap' || Math.abs(toPos.y - fromPos.y) < 60) {
      if (toPos.x > fromPos.x) {
        p1 = { x: fromPos.x + fromPos.width, y: fromPos.y + fromPos.height / 2 };
        p2 = { x: toPos.x, y: toPos.y + toPos.height / 2 };
      } else {
        p1 = { x: fromPos.x, y: fromPos.y + fromPos.height / 2 };
        p2 = { x: toPos.x + toPos.width, y: toPos.y + toPos.height / 2 };
      }
    }

    elements.push({
      id: `arrow_${conn.from}_${conn.to}_${elemCounter++}`,
      type: 'arrow',
      x: Math.round(p1.x),
      y: Math.round(p1.y),
      points: [
        { x: Math.round(p1.x), y: Math.round(p1.y) },
        { x: Math.round(p2.x), y: Math.round(p2.y) },
      ],
      strokeColor: '#85878b',
      fillColor: 'transparent',
      strokeWidth: 2,
    });

    if (conn.label) {
      const midX = Math.round((p1.x + p2.x) / 2);
      const midY = Math.round((p1.y + p2.y) / 2 - 10);
      elements.push({
        id: `arrow_label_${elemCounter++}`,
        type: 'text',
        x: midX,
        y: midY,
        text: conn.label,
        fontSize: 11,
        strokeColor: '#b5bac1',
        fillColor: 'transparent',
        strokeWidth: 1,
      });
    }
  });

  return elements;
}


async function* parseSSEStream(response: globalThis.Response) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          return;
        }
        try {
          yield JSON.parse(dataStr);
        } catch {
          // ignore non-json SSE lines
        }
      }
    }
  }

  if (buffer.trim().startsWith('data:')) {
    const dataStr = buffer.trim().slice(5).trim();
    if (dataStr !== '[DONE]') {
      try {
        yield JSON.parse(dataStr);
      } catch {}
    }
  }
}

export class AiService {
  private getApiUrl(): string {
    let url =
      process.env.SYNAP_AI_API_URL ||
      process.env.AI_API_URL ||
      process.env.OMNIROUTE_API_URL ||
      process.env.OMNIROUTE_URL ||
      'http://localhost:20128/v1';

    url = url.trim().replace(/\/+$/, '');
    if (!url.endsWith('/chat/completions')) {
      if (url.endsWith('/v1')) {
        url = `${url}/chat/completions`;
      } else {
        url = `${url}/v1/chat/completions`;
      }
    }
    return url;
  }

  // --- THREAD MANAGEMENT ---

  async getThreads(workspaceId: string) {
    return prisma.aiChatThread.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { mensagens: true },
        },
      },
    });
  }

  async createThread(workspaceId: string, titulo?: string) {
    return prisma.aiChatThread.create({
      data: {
        workspaceId,
        titulo: titulo?.trim() || 'Nova conversa de estudos',
      },
    });
  }

  async getThreadById(threadId: string) {
    return prisma.aiChatThread.findUnique({
      where: { id: threadId },
      include: {
        mensagens: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async updateThreadTitle(threadId: string, titulo: string) {
    return prisma.aiChatThread.update({
      where: { id: threadId },
      data: { titulo },
    });
  }

  async deleteThread(threadId: string) {
    return prisma.aiChatThread.delete({
      where: { id: threadId },
    });
  }

  // --- CHAT STREAMING & TOOL EXECUTION ---

  async streamChat({
    workspaceId,
    threadId,
    userMessage,
    activeNote,
    res,
  }: {
    workspaceId: string;
    threadId: string;
    userMessage: string;
    activeNote?: { id: string; titulo: string; conteudo?: string } | null;
    res: Response;
  }) {
    // 1. Verify thread exists
    const thread = await prisma.aiChatThread.findUnique({
      where: { id: threadId },
      include: {
        mensagens: {
          orderBy: { createdAt: 'asc' },
          take: 30, // keep the last 30 messages for context
        },
      },
    });

    if (!thread || thread.workspaceId !== workspaceId) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Thread não encontrada neste workspace.' })}\n\n`);
      res.end();
      return;
    }

    // 2. Save user message to database
    await prisma.aiChatMessage.create({
      data: {
        threadId,
        role: 'user',
        conteudo: userMessage,
        metadata: activeNote ? { activeNoteId: activeNote.id, activeNoteTitle: activeNote.titulo } : undefined,
      },
    });

    // Auto-update thread title if it's default
    if (thread.titulo === 'Nova conversa de estudos' || thread.titulo === 'Nova conversa') {
      const generatedTitle = userMessage.slice(0, 45) + (userMessage.length > 45 ? '...' : '');
      await prisma.aiChatThread.update({
        where: { id: threadId },
        data: { titulo: generatedTitle },
      });
    }

    // 3. Prepare AI Endpoint URL
    const apiUrl = this.getApiUrl();

    // 4. Build tools declarations
    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_workspace_notes',
          description: 'Pesquisa e lista notas e desenhos existentes no espaço de trabalho (workspace) do usuário pelo título ou conteúdo.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Termo de busca para encontrar notas relevantes. Deixe vazio para listar as mais recentes.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_note_details',
          description: 'Obtém o conteúdo completo e detalhes de uma nota ou desenho específico pelo ID.',
          parameters: {
            type: 'object',
            properties: {
              noteId: {
                type: 'string',
                description: 'O ID único da nota ou desenho a ser lido.',
              },
            },
            required: ['noteId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_new_note',
          description: 'Cria uma nova nota de texto rica e estruturada no espaço de trabalho (resumo, guia de estudos, artigo, síntese). O conteúdo em Markdown é automaticamente renderizado em HTML elegante para o usuário.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Título claro e descritivo da nova nota.',
              },
              content: {
                type: 'string',
                description: 'Conteúdo formatado em Markdown com títulos (##), tabelas, listas, negrito, etc.',
              },
              folderId: {
                type: 'string',
                description: 'ID opcional da pasta onde a nota deve ser salva.',
              },
            },
            required: ['title', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_active_note',
          description: 'Atualiza ou adiciona conteúdo à nota atualmente aberta pelo usuário no editor.',
          parameters: {
            type: 'object',
            properties: {
              noteId: {
                type: 'string',
                description: 'ID da nota que está sendo atualizada.',
              },
              content: {
                type: 'string',
                description: 'O novo conteúdo completo da nota em Markdown.',
              },
              title: {
                type: 'string',
                description: 'Novo título opcional para a nota.',
              },
            },
            required: ['noteId', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_canvas',
          description: 'Cria um novo Canvas de Desenho visual interativo no espaço de trabalho (mapa conceitual, mapa mental, fluxograma, diagrama de blocos ou linha do tempo). Cada nó e conexão são posicionados graficamente no canvas.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Título do desenho/canvas (ex: "Mapa Mental: Segunda Guerra Mundial", "Fluxograma de Autenticação").',
              },
              layoutType: {
                type: 'string',
                enum: ['flowchart', 'mindmap', 'hierarchy'],
                description: 'Estilo do layout: "mindmap" para distribuição radial a partir de um nó central; "flowchart" ou "hierarchy" para fluxo top-down em camadas.',
              },
              nodes: {
                type: 'array',
                description: 'Lista de nós conceituais a desenhar no canvas.',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'ID curto único para o nó (ex: "root", "eixo", "aliados", "polonia").' },
                    label: { type: 'string', description: 'Título principal ou conceito do bloco.' },
                    description: { type: 'string', description: 'Subtítulo explicativo opcional (máx 50 caracteres).' },
                    color: { type: 'string', description: 'Cor hex opcional do contorno (ex: "#20b8cd", "#38bdf8", "#23a55a", "#f0b232", "#ec4899").' },
                  },
                  required: ['id', 'label'],
                },
              },
              connections: {
                type: 'array',
                description: 'Conexões direcionadas (setas) entre os nós.',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string', description: 'ID do nó de origem.' },
                    to: { type: 'string', description: 'ID do nó de destino.' },
                    label: { type: 'string', description: 'Rótulo ou verbo opcional da conexão (ex: "causa", "desencadeia", "origina").' },
                  },
                  required: ['from', 'to'],
                },
              },
              folderId: {
                type: 'string',
                description: 'ID opcional da pasta onde salvar o desenho.',
              },
            },
            required: ['title', 'nodes'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_folder',
          description: 'Cria uma nova pasta no workspace para organizar notas e desenhos.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome da nova pasta.',
              },
            },
            required: ['name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'move_note_to_folder',
          description: 'Move uma nota ou desenho para uma pasta específica, ou para a raiz do workspace.',
          parameters: {
            type: 'object',
            properties: {
              noteId: {
                type: 'string',
                description: 'ID da nota ou desenho a mover.',
              },
              folderId: {
                type: 'string',
                description: 'ID da pasta de destino, ou null/vazio para mover para a raiz.',
              },
            },
            required: ['noteId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'organize_workspace',
          description: 'Organiza em lote múltiplos itens (notas e desenhos) em pastas do workspace.',
          parameters: {
            type: 'object',
            properties: {
              folders: {
                type: 'array',
                description: 'Pastas a criar/usar e os IDs das notas/desenhos a colocar dentro de cada uma.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Nome da pasta.' },
                    noteIds: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'IDs das notas e desenhos que devem ficar nesta pasta.',
                    },
                  },
                  required: ['name', 'noteIds'],
                },
              },
            },
            required: ['folders'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_workspace_structure',
          description: 'Lista a estrutura completa do workspace: todas as pastas existentes, itens dentro de cada pasta, itens na raiz e baralhos de flashcards.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_flashcards_deck',
          description: 'Cria um novo baralho (deck) de flashcards com perguntas e respostas para repetição espaçada (SM-2).',
          parameters: {
            type: 'object',
            properties: {
              deckTitle: {
                type: 'string',
                description: 'Nome do baralho de flashcards (ex: "História Medieval", "Cálculo I: Derivadas").',
              },
              description: {
                type: 'string',
                description: 'Breve descrição do conteúdo coberto.',
              },
              cards: {
                type: 'array',
                description: 'Lista de flashcards a serem criados.',
                items: {
                  type: 'object',
                  properties: {
                    front: {
                      type: 'string',
                      description: 'Pergunta, conceito ou estímulo no lado da frente do cartão.',
                    },
                    back: {
                      type: 'string',
                      description: 'Resposta concisa, explicação ou resolução no verso do cartão.',
                    },
                  },
                  required: ['front', 'back'],
                },
              },
            },
            required: ['deckTitle', 'cards'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_cards_to_deck',
          description: 'Adiciona novos flashcards a um baralho já existente.',
          parameters: {
            type: 'object',
            properties: {
              deckId: {
                type: 'string',
                description: 'ID do baralho existente.',
              },
              cards: {
                type: 'array',
                description: 'Lista de flashcards a adicionar.',
                items: {
                  type: 'object',
                  properties: {
                    front: { type: 'string', description: 'Frente do cartão.' },
                    back: { type: 'string', description: 'Verso do cartão.' },
                  },
                  required: ['front', 'back'],
                },
              },
            },
            required: ['deckId', 'cards'],
          },
        },
      },
    ];

    // 5. Build system instructions with context
    let systemInstruction = `Você é o Tesseract AI, o assistente inteligente de estudos, síntese e gestão total de conhecimento da plataforma Tesseract.
Sua missão é capacitar o usuário a aprender de forma profunda, sintetizar conceitos difíceis, responder dúvidas com clareza, criar notas de estudo ricas, desenhar mapas mentais/diagramas visuais interativos (canvas), criar flashcards para memorização ativa e organizar todo o workspace em pastas.

PODERES E FERRAMENTAS DO TESSERACT AI:
1. NOTAS DE ESTUDO (create_new_note, update_active_note):
   - Crie resumos e materiais de estudo completos, elegantes e estruturados em Markdown.
   - Use títulos (##, ###), tabelas comparativas formatadas (| Coluna 1 | Coluna 2 |), listas de tópicos com marcadores, destaques em negrito e citações (>).
   - O Tesseract compila seu markdown automaticamente para HTML semântico com tabelas estilizadas, títulos e citações.

2. CANVAS E DESENHO VISUAL (create_canvas):
   - Quando o usuário pedir um MAPA MENTAL, MAPA CONCEITUAL, FLUXOGRAMA, ESQUEMA VISUAL, DIAGRAMA ou LINHA DO TEMPO, NUNCA responda apenas com diagramas em texto puro ou arte ASCII.
   - Utilize IMEDIATAMENTE a ferramenta \`create_canvas\`!
   - Defina nós expressivos (\`nodes\`), cores distintas e conexões com setas (\`connections\`). Escolha \`layoutType: "mindmap"\` para ideias ramificadas ou \`layoutType: "flowchart"\` para sequências lógicas e causais.

3. ORGANIZAÇÃO DO WORKSPACE (create_folder, move_note_to_folder, organize_workspace, list_workspace_structure):
   - Você pode consultar o workspace com \`list_workspace_structure\`, criar pastas temáticas com \`create_folder\` e organizar notas com \`organize_workspace\` ou \`move_note_to_folder\`.

4. FLASHCARDS E REPETIÇÃO ESPAÇADA (create_flashcards_deck, add_cards_to_deck):
   - Crie baralhos e cartões com perguntas instigantes na frente e respostas claras no verso para memorização ativa.

Diretrizes de resposta:
- Responda sempre em Português (ou no idioma da pergunta do usuário).
- Seja amigável, didático, objetivo e elegante.
- Para fórmulas matemáticas e científicas, use notação LaTeX entre $...$ (inline) ou $$...$$ (bloco).
- Para código de programação, utilize blocos com a linguagem indicada (ex: \`\`\`typescript ... \`\`\`).
- Após executar qualquer criação (notas, desenhos/canvas, pastas, flashcards), confirme ao usuário o que foi feito de forma concisa e acolhedora.
`;

    if (activeNote) {
      systemInstruction += `\n\n--- CONTEXTO DA NOTA ATUALMENTE ABERTA NO EDITOR ---
Título: "${activeNote.titulo}"
ID da Nota: "${activeNote.id}"
Conteúdo Atual:
${activeNote.conteudo ? activeNote.conteudo.slice(0, 10000) : '(Nota vazia)'}
--- FIM DO CONTEXTO DA NOTA ATUAL ---
O usuário está visualizando/editando esta nota agora. Se ele pedir para resumir, gerar cartões ou complementar a nota, use este contexto diretamente.`;
    }

    // 6. Build conversation messages
    const messages: Array<any> = [
      {
        role: 'system',
        content: systemInstruction,
      },
    ];

    // Add prior history
    for (const msg of thread.mensagens) {
      if (msg.role === 'user') {
        messages.push({
          role: 'user',
          content: msg.conteudo,
        });
      } else if (msg.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: msg.conteudo,
        });
      }
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    const createdEntities: {
      notesCreated: Array<{ id: string; titulo: string }>;
      drawingsCreated: Array<{ id: string; titulo: string }>;
      foldersCreated: Array<{ id: string; nome: string }>;
      notesUpdated: Array<{ id: string; titulo?: string }>;
      decksCreated: Array<{ id: string; nome: string; count: number }>;
    } = {
      notesCreated: [],
      drawingsCreated: [],
      foldersCreated: [],
      notesUpdated: [],
      decksCreated: [],
    };

    let assistantFullText = '';

    try {
      // Execute multi-step loop if model calls tools
      let continueLoop = true;
      let loopCount = 0;
      const MAX_LOOPS = 5;

      while (continueLoop && loopCount < MAX_LOOPS) {
        loopCount++;
        res.write(
          `event: status\ndata: ${JSON.stringify({
            message: loopCount === 1 ? 'Analisando sua solicitação.' : 'Analisando os resultados obtidos.',
          })}\n\n`
        );

        const requestBody: Record<string, any> = {
          model: process.env.SYNAP_AI_MODEL || process.env.AI_MODEL || process.env.OMNIROUTE_MODEL || 'auto/chat',
          messages,
          tools,
          stream: true,
          temperature: 0.7,
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        const apiKey = process.env.SYNAP_AI_API_KEY || process.env.AI_API_KEY || process.env.OMNIROUTE_API_KEY;
        if (apiKey && apiKey.trim() !== '') {
          headers['Authorization'] = `Bearer ${apiKey.trim()}`;
        }

        res.write(`event: status\ndata: ${JSON.stringify({ message: 'Gerando a resposta.' })}\n\n`);
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Erro na API Tesseract AI (${response.status}): ${errText}`);
        }

        let currentTurnText = '';
        const toolCallsAccumulator: {
          [index: number]: { id: string; name: string; arguments: string };
        } = {};

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json: any = await response.json();
          const choice = json.choices?.[0];
          const msg = choice?.message;

          if (msg?.content) {
            currentTurnText = msg.content;
            assistantFullText += msg.content;
            res.write(`event: delta\ndata: ${JSON.stringify({ text: msg.content, content: msg.content })}\n\n`);
          }

          if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
            for (let i = 0; i < msg.tool_calls.length; i++) {
              const tc = msg.tool_calls[i];
              toolCallsAccumulator[i] = {
                id: tc.id || `call_${Date.now()}_${i}`,
                name: tc.function?.name || '',
                arguments:
                  typeof tc.function?.arguments === 'string'
                    ? tc.function.arguments
                    : JSON.stringify(tc.function?.arguments || {}),
              };
            }
          }
        } else {
          for await (const chunk of parseSSEStream(response)) {
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              currentTurnText += delta.content;
              assistantFullText += delta.content;
              res.write(`event: delta\ndata: ${JSON.stringify({ text: delta.content, content: delta.content })}\n\n`);
            }

            if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tcDelta of delta.tool_calls) {
                const idx = tcDelta.index ?? 0;
                if (!toolCallsAccumulator[idx]) {
                  toolCallsAccumulator[idx] = {
                    id: tcDelta.id || `call_${Date.now()}_${idx}`,
                    name: tcDelta.function?.name || '',
                    arguments: tcDelta.function?.arguments || '',
                  };
                } else {
                  if (tcDelta.id) {
                    toolCallsAccumulator[idx].id = tcDelta.id;
                  }
                  if (tcDelta.function?.name) {
                    toolCallsAccumulator[idx].name += tcDelta.function.name;
                  }
                  if (tcDelta.function?.arguments) {
                    toolCallsAccumulator[idx].arguments += tcDelta.function.arguments;
                  }
                }
              }
            }
          }
        }

        const executedToolCalls = Object.values(toolCallsAccumulator);

        if (executedToolCalls.length === 0) {
          continueLoop = false;
          break;
        }

        // Record assistant turn with tool calls
        messages.push({
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: executedToolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        });

        // Execute tool calls
        for (const tc of executedToolCalls) {
          const fnName = tc.name;
          let fnArgs: any = {};
          try {
            fnArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
          } catch {
            fnArgs = {};
          }

          res.write(
            `event: tool_call\ndata: ${JSON.stringify({
              name: fnName,
              args: fnArgs,
            })}\n\n`
          );

          let result: any = {};

          try {
            if (fnName === 'search_workspace_notes') {
              const query = (fnArgs.query || '').toLowerCase().trim();
              const notes = await prisma.nota.findMany({
                where: { workspaceId },
                select: { id: true, titulo: true, tipo: true, updatedAt: true, conteudo: true },
                orderBy: { updatedAt: 'desc' },
                take: 15,
              });

              const filtered = query
                ? notes.filter(
                    (n) =>
                      n.titulo.toLowerCase().includes(query) ||
                      (n.conteudo && n.conteudo.toLowerCase().includes(query))
                  )
                : notes;

              result = {
                notes: filtered.map((n) => ({
                  id: n.id,
                  title: n.titulo,
                  type: n.tipo,
                  excerpt: n.conteudo ? n.conteudo.slice(0, 300) : '',
                })),
              };
            } else if (fnName === 'get_note_details') {
              const note = await prisma.nota.findFirst({
                where: { id: fnArgs.noteId, workspaceId },
              });
              if (note) {
                result = { note: { id: note.id, title: note.titulo, content: note.conteudo, type: note.tipo } };
              } else {
                result = { error: 'Nota não encontrada no workspace.' };
              }
            } else if (fnName === 'create_new_note') {
              const htmlContent = sanitizeNoteHtml(ensureHtmlContent(fnArgs.content));
              const newNota = await prisma.nota.create({
                data: {
                  workspaceId,
                  titulo: fnArgs.title,
                  conteudo: htmlContent,
                  pastaId: fnArgs.folderId || null,
                  tipo: 'texto',
                },
              });
              createdEntities.notesCreated.push({ id: newNota.id, titulo: newNota.titulo });
              result = { success: true, createdNote: { id: newNota.id, title: newNota.titulo } };
            } else if (fnName === 'update_active_note') {
              const htmlContent = sanitizeNoteHtml(ensureHtmlContent(fnArgs.content));
              const updated = await prisma.nota.update({
                where: { id: fnArgs.noteId },
                data: {
                  ...(fnArgs.title ? { titulo: fnArgs.title } : {}),
                  conteudo: htmlContent,
                },
              });
              createdEntities.notesUpdated.push({ id: updated.id, titulo: updated.titulo });
              result = { success: true, updatedNote: { id: updated.id, title: updated.titulo } };
            } else if (fnName === 'create_canvas') {
              const elements = generateCanvasElements(
                fnArgs.nodes || [],
                fnArgs.connections || [],
                fnArgs.layoutType || 'flowchart'
              );
              const newDrawing = await prisma.nota.create({
                data: {
                  workspaceId,
                  titulo: fnArgs.title,
                  conteudo: JSON.stringify(elements),
                  pastaId: fnArgs.folderId || null,
                  tipo: 'desenho',
                },
              });
              createdEntities.drawingsCreated.push({ id: newDrawing.id, titulo: newDrawing.titulo });
              result = {
                success: true,
                createdCanvas: {
                  id: newDrawing.id,
                  title: newDrawing.titulo,
                  totalNodes: (fnArgs.nodes || []).length,
                },
              };
            } else if (fnName === 'create_folder') {
              const newFolder = await prisma.pasta.create({
                data: {
                  workspaceId,
                  nome: fnArgs.name,
                },
              });
              createdEntities.foldersCreated.push({ id: newFolder.id, nome: newFolder.nome });
              result = { success: true, createdFolder: { id: newFolder.id, name: newFolder.nome } };
            } else if (fnName === 'move_note_to_folder') {
              const updated = await prisma.nota.update({
                where: { id: fnArgs.noteId },
                data: { pastaId: fnArgs.folderId || null },
              });
              result = { success: true, movedNoteId: updated.id, targetFolderId: updated.pastaId };
            } else if (fnName === 'organize_workspace') {
              const foldersSummary: Array<{ folderId: string; name: string; notesMoved: number }> = [];
              for (const f of fnArgs.folders || []) {
                let folder = await prisma.pasta.findFirst({
                  where: { workspaceId, nome: f.name },
                });
                if (!folder) {
                  folder = await prisma.pasta.create({
                    data: { workspaceId, nome: f.name },
                  });
                  createdEntities.foldersCreated.push({ id: folder.id, nome: folder.nome });
                }
                if (Array.isArray(f.noteIds) && f.noteIds.length > 0) {
                  await prisma.nota.updateMany({
                    where: { id: { in: f.noteIds }, workspaceId },
                    data: { pastaId: folder.id },
                  });
                }
                foldersSummary.push({
                  folderId: folder.id,
                  name: folder.nome,
                  notesMoved: f.noteIds?.length || 0,
                });
              }
              result = { success: true, organizedFolders: foldersSummary };
            } else if (fnName === 'list_workspace_structure') {
              const pastas = await prisma.pasta.findMany({
                where: { workspaceId },
                include: {
                  notas: {
                    select: { id: true, titulo: true, tipo: true, updatedAt: true },
                  },
                },
                orderBy: { nome: 'asc' },
              });
              const rootNotas = await prisma.nota.findMany({
                where: { workspaceId, pastaId: null },
                select: { id: true, titulo: true, tipo: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' },
              });
              const decks = await prisma.deck.findMany({
                where: { workspaceId },
                select: { id: true, nome: true, _count: { select: { flashcards: true } } },
              });
              result = {
                folders: pastas.map((p) => ({
                  id: p.id,
                  name: p.nome,
                  items: p.notas.map((n) => ({ id: n.id, title: n.titulo, type: n.tipo })),
                })),
                rootItems: rootNotas.map((n) => ({ id: n.id, title: n.titulo, type: n.tipo })),
                flashcardDecks: decks.map((d) => ({ id: d.id, title: d.nome, totalCards: d._count.flashcards })),
              };
            } else if (fnName === 'create_flashcards_deck') {
              const deck = await prisma.deck.create({
                data: {
                  workspaceId,
                  nome: fnArgs.deckTitle,
                  descricao: fnArgs.description || `Criado pela IA em ${new Date().toLocaleDateString('pt-BR')}`,
                },
              });

              const cardsData = (fnArgs.cards || []).map((c: any) => ({
                deckId: deck.id,
                frente: c.front,
                verso: c.back,
                tipo: 'card',
              }));

              if (cardsData.length > 0) {
                await prisma.flashcard.createMany({
                  data: cardsData,
                });
              }

              createdEntities.decksCreated.push({
                id: deck.id,
                nome: deck.nome,
                count: cardsData.length,
              });

              result = {
                success: true,
                deck: { id: deck.id, title: deck.nome, totalCards: cardsData.length },
              };
            } else if (fnName === 'add_cards_to_deck') {
              const deck = await prisma.deck.findFirst({
                where: { id: fnArgs.deckId, workspaceId },
              });
              if (!deck) {
                result = { error: 'Baralho não encontrado neste workspace.' };
              } else {
                const cardsData = (fnArgs.cards || []).map((c: any) => ({
                  deckId: deck.id,
                  frente: c.front,
                  verso: c.back,
                  tipo: 'card',
                }));
                if (cardsData.length > 0) {
                  await prisma.flashcard.createMany({ data: cardsData });
                }
                result = {
                  success: true,
                  deckId: deck.id,
                  deckTitle: deck.nome,
                  addedCards: cardsData.length,
                };
              }
            } else {
              result = { error: `Ferramenta desconhecida: ${fnName}` };
            }
          } catch (toolErr: any) {
            result = { error: toolErr.message || 'Erro ao executar ferramenta.' };
          }

          res.write(
            `event: tool_result\ndata: ${JSON.stringify({
              name: fnName,
              result,
            })}\n\n`
          );

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
      }

      // 7. Save assistant response to DB
      res.write(`event: status\ndata: ${JSON.stringify({ message: 'Finalizando a resposta.' })}\n\n`);
      const savedAssistantMsg = await prisma.aiChatMessage.create({
        data: {
          threadId,
          role: 'assistant',
          conteudo: assistantFullText,
          metadata: {
            createdEntities,
          },
        },
      });

      // 8. Update thread updatedAt
      await prisma.aiChatThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });

      // 9. Send final done event
      res.write(
        `event: done\ndata: ${JSON.stringify({
          messageId: savedAssistantMsg.id,
          threadId,
          fullText: assistantFullText,
          content: assistantFullText,
          text: assistantFullText,
          createdEntities,
        })}\n\n`
      );
      res.end();
    } catch (err: any) {
      console.error('Erro no stream do Tesseract AI:', err);
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: err.message || 'Erro durante a geração de resposta com o Tesseract AI.',
        })}\n\n`
      );
      res.end();
    }
  }
}

export const aiService = new AiService();
