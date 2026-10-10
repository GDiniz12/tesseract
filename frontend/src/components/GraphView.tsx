'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import GraphDrawingPreview from './GraphDrawingPreview';
import TesseractLogo from './TesseractLogo';
import { api } from '@/lib/api';
import { useTheme } from './ThemeProvider';
import IsometricGraph from './graph/IsometricGraph';
import ObsidianGraph from './graph/ObsidianGraph';
import { extractGraphLinks } from '@/lib/graphLinks';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

export type GroupRuleType = 'pasta' | 'tag' | 'titulo' | 'conteudo' | 'tipo';

export interface GraphGroup {
  id: string;
  ruleType: GroupRuleType;
  ruleValue: string;
  color: string;
  enabled: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
}

interface GraphViewProps {
  workspace: any;
  pastas: any[];
  notas: any[];
  onOpenNota: (nota: any) => void;
  onClose?: () => void;
  onUpdateWorkspace?: (workspace: any) => void;
}

// Tesseract Theme Color Presets for Color Groups
export const PRESET_GROUP_COLORS = [
  '#20b8cd', // Cyan
  '#23a55a', // Green
  '#f0b232', // Yellow / Amber
  '#f23f43', // Red
  '#eb459e', // Fuchsia
  '#38bdf8', // Light Cyan / Sky
  '#9b59b6', // Purple
  '#57f287', // Bright Green
  '#fee75c', // Bright Yellow
  '#e67e22', // Orange
  '#1abc9c', // Teal
  '#80848e', // Muted Gray
];

