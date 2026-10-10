'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import TesseractLogo from '@/components/TesseractLogo';
import WorkspaceIcon from '@/components/WorkspaceIcon';

interface WorkspacePreview {
  id: string;
  nome: string;
  icone: string | null;
  owner: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  collaboratorCount: number;
  isMember: boolean;
  isOwner: boolean;
}

export default function InvitePage() {
  const params = useParams();
  const code = params?.code as string;
  const router = useRouter();

  const [preview, setPreview] = useState<WorkspacePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    api('/auth/me').then(() => setIsLoggedIn(true)).catch(() => setIsLoggedIn(false));

    if (code) {
      try {
        localStorage.setItem('pending_invite_code', code);
        sessionStorage.setItem('pending_invite_code', code);
      } catch {}

      loadPreview();
    }
  }, [code]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await api(`/workspaces/join-preview/${code}`);
      setPreview(data);
    } catch (err: any) {
      console.error('Erro ao carregar prévia do convite:', err);
      setError(err.message || 'Este convite é inválido ou expirou.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!isLoggedIn) {
      router.push(`/login?inviteCode=${code}`);
      return;
    }

    setIsJoining(true);
    setError('');
    try {
      const result = await api(`/workspaces/join/${code}`, {
        method: 'POST',
      });
      localStorage.removeItem('pending_invite_code');
      sessionStorage.removeItem('pending_invite_code');

      router.push(`/main/${result.id}`);
    } catch (err: any) {
      console.error('Erro ao ingressar no workspace:', err);
      setError(err.message || 'Não foi possível aceitar o convite. Tente novamente.');
      setIsJoining(false);
    }
  };

  return (
    <div className="h-full w-full min-h-screen bg-[#141414] overflow-y-auto overflow-x-hidden relative font-sansation flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[380px] bg-[#181818] border border-white/10 rounded-none shadow-2xl p-6 sm:p-7 flex flex-col items-center text-center relative font-sansation">
        {/* Logo */}
        <Link
          href="/"
          className="inline-flex items-center justify-center transition-transform hover:scale-105 mb-4"
          title="Tesseract"
        >
          <TesseractLogo size={44} priority />
        </Link>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-xs text-zinc-500 font-medium">Verificando convite...</span>
          </div>
        ) : error ? (
          <div className="py-6 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-none bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Convite Indisponível</h2>
              <p className="text-xs text-zinc-400 mt-1.5 max-w-[280px]">
                {error}
              </p>
            </div>
            <Link
              href="/dashboard"
              className="mt-2 h-9 px-4 text-xs font-semibold rounded-none bg-white/5 hover:bg-white/10 border border-white/10 text-white inline-flex items-center justify-center transition-colors"
            >
              Ir para meus workspaces
            </Link>
          </div>
        ) : preview ? (
          <div className="w-full flex flex-col items-center">
            {/* Workspace Avatar */}
            <div className="w-14 h-14 rounded-none bg-zinc-800 border border-white/10 flex items-center justify-center text-xl font-bold text-white mb-3 overflow-hidden">
              <WorkspaceIcon
                icone={preview.icone}
                nome={preview.nome}
                size={32}
                className="w-full h-full"
                emojiClassName="text-xl"
                fallbackClassName="text-sm"
              />
            </div>

            {/* Title and details */}
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              Convite para Workspace
            </span>
            <h1 className="text-lg font-bold text-white tracking-tight mt-1 mb-1 truncate max-w-[320px]">
              {preview.nome}
            </h1>

            {preview.owner && (
              <p className="text-xs text-zinc-400 mb-5">
                Criado por{' '}
                <span className="text-white font-medium">
                  {preview.owner.name || (preview.owner.username ? `@${preview.owner.username}` : 'Usuário')}
                </span>
                {preview.collaboratorCount > 0 && (
                  <span className="text-zinc-500"> • {preview.collaboratorCount} {preview.collaboratorCount === 1 ? 'colaborador' : 'colaboradores'}</span>
                )}
              </p>
            )}

            {/* Action block */}
            {isLoggedIn ? (
              <div className="w-full flex flex-col gap-2.5">
                {preview.isMember ? (
                  <>
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-none text-xs text-emerald-400 font-medium text-center">
                      Você já tem acesso a este workspace.
                    </div>
                    <button
                      onClick={() => router.push(`/main/${preview.id}`)}
                      className="w-full h-9 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded-none transition-colors cursor-pointer"
                    >
                      Acessar Workspace
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleJoin}
                      disabled={isJoining}
                      className="w-full h-9 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded-none transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isJoining ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                          <span>Entrando...</span>
                        </>
                      ) : (
                        <span>Entrar no Workspace</span>
                      )}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="w-full flex flex-col gap-2.5">
                <p className="text-xs text-zinc-400 mb-2">
                  Faça login ou crie uma conta para aceitar o convite e colaborar em tempo real.
                </p>

                <Link
                  href={`/login?inviteCode=${code}`}
                  className="w-full h-9 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded-none transition-colors flex items-center justify-center"
                >
                  Entrar com conta existente
                </Link>

                <Link
                  href={`/register?inviteCode=${code}`}
                  className="w-full h-9 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-xs rounded-none transition-colors flex items-center justify-center"
                >
                  Criar uma nova conta
                </Link>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
