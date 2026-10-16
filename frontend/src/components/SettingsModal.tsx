'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { translations, Language } from '@/lib/i18n';
import TesseractLogo from './TesseractLogo';
import { useTheme } from './ThemeProvider';
import ImageCropperModal from './ImageCropperModal';

interface SettingsModalProps {
  currentUser: any;
  workspace: any;
  notas: any[];
  onUpdateUser: (user: any) => void;
  onClose: () => void;
}

export type SettingsTab = 'account' | 'general' | 'appearance' | 'editor' | 'shortcuts' | 'backup' | 'danger';

export default function SettingsModal({
  currentUser,
  workspace,
  notas,
  onUpdateUser,
  onClose,
}: SettingsModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Language State
  const [currentLang, setCurrentLang] = useState<Language>('pt-BR');
  const t = (key: keyof typeof translations['pt-BR']) => translations[currentLang][key] || key;

  useEffect(() => {
    const saved = (localStorage.getItem('synap_language') as Language) || 'pt-BR';
    setCurrentLang(saved);
  }, []);

  // Account State
  const [nome, setNome] = useState(currentUser?.name || currentUser?.nome || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropperImage, setCropperImage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cropperImage) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, cropperImage]);

  // Sync state if currentUser changes
  useEffect(() => {
    if (currentUser) {
      setNome(currentUser.name || currentUser.nome || '');
      setUsername(currentUser.username || '');
      setAvatarUrl(currentUser.avatarUrl || '');
      setEmail(currentUser.email || '');
    }
  }, [currentUser]);

  // General State
  const prefs = currentUser?.preferences || {};
  const [language, setLanguage] = useState(prefs.language || 'pt-BR');
  const [startupBehavior, setStartupBehavior] = useState(prefs.startupBehavior || 'last_note');

  // Theme State from Context
  const { theme, setTheme } = useTheme();

  // Appearance State
  const [fontSize, setFontSize] = useState(prefs.editorFontSize || '15px');
  const [fontFamily, setFontFamily] = useState(prefs.editorFontFamily || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");

  // Editor State
  const [editorWidth, setEditorWidth] = useState(prefs.editorWidth || '800px');
  const [slashMenuEnabled, setSlashMenuEnabled] = useState(prefs.slashMenuEnabled !== false);
  const [wikilinksEnabled, setWikilinksEnabled] = useState(prefs.wikilinksEnabled !== false);
  const [codeTheme, setCodeTheme] = useState(prefs.codeTheme || 'vscode-dark');

  // Shortcut search filter
  const [shortcutSearch, setShortcutSearch] = useState('');

  // Backup & export status
  const [exporting, setExporting] = useState(false);

  // Danger Zone: Workspaces list & Delete confirmation
  const [allWorkspaces, setAllWorkspaces] = useState<any[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<any | null>(null);
  const [dangerMsg, setDangerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch workspaces when Danger Zone tab is opened
  useEffect(() => {
    if (activeTab === 'danger') {
      setLoadingWorkspaces(true);
      setDangerMsg(null);
      api('/workspaces')
        .then((data) => {
          if (Array.isArray(data)) setAllWorkspaces(data);
        })
        .catch((err) => console.error('Erro ao carregar workspaces', err))
        .finally(() => setLoadingWorkspaces(false));
    }
  }, [activeTab]);

  const handleSaveGeneral = async (key: string, value: any) => {
    try {
      // For Theme and Language, also mirror to localStorage to prevent flashing
      if (key === 'language') localStorage.setItem('synap_language', value);

      const newPrefs = {
        ...(currentUser?.preferences || {}),
        [key]: value,
      };
      
      const updatedUser = { ...currentUser, preferences: newPrefs };
      onUpdateUser(updatedUser);
      
      await api('/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ preferences: newPrefs }),
      });
    } catch (err) {
      console.error('Erro ao salvar preferência:', err);
    }
  };

  const handleAvatarUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAccountMsg({ type: 'error', text: 'Por favor, selecione um arquivo de imagem válido.' });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setAccountMsg({ type: 'error', text: 'A imagem deve ter no máximo 15MB.' });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setCropperImage(objectUrl);
  };

  const handleCroppedAvatarConfirm = async (croppedBlob: Blob) => {
    setIsUploadingAvatar(true);
    setAccountMsg(null);

    try {
      const croppedFile = new File([croppedBlob], 'avatar.webp', { type: 'image/webp' });
      const formData = new FormData();
      formData.append('file', croppedFile);
      const res = await api('/upload', {
        method: 'POST',
        body: formData,
      });

      if (res && res.url) {
        setAvatarUrl(res.url);
        const updated = await api('/auth/me', {
          method: 'PUT',
          body: JSON.stringify({ avatarUrl: res.url }),
        });
        onUpdateUser(updated);
        setAccountMsg({ type: 'success', text: 'Foto de perfil atualizada com sucesso!' });
      }
    } catch (err: any) {
      setAccountMsg({ type: 'error', text: err.message || 'Erro ao enviar foto de perfil.' });
    } finally {
      setIsUploadingAvatar(false);
      setCropperImage(null);
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true);
    setAccountMsg(null);
    try {
      setAvatarUrl('');
      const updated = await api('/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ avatarUrl: null }),
      });
      onUpdateUser(updated);
      setAccountMsg({ type: 'success', text: 'Foto de perfil removida com sucesso.' });
    } catch (err: any) {
      setAccountMsg({ type: 'error', text: err.message || 'Erro ao remover foto.' });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    setAccountMsg(null);

    try {
      const body: any = {
        name: nome.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim(),
        avatarUrl: avatarUrl || null,
      };
      if (newPassword) {
        body.password = newPassword;
      }

      const updated = await api('/auth/me', {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      onUpdateUser(updated);
      setAccountMsg({ type: 'success', text: t('profile_updated') });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setAccountMsg({ type: 'error', text: err.message || 'Erro ao atualizar conta.' });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDeleteWorkspace = async (targetWs: any) => {
    setDeletingWorkspaceId(targetWs.id);
    setDangerMsg(null);

    try {
      await api(`/workspaces/${targetWs.id}`, {
        method: 'DELETE',
      });

      setAllWorkspaces((prev) => prev.filter((w) => w.id !== targetWs.id));
      setWorkspaceToDelete(null);
      setDangerMsg({ type: 'success', text: t('workspace_deleted_success') });

      // If user deleted the workspace they are currently inside, redirect to dashboard
      if (targetWs.id === workspace?.id) {
        setTimeout(() => {
          onClose();
          router.push('/dashboard');
        }, 800);
      }
    } catch (err: any) {
      setDangerMsg({ type: 'error', text: err.message || 'Erro ao excluir workspace.' });
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const handleExportMarkdown = () => {
    setExporting(true);
    try {
      notas.forEach((nota, index) => {
        setTimeout(() => {
          const content = nota.conteudo ? nota.conteudo.replace(/<[^>]*>?/gm, '\n') : '';
          const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${nota.titulo || 'nota'}.md`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, index * 200);
      });
    } catch (err) {
      console.error('Erro ao exportar notas', err);
    } finally {
      setTimeout(() => setExporting(false), notas.length * 200 + 500);
    }
  };

  const shortcutsList = [
    { key: 'Ctrl + D', desc: 'Abrir ou recolher a barra lateral (Sidebar)', category: 'Navegação' },
    { key: 'Ctrl + J', desc: 'Abrir ou fechar o assistente Tesseract AI', category: 'Inteligência Artificial' },
    { key: 'Ctrl + `', desc: 'Abrir ou recolher o Terminal integrado', category: 'Navegação' },
    { key: 'Ctrl + N', desc: 'Criar uma nova nota de texto imediatamente', category: 'Criação' },
    { key: 'Ctrl + G', desc: 'Abrir ou fechar a visualização do Grafo de Conexões', category: 'Navegação' },
    { key: 'Ctrl + 1..9', desc: 'Navegar diretamente entre as abas abertas no topo', category: 'Navegação' },
    { key: 'Ctrl + B', desc: 'Formatar texto selecionado como Negrito', category: 'Editor' },
    { key: 'Ctrl + I', desc: 'Formatar texto selecionado como Itálico', category: 'Editor' },
    { key: 'Ctrl + U', desc: 'Formatar texto selecionado como Sublinhado', category: 'Editor' },
    { key: 'Ctrl + K', desc: 'Inserir link externo no texto', category: 'Editor' },
    { key: '/', desc: 'Abrir menu suspenso de comandos e blocos rápidos', category: 'Editor' },
    { key: '[[', desc: 'Criar ou vincular Wikilink a outra nota do workspace', category: 'Editor' },
    { key: '::', desc: 'Criar ou conectar um Flashcard direto na frase', category: 'Editor' },
    { key: 'V / 1', desc: 'Ferramenta de Seleção / Mover (Canvas)', category: 'Desenho' },
    { key: 'H / Espaço', desc: 'Ferramenta Mão (Arrastar tela no Canvas)', category: 'Desenho' },
    { key: 'P / 2', desc: 'Ferramenta Caneta / Traço livre (Canvas)', category: 'Desenho' },
    { key: 'R / 3', desc: 'Ferramenta Retângulo (Canvas)', category: 'Desenho' },
    { key: 'O / 4', desc: 'Ferramenta Elipse / Círculo (Canvas)', category: 'Desenho' },
    { key: 'A / 5', desc: 'Ferramenta Seta conectora (Canvas)', category: 'Desenho' },
    { key: 'L / 6', desc: 'Ferramenta Linha reta (Canvas)', category: 'Desenho' },
    { key: 'T / 7', desc: 'Ferramenta Texto no Canvas', category: 'Desenho' },
    { key: 'E / 8', desc: 'Ferramenta Borracha (Canvas)', category: 'Desenho' },
    { key: 'Del / Backspace', desc: 'Excluir elementos selecionados no Canvas', category: 'Desenho' },
  ];

  const filteredShortcuts = shortcutsList.filter(
    (s) =>
      s.key.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
      s.desc.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
      s.category.toLowerCase().includes(shortcutSearch.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 md:p-6 overflow-hidden select-none animate-in fade-in duration-150 font-sansation"
      onClick={onClose}
    >
      <div
        className="mobile-fullscreen-dialog md:w-[860px] md:max-w-[calc(100vw-3rem)] md:h-[85vh] md:max-h-[640px] rounded-none h-full w-full bg-[#181818] border-0 md:border md:border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row h-full w-full overflow-hidden">
          {/* Left / Top Navigation Bar */}
          <div className="w-full md:w-[210px] bg-[#141414] border-b md:border-b-0 md:border-r border-white/10 flex flex-col justify-between p-3 md:p-4 shrink-0">
            <div>
              <div className="flex items-center justify-between md:justify-start gap-2 pb-2 md:pb-4 border-b border-white/10 md:border-b-0">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-none bg-white text-black flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-white tracking-tight uppercase">
                    {t('settings_title')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="md:hidden w-6 h-6 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  aria-label="Fechar"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto no-scrollbar py-2 md:pt-4">
                {[
                  {
                    id: 'account',
                    label: t('tab_account'),
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    ),
                  },
                  {
                    id: 'general',
                    label: t('tab_general'),
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                      </svg>
                    ),
                  },
                  {
                    id: 'appearance',
                    label: t('tab_appearance'),
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="4"/>
                        <path d="M12 2v2"/>
                        <path d="M12 20v2"/>
                        <path d="m4.93 4.93 1.41 1.41"/>
                        <path d="m17.66 17.66 1.41 1.41"/>
                        <path d="M2 12h2"/>
                        <path d="M20 12h2"/>
                        <path d="m6.34 17.66-1.41 1.41"/>
                        <path d="m19.07 4.93-1.41 1.41"/>
                      </svg>
                    ),
                  },
                  {
                    id: 'editor',
                    label: t('tab_editor'),
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      </svg>
                    ),
                  },
                  {
                    id: 'shortcuts',
                    label: t('tab_shortcuts'),
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="14" x="2" y="5" rx="0"/>
                        <line x1="6" y1="10" x2="6" y2="10"/>
                        <line x1="10" y1="10" x2="10" y2="10"/>
                        <line x1="14" y1="10" x2="14" y2="10"/>
                        <line x1="18" y1="10" x2="18" y2="10"/>
                        <line x1="7" y1="15" x2="17" y2="15"/>
                      </svg>
                    ),
                  },
                  {
                    id: 'backup',
                    label: t('tab_backup'),
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    ),
                  },
                  {
                    id: 'danger',
                    label: t('tab_danger'),
                    isDanger: true,
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    ),
                  },
                ].map((item) => {
                  const isActive = activeTab === item.id;
                  const isDanger = item.isDanger;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id as SettingsTab)}
                      className={`whitespace-nowrap shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-none text-xs font-medium transition-colors cursor-pointer text-left ${
                        isActive
                          ? isDanger
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30 font-semibold'
                            : 'bg-white/10 text-white border border-white/10 font-semibold'
                          : isDanger
                          ? 'text-red-400/80 hover:text-red-300 hover:bg-red-500/5 border border-transparent'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="hidden md:flex items-center gap-2 pt-3 border-t border-white/10">
              <TesseractLogo size={18} />
              <span className="text-[11px] font-mono text-zinc-500">Tesseract</span>
            </div>
          </div>

          {/* Right Content Panel */}
          <div className="flex-1 p-4 md:p-8 overflow-y-auto min-h-0 flex flex-col bg-[#181818] custom-scrollbar">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 mb-5 border-b border-white/10">
              <div>
                <h2 className={`text-sm font-bold uppercase tracking-wider ${activeTab === 'danger' ? 'text-red-400' : 'text-white'}`}>
                  {activeTab === 'account' && t('tab_account')}
                  {activeTab === 'general' && t('tab_general')}
                  {activeTab === 'appearance' && t('tab_appearance')}
                  {activeTab === 'editor' && t('tab_editor')}
                  {activeTab === 'shortcuts' && t('tab_shortcuts')}
                  {activeTab === 'backup' && t('tab_backup')}
                  {activeTab === 'danger' && t('tab_danger')}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {activeTab === 'account' && t('desc_account')}
                  {activeTab === 'general' && t('desc_general')}
                  {activeTab === 'appearance' && t('desc_appearance')}
                  {activeTab === 'editor' && t('desc_editor')}
                  {activeTab === 'shortcuts' && t('desc_shortcuts')}
                  {activeTab === 'backup' && t('desc_backup')}
                  {activeTab === 'danger' && t('desc_danger')}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="hidden md:flex w-7 h-7 items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 1. Account Settings */}
            {activeTab === 'account' && (
              <form onSubmit={handleUpdateAccount} className="flex flex-col gap-4 max-w-[460px]">
                {accountMsg && (
                  <div
                    className={`p-2.5 rounded-none text-xs ${
                      accountMsg.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {accountMsg.text}
                  </div>
                )}

                {/* Hidden Avatar Input */}
                <input
                  type="file"
                  ref={avatarInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarUpload(file);
                    e.target.value = '';
                  }}
                />

                {/* Profile Picture / Avatar Section */}
                <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                  <div className="w-14 h-14 rounded-none bg-white/10 text-white border border-white/10 flex items-center justify-center text-lg font-bold overflow-hidden shrink-0">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt={nome || username || 'Avatar'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{nome?.[0]?.toUpperCase() || username?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-white">Foto de Perfil</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isUploadingAvatar}
                        onClick={() => avatarInputRef.current?.click()}
                        className="h-7 px-3 text-xs font-semibold rounded-none bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isUploadingAvatar ? 'Enviando...' : 'Carregar Foto'}
                      </button>
                      {avatarUrl && (
                        <button
                          type="button"
                          disabled={isUploadingAvatar}
                          onClick={handleRemoveAvatar}
                          className="h-7 px-3 text-xs font-semibold rounded-none bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Remover Foto
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-500">Recomendado: PNG, JPG ou WEBP até 15MB.</span>
                  </div>
                </div>

                {/* Username Field */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 flex justify-between mb-1.5">
                    <span>Nome de Usuário</span>
                    <span className="text-[10px] text-zinc-500 font-mono">Identificador Único</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-zinc-500 text-xs font-mono pointer-events-none">@</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                      placeholder="usuario"
                      className="w-full h-8 pl-6 pr-3 bg-white/5 border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs transition-colors"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Usado para identificação na barra lateral, menções e convites.
                  </p>
                </div>

                {/* Full Name */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                    {t('full_name')}
                  </label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu Nome Completo"
                    className="w-full h-8 px-3 bg-white/5 border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs transition-colors"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                    {t('email')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-8 px-3 bg-white/5 border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs transition-colors"
                    required
                  />
                </div>

                {/* Password */}
                <div className="pt-3 border-t border-white/10">
                  <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                    {t('new_password')}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('new_password_placeholder')}
                    className="w-full h-8 px-3 bg-white/5 border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingAccount || isUploadingAvatar}
                  className="h-8 px-4 text-xs font-bold rounded-none bg-white text-black hover:bg-zinc-200 shadow-xs transition-colors cursor-pointer disabled:opacity-50 w-fit mt-1"
                >
                  {savingAccount ? t('saving_btn') : t('save_changes')}
                </button>
              </form>
            )}

            {/* 2. General Settings */}
            {activeTab === 'general' && (
              <div className="flex flex-col gap-5 max-w-[520px]">
                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    {t('interface_language')}
                  </label>
                  <p className="text-xs text-zinc-400 mb-2">
                    {t('interface_language_desc')}
                  </p>
                  <select
                    value={language}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      setLanguage(newLang);
                      setCurrentLang(newLang as Language);
                      handleSaveGeneral('language', newLang);
                      window.dispatchEvent(new Event('synap_language_changed'));
                    }}
                    className="w-[260px] h-8 px-2.5 bg-[#141414] border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs"
                  >
                    <option value="pt-BR">{t('lang_pt')}</option>
                    <option value="en-US">{t('lang_en')}</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <label className="text-xs font-semibold text-white block mb-1">
                    {t('on_open_workspace')}
                  </label>
                  <p className="text-xs text-zinc-400 mb-2">
                    {t('on_open_workspace_desc')}
                  </p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-white cursor-pointer">
                      <input
                        type="radio"
                        name="startupBehavior"
                        value="last_note"
                        checked={startupBehavior === 'last_note'}
                        onChange={(e) => {
                          setStartupBehavior(e.target.value);
                          handleSaveGeneral('startupBehavior', e.target.value);
                        }}
                      />
                      {t('reopen_last_note')}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-white cursor-pointer">
                      <input
                        type="radio"
                        name="startupBehavior"
                        value="empty"
                        checked={startupBehavior === 'empty'}
                        onChange={(e) => {
                          setStartupBehavior(e.target.value);
                          handleSaveGeneral('startupBehavior', e.target.value);
                        }}
                      />
                      {t('open_empty_screen')}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Appearance Settings */}
            {activeTab === 'appearance' && (
              <div className="flex flex-col gap-5 max-w-[520px]">
                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    Tema Visual
                  </label>
                  <p className="text-xs text-zinc-400 mb-2">
                    Alterne entre modo escuro (Dark Vercel) ou modo claro.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { id: 'dark', label: 'Escuro (Dark)', icon: 'moon' },
                      { id: 'light', label: 'Claro (Light)', icon: 'sun' },
                      { id: 'system', label: 'Sistema (Auto)', icon: 'monitor' },
                    ].map((tItem) => (
                      <button
                        key={tItem.id}
                        type="button"
                        onClick={() => {
                          setTheme(tItem.id as any);
                          handleSaveGeneral('theme', tItem.id);
                        }}
                        className={`h-8 px-3.5 text-xs font-semibold rounded-none inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          theme === tItem.id
                            ? 'bg-white text-black font-bold'
                            : 'bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white'
                        }`}
                      >
                        {tItem.icon === 'moon' && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                          </svg>
                        )}
                        {tItem.icon === 'sun' && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="4"/>
                            <path d="M12 2v2"/>
                            <path d="M12 20v2"/>
                            <path d="m4.93 4.93 1.41 1.41"/>
                            <path d="m17.66 17.66 1.41 1.41"/>
                            <path d="M2 12h2"/>
                            <path d="M20 12h2"/>
                            <path d="m6.34 17.66-1.41 1.41"/>
                            <path d="m19.07 4.93-1.41 1.41"/>
                          </svg>
                        )}
                        {tItem.icon === 'monitor' && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="14" x="2" y="3" rx="0"/>
                            <line x1="8" x2="16" y1="21" y2="21"/>
                            <line x1="12" x2="12" y1="17" y2="21"/>
                          </svg>
                        )}
                        <span>{tItem.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <label className="text-xs font-semibold text-white block mb-1">
                    Tamanho da Fonte do Editor
                  </label>
                  <select
                    value={fontSize}
                    onChange={(e) => {
                      setFontSize(e.target.value);
                      handleSaveGeneral('editorFontSize', e.target.value);
                    }}
                    className="w-[200px] h-8 px-2.5 bg-[#141414] border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs"
                  >
                    <option value="13px">13px - Compacto</option>
                    <option value="14px">14px - Padrão</option>
                    <option value="15px">15px - Médio</option>
                    <option value="16px">16px - Amplo</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <label className="text-xs font-semibold text-white block mb-1">
                    Família da Fonte
                  </label>
                  <select
                    value={fontFamily}
                    onChange={(e) => {
                      setFontFamily(e.target.value);
                      handleSaveGeneral('editorFontFamily', e.target.value);
                    }}
                    className="w-[240px] h-8 px-2.5 bg-[#141414] border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs"
                  >
                    <option value="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">Fonte do Sistema (Padrão do SO)</option>
                    <option value="Geist Sans">Geist Sans (Vercel Style)</option>
                    <option value="Inter">Inter</option>
                    <option value="Segoe UI">Segoe UI</option>
                    <option value="Fira Code">Fira Code (Monospace)</option>
                  </select>
                </div>
              </div>
            )}

            {/* 4. Editor Settings */}
            {activeTab === 'editor' && (
              <div className="flex flex-col gap-4 max-w-[520px]">
                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    Largura Máxima do Documento
                  </label>
                  <p className="text-xs text-zinc-400 mb-2">
                    Escolha o limite horizontal do texto para leitura confortável.
                  </p>
                  <select
                    value={editorWidth}
                    onChange={(e) => {
                      setEditorWidth(e.target.value);
                      handleSaveGeneral('editorWidth', e.target.value);
                    }}
                    className="w-[220px] h-8 px-2.5 bg-[#141414] border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs"
                  >
                    <option value="720px">720px - Focado / Livro</option>
                    <option value="800px">800px - Padrão Tesseract</option>
                    <option value="960px">960px - Amplo</option>
                    <option value="100%">100% - Largura Total</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <label className="text-xs font-semibold text-white block mb-2">
                    Comportamentos & Automações
                  </label>
                  <div className="flex flex-col gap-2.5">
                    <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={slashMenuEnabled}
                        onChange={(e) => {
                          setSlashMenuEnabled(e.target.checked);
                          handleSaveGeneral('slashMenuEnabled', e.target.checked);
                        }}
                      />
                      Habilitar menu suspenso de comandos ao digitar "/"
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wikilinksEnabled}
                        onChange={(e) => {
                          setWikilinksEnabled(e.target.checked);
                          handleSaveGeneral('wikilinksEnabled', e.target.checked);
                        }}
                      />
                      Habilitar links de notas bidirecionais ao digitar "[["
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Shortcuts Settings */}
            {activeTab === 'shortcuts' && (
              <div className="flex flex-col gap-3.5 h-full">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Pesquisar atalho ou ação..."
                    value={shortcutSearch}
                    onChange={(e) => setShortcutSearch(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 bg-white/5 border border-white/10 focus:border-white/30 text-white rounded-none outline-none text-xs"
                  />
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="absolute left-2.5 top-2 text-zinc-500"
                  >
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>

                <div className="flex-1 overflow-y-auto border border-white/10 rounded-none custom-scrollbar">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th className="p-2.5 font-semibold text-zinc-400">Comando</th>
                        <th className="p-2.5 font-semibold text-zinc-400">Atalho</th>
                        <th className="p-2.5 font-semibold text-zinc-400">Categoria</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShortcuts.map((s, idx) => (
                        <tr key={idx} className="border-b border-white/10 hover:bg-white/[0.02]">
                          <td className="p-2.5 text-zinc-200">{s.desc}</td>
                          <td className="p-2.5">
                            <kbd className="bg-white/5 border border-white/10 rounded-none px-2 py-0.5 text-[11px] font-mono text-white">
                              {s.key}
                            </kbd>
                          </td>
                          <td className="p-2.5 text-zinc-500 font-mono text-[11px]">{s.category}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. Backup & Storage Settings */}
            {activeTab === 'backup' && (
              <div className="flex flex-col gap-5 max-w-[520px]">
                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    {t('export_md_title')}
                  </label>
                  <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                    {t('export_md_desc')}
                  </p>
                  <button
                    type="button"
                    onClick={handleExportMarkdown}
                    disabled={exporting || notas.length === 0}
                    className="h-8 px-4 text-xs font-bold rounded-none bg-white text-black hover:bg-zinc-200 shadow-xs inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <span>{exporting ? t('exporting_btn') : t('export_btn')}</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <label className="text-xs font-semibold text-white block mb-2">
                    {t('workspace_stats')}
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 bg-white/5 border border-white/10 rounded-none">
                      <div className="text-[11px] text-zinc-500">{t('total_notes')}</div>
                      <div className="text-lg font-bold text-white mt-0.5">
                        {notas.filter((n) => n.tipo !== 'desenho').length}
                      </div>
                    </div>
                    <div className="p-3 bg-white/5 border border-white/10 rounded-none">
                      <div className="text-[11px] text-zinc-500">{t('drawings_count')}</div>
                      <div className="text-lg font-bold text-white mt-0.5">
                        {notas.filter((n) => n.tipo === 'desenho').length}
                      </div>
                    </div>
                    <div className="p-3 bg-white/5 border border-white/10 rounded-none">
                      <div className="text-[11px] text-zinc-500">Workspace ID</div>
                      <div className="text-[11px] font-mono text-zinc-400 mt-1 truncate">
                        {workspace?.id?.slice(0, 10)}...
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Danger Zone: Delete Workspaces */}
            {activeTab === 'danger' && (
              <div className="flex flex-col gap-4 max-w-[560px]">
                {dangerMsg && (
                  <div
                    className={`p-2.5 rounded-none text-xs ${
                      dangerMsg.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {dangerMsg.text}
                  </div>
                )}

                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-none">
                  <div className="flex items-center gap-2 text-red-400 font-semibold text-xs mb-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span>{t('delete_workspace_title')}</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed m-0">
                    {t('delete_workspace_desc')}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white block mb-2">
                    Workspaces Registradas
                  </label>

                  {loadingWorkspaces ? (
                    <div className="p-6 text-center text-zinc-500 text-xs">
                      Carregando workspaces...
                    </div>
                  ) : allWorkspaces.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 text-xs">
                      {t('no_workspaces_to_delete')}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {allWorkspaces.map((ws) => {
                        const isCurrent = ws.id === workspace?.id;

                        return (
                          <div
                            key={ws.id}
                            className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-none"
                          >
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-white">
                                  {ws.nome || 'Workspace sem nome'}
                                </span>
                                {isCurrent && (
                                  <span className="text-[10px] text-zinc-400 border border-white/20 px-1.5 py-0.5 rounded-none font-mono">
                                    Atual
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-zinc-500 font-mono">
                                ID: {ws.id}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setWorkspaceToDelete(ws)}
                              disabled={deletingWorkspaceId === ws.id}
                              className="h-7 px-2.5 text-xs font-semibold rounded-none bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              </svg>
                              <span>{t('delete_workspace_btn')}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Danger Zone Delete Confirmation Modal */}
      {workspaceToDelete && (
        <div
          className="fixed inset-0 z-[3000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setWorkspaceToDelete(null);
          }}
        >
          <div
            className="bg-[#181818] border border-red-500/30 rounded-none shadow-2xl w-full max-w-[420px] p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-none bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">
                  Excluir Workspace Definitivamente?
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {t('delete_workspace_confirm')}{' '}
                  <strong className="text-white">"{workspaceToDelete.nome}"</strong>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-none flex items-start gap-2.5 text-xs text-red-400 leading-relaxed">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Esta ação apagará permanentemente todas as pastas, notas, flashcards e desenhos dentro deste workspace e não poderá ser desfeita.</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setWorkspaceToDelete(null)}
                className="h-8 px-3.5 text-xs font-semibold rounded-none bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteWorkspace(workspaceToDelete)}
                disabled={deletingWorkspaceId === workspaceToDelete.id}
                className="h-8 px-4 text-xs font-bold rounded-none bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {deletingWorkspaceId === workspaceToDelete.id ? 'Excluindo...' : 'Sim, Excluir Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Image Cropper Modal for Avatar */}
      {cropperImage && (
        <ImageCropperModal
          isOpen={!!cropperImage}
          imageSrc={cropperImage}
          cropShape="square"
          title="Recortar Foto de Perfil"
          onConfirm={handleCroppedAvatarConfirm}
          onClose={() => setCropperImage(null)}
        />
      )}
    </div>
  );
}