export const NEUTRAL_FALLBACK_COLOR = '#4e5058';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Evaluate whether a note matches an individual group rule
export function matchNoteToGroup(nota: any, group: GraphGroup): boolean {
  if (!group || !group.enabled || !nota) return false;
  const val = (group.ruleValue || '').trim().toLowerCase();

  switch (group.ruleType) {
    case 'pasta': {
      if (!val || val === 'root' || val === 'raiz') {
        return !nota.pastaId && !nota.folderId;
      }
      return (
        String(nota.pastaId || '').toLowerCase() === val ||
        String(nota.folderId || '').toLowerCase() === val ||
        (nota.folderName && String(nota.folderName).toLowerCase() === val)
      );
    }
    case 'tag': {
      if (!val) return false;
      const cleanTag = val.replace(/^#/, '').trim().toLowerCase();
      if (!cleanTag) return false;

      const title = (nota.titulo || nota.title || '').toLowerCase();
      const content = (nota.conteudo || nota.previewText || '').replace(/<[^>]*>/g, ' ').toLowerCase();

      const tagRegex = new RegExp(`(^|[^a-zA-Z0-9_])#${escapeRegex(cleanTag)}([^a-zA-Z0-9_]|$)`, 'i');
      return (
        tagRegex.test(title) ||
        tagRegex.test(content) ||
        title.includes('#' + cleanTag) ||
        content.includes('#' + cleanTag) ||
        title.includes(cleanTag) ||
        content.includes(cleanTag)
      );
    }
    case 'titulo': {
      if (!val) return false;
      const title = (nota.titulo || nota.title || '').toLowerCase();
      return title.includes(val);
    }
    case 'conteudo': {
      if (!val) return false;
      const content = (nota.conteudo || nota.previewText || '').replace(/<[^>]*>/g, ' ').toLowerCase();
      return content.includes(val);
    }
    case 'tipo': {
      const typeVal = val || 'texto';
      return (nota.tipo || 'texto').toLowerCase() === typeVal.toLowerCase();
    }
    default:
      return false;
  }
}

// Resolve note color based solely on active groups (no automatic folder coloring!)
export function resolveNodeColor(
  nota: any,
  groups: GraphGroup[] = []
): string {
  if (!nota) return NEUTRAL_FALLBACK_COLOR;
  const activeGroups = groups.filter((g) => g.enabled);

  if (activeGroups.length > 0) {
    for (const group of activeGroups) {
      if (matchNoteToGroup(nota, group)) {
        return group.color;
      }
    }
  }

  return NEUTRAL_FALLBACK_COLOR;
}

export default function GraphView({
  workspace,
  pastas,
  notas,
  onOpenNota,
  onClose,
  onUpdateWorkspace,
}: GraphViewProps) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  // Groups configuration state
  const [groups, setGroups] = useState<GraphGroup[]>(() => {
    if (workspace?.graphConfig?.groups && Array.isArray(workspace.graphConfig.groups)) {
      return workspace.graphConfig.groups;
    }
    return [];
  });

  const [activeColorPickerGroupId, setActiveColorPickerGroupId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync groups when workspace prop changes
  useEffect(() => {
    if (workspace?.graphConfig?.groups && Array.isArray(workspace.graphConfig.groups)) {
      setGroups(workspace.graphConfig.groups);
    }
  }, [workspace?.id]);

  // Debounced save groups to backend
  const persistGroups = (newGroups: GraphGroup[]) => {
    setGroups(newGroups);
    setSaveStatus('saving');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await api(`/workspaces/${workspace.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            graphConfig: {
              ...(workspace?.graphConfig || {}),
              groups: newGroups,
            },
          }),
        });
        setSaveStatus('saved');
        if (onUpdateWorkspace && res) {
          onUpdateWorkspace(res);
        }
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (err) {
        console.error('Failed to save graph groups to backend', err);
        setSaveStatus('idle');
      }
    }, 500);
  };

  // Group actions
  const handleAddGroup = () => {
    const defaultColor = PRESET_GROUP_COLORS[groups.length % PRESET_GROUP_COLORS.length];
    const defaultType: GroupRuleType = pastas.length > 0 ? 'pasta' : 'tag';
    const defaultValue = defaultType === 'pasta' ? (pastas[0]?.id || 'root') : '';

    const newGroup: GraphGroup = {
      id: 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      ruleType: defaultType,
      ruleValue: defaultValue,
      color: defaultColor,
      enabled: true,
    };
    persistGroups([...groups, newGroup]);
  };

  const handleUpdateGroup = (id: string, partial: Partial<GraphGroup>) => {
    const updated = groups.map((g) => (g.id === id ? { ...g, ...partial } : g));
    persistGroups(updated);
  };

  const handleDeleteGroup = (id: string) => {
    const updated = groups.filter((g) => g.id !== id);
    persistGroups(updated);
    if (activeColorPickerGroupId === id) setActiveColorPickerGroupId(null);
  };

  const handleMoveGroup = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= groups.length) return;
    const reordered = [...groups];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);
    persistGroups(reordered);
  };

  // Graph Modes: 'obsidian' (2D physics graph) | 'isometric' (3D architectural graph)
  const [graphMode, setGraphMode] = useState<'obsidian' | 'isometric'>('obsidian');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all');
  const [hideOrphans, setHideOrphans] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  // Obsidian Physics parameters
  const [repulsionForce, setRepulsionForce] = useState(280);
  const [linkDistance, setLinkDistance] = useState(80);
  const [centerForce, setCenterForce] = useState(0.08);
  const [nodeScale, setNodeScale] = useState(1);
  const [synapseParticlesEnabled, setSynapseParticlesEnabled] = useState(true);

  // Settings drawer & active tab
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'filtros' | 'grupos' | 'fisica'>('grupos');

  // Hovered note state for side preview
  const [hoveredNota, setHoveredNota] = useState<any | null>(null);

  // Extract Links from HTML content of notes
  const links = useMemo<GraphLink[]>(() => {
    return extractGraphLinks(notas);
  }, [notas]);

  // Connection count for each note
  const connectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    links.forEach((l) => {
      counts[l.source] = (counts[l.source] || 0) + 1;
      counts[l.target] = (counts[l.target] || 0) + 1;
    });
    return counts;
  }, [links]);

  // Filtered notes based on folder, search term, and orphan filter
  const filteredNotas = useMemo(() => {
    let result = notas;

    // Folder filter
    if (selectedFolderFilter !== 'all') {
      if (selectedFolderFilter === 'root') {
        result = result.filter((n) => !n.pastaId);
      } else {
        result = result.filter((n) => n.pastaId === selectedFolderFilter);
      }
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (n) =>
          (n.titulo || '').toLowerCase().includes(q) ||
          (n.conteudo || '').toLowerCase().includes(q)
      );
    }

    // Hide orphans filter
    if (hideOrphans) {
      result = result.filter((n) => (connectionCounts[n.id] || 0) > 0);
    }

    return result;
  }, [notas, selectedFolderFilter, searchTerm, hideOrphans, connectionCounts]);

  // Count matching notes for each group
  const groupMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    groups.forEach((g) => {
      counts[g.id] = notas.filter((n) => matchNoteToGroup(n, g)).length;
    });
    return counts;
  }, [groups, notas]);

  const activeGroupsCount = groups.filter((g) => g.enabled).length;

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#1e1f22] select-none font-sans">
      {/* Top Floating Navigation Toolbar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
        {/* Left Control Cluster */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Brand Icon */}
          <div className="flex items-center justify-center bg-[#2b2d31]/90 backdrop-blur-md border border-[#383a40] rounded-[8px] p-2 shadow-lg">
            <TesseractLogo size={16} />
          </div>

          {/* Search Input Box */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#2b2d31]/90 backdrop-blur-md rounded-[8px] border border-[#383a40] shadow-lg focus-within:border-[#20b8cd] transition-colors">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-[#949ba4]"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Filtrar notas no grafo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-[#dbdee1] placeholder-[#80848e] w-28 sm:w-44"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-[#949ba4] hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Graph Mode Switch */}
          <div className="flex items-center bg-[#2b2d31]/90 backdrop-blur-md border border-[#383a40] rounded-[8px] p-1 shadow-lg gap-1">
            <button
              type="button"
              onClick={() => setGraphMode('obsidian')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-[5px] transition-all cursor-pointer ${
                graphMode === 'obsidian'
                  ? 'bg-[#20b8cd] text-white shadow-sm'
                  : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="18" r="3" />
                <circle cx="18" cy="6" r="3" />
                <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
                <line x1="15.5" y1="7.5" x2="8.5" y2="16.5" />
              </svg>
              <span>Grafo 2D</span>
            </button>
            <button
              type="button"
              onClick={() => setGraphMode('isometric')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-[5px] transition-all cursor-pointer ${
                graphMode === 'isometric'
                  ? 'bg-[#20b8cd] text-white shadow-sm'
                  : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span>Isométrico 3D</span>
            </button>
          </div>

          {/* Labels Toggle */}
          <button
            type="button"
            onClick={() => setShowLabels((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border text-xs font-medium transition-all shadow-lg cursor-pointer ${
              showLabels
                ? 'bg-[#35373c] text-white border-[#4e5058]'
                : 'bg-[#2b2d31]/90 text-[#949ba4] border-[#383a40] hover:text-white hover:bg-[#35373c]'
            }`}
            title="Mostrar ou ocultar títulos das notas"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </svg>
            <span>Nomes</span>
          </button>

          {/* Settings & Groups Drawer Button */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border text-xs font-medium transition-all shadow-lg cursor-pointer ${
              isSettingsOpen
                ? 'bg-[#20b8cd] text-white border-[#20b8cd]'
                : 'bg-[#2b2d31]/90 text-[#dbdee1] border-[#383a40] hover:bg-[#35373c]'
            }`}
            title="Abrir painel de configurações, filtros e grupos de cores"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Ajustes & Grupos</span>
            {activeGroupsCount > 0 && (
              <span className="bg-[#1e1f22] text-[#20b8cd] font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {activeGroupsCount}
              </span>
            )}
          </button>
        </div>

        {/* Right Stats & Action Cluster */}
        <div className="flex items-center gap-2 bg-[#2b2d31]/90 backdrop-blur-md border border-[#383a40] rounded-[8px] px-3 py-1.5 shadow-lg pointer-events-auto text-xs text-[#949ba4]">
          <span className="text-white font-medium">{filteredNotas.length} notas</span>
          <span>•</span>
          <span className="text-white font-medium">{links.length} conexões</span>

          <div className="w-[1px] h-3.5 bg-[#383a40] mx-1" />

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-5 h-5 flex items-center justify-center rounded-[4px] text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
              title="Fechar Grafo"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Retractable Floating Control Panel (Filters, Groups, Physics) */}
      {isSettingsOpen && (
        <div className="absolute top-14 left-3 z-30 w-[360px] sm:w-[390px] max-h-[calc(100vh-100px)] bg-[#2b2d31] border border-[#383a40] rounded-[8px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-100">
          {/* Drawer Header */}
          <div className="border-b border-[#383a40] bg-[#1e1f22]/80">
            <div className="flex items-center justify-between p-2.5 px-3">
              <span className="text-xs font-semibold text-white tracking-tight flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#20b8cd]">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                Controles do Grafo
              </span>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="w-5 h-5 flex items-center justify-center rounded text-[#949ba4] hover:text-white hover:bg-[#35373c] text-xs transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Segmented Tab Headers */}
            <div className="flex items-center px-2 pb-2 gap-1">
              <button
                type="button"
                onClick={() => setSettingsTab('grupos')}
                className={`flex-1 py-1 text-xs font-medium rounded-[4px] transition-colors cursor-pointer ${
                  settingsTab === 'grupos'
                    ? 'bg-[#35373c] text-white'
                    : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#2b2d31]'
                }`}
              >
                Grupos ({groups.length})
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('filtros')}
                className={`flex-1 py-1 text-xs font-medium rounded-[4px] transition-colors cursor-pointer ${
                  settingsTab === 'filtros'
                    ? 'bg-[#35373c] text-white'
                    : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#2b2d31]'
                }`}
              >
                Filtros
              </button>
              {graphMode === 'obsidian' && (
                <button
                  type="button"
                  onClick={() => setSettingsTab('fisica')}
                  className={`flex-1 py-1 text-xs font-medium rounded-[4px] transition-colors cursor-pointer ${
                    settingsTab === 'fisica'
                      ? 'bg-[#35373c] text-white'
                      : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#2b2d31]'
                  }`}
                >
                  Física 2D
                </button>
              )}
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[55vh] text-xs text-[#dbdee1]">
            {/* TAB 1: GRUPOS DE CORES */}
            {settingsTab === 'grupos' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-[#383a40]">
                  <span className="text-[11px] text-[#949ba4]">
                    Crie regras personalizadas para colorir notas
                  </span>
                  <button
                    type="button"
                    onClick={handleAddGroup}
                    className="px-2 py-0.5 bg-[#20b8cd] hover:bg-[#1ba2b4] text-white rounded-[4px] text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    + Novo Grupo
                  </button>
                </div>

                {groups.length === 0 ? (
                  <div className="py-6 px-3 text-center">
                    <p className="text-white font-medium mb-1">Nenhum grupo ativo</p>
                    <p className="text-[11px] text-[#949ba4] mb-3 leading-relaxed">
                      Notas sem grupo utilizam a cor neutra padrão. Adicione regras para destacar pastas, tags ou termos.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddGroup}
                      className="px-3 py-1 bg-[#20b8cd] hover:bg-[#1ba2b4] text-white font-medium rounded-[4px] cursor-pointer"
                    >
                      Adicionar Primeiro Grupo
                    </button>
                  </div>
                ) : (
                  groups.map((group, index) => {
                    const matchCount = groupMatchCounts[group.id] || 0;
                    const isColorPickerOpen = activeColorPickerGroupId === group.id;

                    return (
                      <div
                        key={group.id}
                        className={`p-2 rounded-[6px] border transition-all ${
                          group.enabled
                            ? 'bg-[#1e1f22] border-[#383a40]'
                            : 'bg-[#1e1f22]/50 border-[#2b2d31] opacity-50'
                        }`}
                      >
                        {/* Top row: reorder, checkbox, color swatch, type, match count, delete */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleMoveGroup(index, 'up')}
                              className="w-3.5 h-3 flex items-center justify-center text-[9px] text-[#949ba4] hover:text-white disabled:opacity-20 cursor-pointer"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={index === groups.length - 1}
                              onClick={() => handleMoveGroup(index, 'down')}
                              className="w-3.5 h-3 flex items-center justify-center text-[9px] text-[#949ba4] hover:text-white disabled:opacity-20 cursor-pointer"
                            >
                              ▼
                            </button>
                          </div>

                          <input
                            type="checkbox"
                            checked={group.enabled}
                            onChange={(e) => handleUpdateGroup(group.id, { enabled: e.target.checked })}
                            className="rounded cursor-pointer w-3.5 h-3.5 accent-[#20b8cd]"
                          />

                          {/* Color button */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveColorPickerGroupId((prev) => (prev === group.id ? null : group.id))
                              }
                              className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center cursor-pointer hover:scale-105"
                              style={{ backgroundColor: group.color }}
                            />

                            {/* Color popover */}
                            {isColorPickerOpen && (
                              <div className="absolute top-7 left-0 z-50 p-2 bg-[#1e1f22] border border-[#383a40] rounded-[6px] shadow-2xl w-44">
                                <div className="grid grid-cols-6 gap-1.5">
                                  {PRESET_GROUP_COLORS.map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => {
                                        handleUpdateGroup(group.id, { color: c });
                                        setActiveColorPickerGroupId(null);
                                      }}
                                      className={`w-5 h-5 rounded-full cursor-pointer border ${
                                        group.color.toLowerCase() === c.toLowerCase()
                                          ? 'border-white ring-2 ring-[#20b8cd]'
                                          : 'border-transparent'
                                      }`}
                                      style={{ backgroundColor: c }}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Rule Type */}
                          <select
                            value={group.ruleType}
                            onChange={(e) =>
                              handleUpdateGroup(group.id, {
                                ruleType: e.target.value as GroupRuleType,
                                ruleValue:
                                  e.target.value === 'pasta'
                                    ? pastas[0]?.id || 'root'
                                    : '',
                              })
                            }
                            className="bg-[#2b2d31] text-[#dbdee1] border border-[#383a40] rounded-[4px] px-2 py-0.5 text-xs outline-none"
                          >
                            <option value="pasta">Pasta</option>
                            <option value="tag">Tag (#)</option>
                            <option value="titulo">Título</option>
                            <option value="conteudo">Conteúdo</option>
                            <option value="tipo">Tipo</option>
                          </select>

                          {/* Match count */}
                          <span className="font-mono text-[10px] text-[#949ba4] shrink-0">
                            {matchCount} {matchCount === 1 ? 'nota' : 'notas'}
                          </span>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group.id)}
                            className="w-4 h-4 ml-auto text-[#949ba4] hover:text-[#f23f43] text-xs cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Value input */}
                        <div>
                          {group.ruleType === 'pasta' ? (
                            <select
                              value={group.ruleValue || 'root'}
                              onChange={(e) => handleUpdateGroup(group.id, { ruleValue: e.target.value })}
                              className="w-full bg-[#2b2d31] text-xs text-[#dbdee1] border border-[#383a40] rounded-[4px] px-2 py-1 outline-none"
                            >
                              <option value="root">Sem Pasta (Raiz)</option>
                              {pastas.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nome}
                                </option>
                              ))}
                            </select>
                          ) : group.ruleType === 'tag' ? (
                            <input
                              type="text"
                              placeholder="ex: historia, matematica"
                              value={group.ruleValue || ''}
                              onChange={(e) => handleUpdateGroup(group.id, { ruleValue: e.target.value })}
                              className="w-full bg-[#2b2d31] text-xs text-[#dbdee1] placeholder-[#80848e] border border-[#383a40] rounded-[4px] px-2 py-1 outline-none focus:border-[#20b8cd]"
                            />
                          ) : (
                            <input
                              type="text"
                              placeholder="Digite termo de busca..."
                              value={group.ruleValue || ''}
                              onChange={(e) => handleUpdateGroup(group.id, { ruleValue: e.target.value })}
                              className="w-full bg-[#2b2d31] text-xs text-[#dbdee1] placeholder-[#80848e] border border-[#383a40] rounded-[4px] px-2 py-1 outline-none focus:border-[#20b8cd]"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: FILTROS */}
            {settingsTab === 'filtros' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-[#949ba4] block mb-1">Filtrar por Pasta</label>
                  <select
                    value={selectedFolderFilter}
                    onChange={(e) => setSelectedFolderFilter(e.target.value)}
                    className="w-full bg-[#1e1f22] text-[#dbdee1] border border-[#383a40] rounded-[4px] px-2 py-1 text-xs outline-none"
                  >
                    <option value="all">Todas as Pastas</option>
                    <option value="root">Sem Pasta (Raiz)</option>
                    {pastas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between p-2 rounded-[6px] bg-[#1e1f22] border border-[#383a40]">
                  <span className="text-xs text-[#dbdee1]">Ocultar notas órfãs (isoladas)</span>
                  <input
                    type="checkbox"
                    checked={hideOrphans}
                    onChange={(e) => setHideOrphans(e.target.checked)}
                    className="cursor-pointer accent-[#20b8cd] w-4 h-4"
                  />
                </div>

                {graphMode === 'obsidian' && (
                  <div className="flex items-center justify-between p-2 rounded-[6px] bg-[#1e1f22] border border-[#383a40]">
                    <span className="text-xs text-[#dbdee1]">Partículas de Sinapse</span>
                    <input
                      type="checkbox"
                      checked={synapseParticlesEnabled}
                      onChange={(e) => setSynapseParticlesEnabled(e.target.checked)}
                      className="cursor-pointer accent-[#20b8cd] w-4 h-4"
                    />
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: FÍSICA OBSIDIAN */}
            {settingsTab === 'fisica' && graphMode === 'obsidian' && (
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-[11px] text-[#949ba4] mb-1">
                    <span>Força de Repulsão (Espaçamento)</span>
                    <span className="font-mono text-white">{repulsionForce}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="600"
                    value={repulsionForce}
                    onChange={(e) => setRepulsionForce(Number(e.target.value))}
                    className="w-full accent-[#20b8cd] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#949ba4] mb-1">
                    <span>Distância dos Links</span>
                    <span className="font-mono text-white">{linkDistance}px</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="200"
                    value={linkDistance}
                    onChange={(e) => setLinkDistance(Number(e.target.value))}
                    className="w-full accent-[#20b8cd] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#949ba4] mb-1">
                    <span>Gravidade Central</span>
                    <span className="font-mono text-white">{(centerForce * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.02"
                    max="0.25"
                    step="0.01"
                    value={centerForce}
                    onChange={(e) => setCenterForce(Number(e.target.value))}
                    className="w-full accent-[#20b8cd] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#949ba4] mb-1">
                    <span>Escala do Tamanho dos Nós</span>
                    <span className="font-mono text-white">{nodeScale.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="2.0"
                    step="0.1"
                    value={nodeScale}
                    onChange={(e) => setNodeScale(Number(e.target.value))}
                    className="w-full accent-[#20b8cd] cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Save indicator */}
          <div className="p-2 px-3 bg-[#1e1f22]/60 border-t border-[#383a40] flex items-center justify-between text-[11px] text-[#949ba4]">
            <span>Notas sem grupo: <strong className="text-white font-normal">Cinza Neutro</strong></span>
            {saveStatus === 'saving' && <span className="text-[#f0b232]">Salvando...</span>}
            {saveStatus === 'saved' && <span className="text-[#23a55a]">✓ Salvo</span>}
          </div>
        </div>
      )}

      {/* Main Graph Viewport */}
      <div className="absolute inset-0 z-0">
        {graphMode === 'obsidian' && (
          <ObsidianGraph
            notas={filteredNotas}
            links={links}
            groups={groups}
            hoveredNodeId={hoveredNota?.id || null}
            showLabels={showLabels}
            repulsionForce={repulsionForce}
            linkDistance={linkDistance}
            centerForce={centerForce}
            nodeScale={nodeScale}
            synapseParticlesEnabled={synapseParticlesEnabled}
            onHoverNode={(nota) => setHoveredNota(nota)}
            onOpenNota={(nota) => {
              if (onOpenNota) onOpenNota(nota);
            }}
          />
        )}

        {graphMode === 'isometric' && (
          <IsometricGraph
            notas={filteredNotas}
            links={links}
            groups={groups}
            hoveredNodeId={hoveredNota?.id || null}
            showLabels={showLabels}
            onHoverNode={(nota) => setHoveredNota(nota)}
            onOpenNota={(nota) => {
              if (onOpenNota) onOpenNota(nota);
            }}
          />
        )}
      </div>

      {/* Side Preview Card on Hover */}
      {hoveredNota && (
        <div className="animate-in fade-in duration-100 fixed md:absolute bottom-3 md:bottom-12 right-3 md:right-4 md:w-[320px] max-h-[50vh] bg-[#2b2d31] border border-[#383a40] rounded-[8px] shadow-2xl flex flex-col z-30 overflow-hidden pointer-events-none">
          <div className="p-3">
            <h4 className="text-sm font-semibold text-white tracking-tight leading-snug">
              {hoveredNota.titulo || 'Sem Título'}
            </h4>
          </div>

          {/* Preview Content */}
          <div className="p-3 pt-0 overflow-y-auto max-h-48 text-xs text-[#dbdee1] leading-relaxed no-scrollbar">
            {hoveredNota.tipo === 'desenho' ? (
              <GraphDrawingPreview conteudoJson={hoveredNota.conteudo} />
            ) : hoveredNota.conteudo && hoveredNota.conteudo.trim() ? (
              <div
                className="notion-editor text-[12px] leading-[1.5] text-[#dbdee1]"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(hoveredNota.conteudo) }}
                style={{ wordBreak: 'break-word' }}
              />
            ) : (
              <p className="text-[#80848e] italic text-center py-2">Nota sem conteúdo</p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
