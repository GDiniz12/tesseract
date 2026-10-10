'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import CreateWorkspaceModal from '@/components/CreateWorkspaceModal';
import SettingsModal from '@/components/SettingsModal';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import LoadingScreen from '@/components/LoadingScreen';
import TesseractLogo from '@/components/TesseractLogo';
import WorkspaceIcon from '@/components/WorkspaceIcon';
import ToastContainer, { ToastMessage } from '@/components/Toast';

export default function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const router = useRouter();

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'error') => {
    const toastId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { id: toastId, message, type }]);
  };

  const dismissToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  const loadInitialData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [userData, workspacesData] = await Promise.all([
        api('/auth/me'),
        api('/workspaces'),
      ]);
      setCurrentUser(userData);
      setWorkspaces(workspacesData || []);
    } catch (err: any) {
      if (
        err.message === 'Token is invalid' ||
        err.message === 'Token is missing' ||
        err.message === 'User no longer exists' ||
        err.message === 'Session expired or revoked'
      ) {
        router.push('/login');
        return;
      }
      console.error('Failed to load initial dashboard data', err);
      setError('Não foi possível carregar as informações do dashboard.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [router]);

  const handleWorkspaceCreated = (newWs: any) => {
    setWorkspaces((prev) => [...prev, newWs]);
    try {
      localStorage.setItem('synap_last_workspace_id', newWs.id);
    } catch {}
    router.push(`/main/${newWs.id}`);
  };

  const handleOpenWorkspace = (wsId: string) => {
    try {
      localStorage.setItem('synap_last_workspace_id', wsId);
    } catch {}
    router.push(`/main/${wsId}`);
  };

  const rawRealName = currentUser?.name || currentUser?.nome || '';
  const rawUsername = currentUser?.username || 'usuario';
  const displayUsername = rawUsername.replace(/^@/, '');
  const displayFirstName = (rawRealName || displayUsername || 'Usuário').trim().split(' ')[0];

  if (isLoading) {
    return <LoadingScreen onRetry={loadInitialData} />;
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#141414] text-white font-sansation select-none">
      {/* MINIMAL HEADER */}
      <header className="h-14 min-h-[56px] px-6 sm:px-10 border-b border-white/10 bg-[#141414] flex items-center justify-between z-30 shrink-0 sticky top-0 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5 text-white hover:opacity-80 transition-opacity">
            <TesseractLogo size={24} priority />
            <span className="text-sm font-bold tracking-tight font-sansation uppercase">
              Tesseract
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="h-8 px-3.5 text-xs font-bold rounded-none bg-white text-black hover:bg-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Novo Workspace</span>
          </button>

          {/* User profile dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="h-8 px-2.5 rounded-none bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <div className="w-5 h-5 rounded-none bg-white/10 text-white font-bold text-[10px] flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                {currentUser?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentUser.avatarUrl}
                    alt={displayUsername}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-mono">{displayFirstName[0]?.toUpperCase() || 'U'}</span>
                )}
              </div>
              <span className="text-xs font-semibold text-zinc-300 max-w-[100px] truncate hidden sm:inline">
                {displayUsername}
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`text-zinc-500 transition-transform ${isUserMenuOpen ? 'rotate-180 text-white' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isUserMenuOpen && (
              <div
                className="absolute right-0 top-10 w-48 bg-[#181818] border border-white/10 shadow-2xl rounded-none p-1 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5"
                onMouseLeave={() => setIsUserMenuOpen(false)}
              >
                <div className="px-2.5 py-1.5 border-b border-white/10 mb-1">
                  <span className="text-xs font-bold text-white block truncate">
                    {rawRealName || displayUsername}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono block truncate">
                    {currentUser?.email || `@${displayUsername}`}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsSettingsOpen(true);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-left text-zinc-300 hover:text-white hover:bg-white/5 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Configurações</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsLogoutConfirmOpen(true);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-left text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Sair da Conta</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* WORKSPACES ONLY BODY */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 sm:px-10 py-8 flex flex-col gap-6 overflow-y-auto">
        {error && (
          <div className="p-3.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-none font-sansation">
            {error}
          </div>
        )}

        <div className="flex items-center justify-start">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
            WORKSPACES
          </h2>
        </div>

        {workspaces.length === 0 ? (
          <div className="p-12 text-center rounded-none border border-dashed border-white/10 bg-white/5 flex flex-col items-center gap-3 my-auto">
            <div className="w-12 h-12 rounded-none bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 mb-1">
              <TesseractLogo size={32} />
            </div>
            <h3 className="text-sm font-bold text-white">Nenhum workspace encontrado</h3>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
              Crie seu primeiro espaço de trabalho para começar.
            </p>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="h-8 px-4 text-xs font-bold rounded-none bg-white text-black hover:bg-zinc-200 transition-colors mt-2 cursor-pointer"
            >
              Criar Primeiro Workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => handleOpenWorkspace(ws.id)}
                className="group p-5 rounded-none border border-white/10 bg-[#181818] hover:border-white/30 transition-all duration-150 flex flex-col justify-between cursor-pointer relative min-h-[160px]"
              >
                <div>
                  {/* Top Row: Icon */}
                  <div className="flex items-start">
                    <div className="w-10 h-10 rounded-none bg-white/5 border border-white/10 text-white flex items-center justify-center font-bold text-sm overflow-hidden shrink-0 group-hover:border-white/20 transition-colors">
                      <WorkspaceIcon
                        icone={ws.icone}
                        nome={ws.nome}
                        size={20}
                        className="w-full h-full"
                        emojiClassName="text-lg"
                        fallbackClassName="text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* Middle Row: Name */}
                  <h3 className="text-sm font-bold text-white group-hover:text-zinc-200 transition-colors truncate mt-4 font-sansation">
                    {ws.nome}
                  </h3>
                </div>

                {/* Bottom Row: Enter Workspace Link */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/5 text-xs text-zinc-400 group-hover:text-white transition-colors font-medium">
                  <span>Acessar</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="group-hover:translate-x-1 transition-transform"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onWorkspaceCreated={handleWorkspaceCreated}
        showToast={showToast}
      />

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          currentUser={currentUser}
          workspace={null}
          notas={[]}
          onUpdateUser={(updated) => setCurrentUser(updated)}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Logout Confirmation Modal */}
      {isLogoutConfirmOpen && (
        <LogoutConfirmModal
          onConfirm={async () => {
            try {
              await api('/auth/logout', { method: 'POST' });
              setIsLogoutConfirmOpen(false);
              router.push('/login');
            } catch (error) {
              console.error('Logout failed', error);
              showToast('Não foi possível encerrar a sessão. Tente novamente.');
            }
          }}
          onClose={() => setIsLogoutConfirmOpen(false)}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
