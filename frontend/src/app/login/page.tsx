'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import TesseractLogo from '@/components/TesseractLogo';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setSuccess('Conta criada com sucesso! Entre com seus dados para continuar.');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      
      const inviteCode = searchParams.get('inviteCode') || localStorage.getItem('pending_invite_code') || sessionStorage.getItem('pending_invite_code');

      if (inviteCode) {
        try {
          const joinResult = await api(`/workspaces/join/${inviteCode}`, {
            method: 'POST',
          });
          localStorage.removeItem('pending_invite_code');
          sessionStorage.removeItem('pending_invite_code');
          if (joinResult?.id) {
            router.push(`/main/${joinResult.id}`);
            return;
          }
        } catch (joinErr) {
          console.error('Erro ao auto-ingressar no workspace:', joinErr);
        }
      }

      router.push('/dashboard');
    } catch (err: any) {
      console.error('Erro no login:', err);
      const isInvalidCredentials = err.message?.toLowerCase().includes('credential') || 
                                   err.message?.toLowerCase().includes('password') || 
                                   err.message?.toLowerCase().includes('user') || 
                                   err.message?.includes('400') || 
                                   err.message?.includes('401');
      setError(isInvalidCredentials ? 'E-mail ou senha incorretos. Verifique seus dados.' : 'Não foi possível realizar o login. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="w-full max-w-[440px] flex flex-col font-sansation relative my-auto">
      <div className="mb-9">
        <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">Sign In</h1>
      </div>

      {/* Success Message Banner */}
      {success && (
        <div className="p-3 mb-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="leading-tight font-medium">{success}</span>
        </div>
      )}

      {/* Error Message Box */}
      {error && (
        <div className="p-3 mb-5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="leading-tight font-medium">{error}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleLogin} className="flex flex-col gap-5">
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-2">
            E-mail ou nome de usuário
          </label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            required
            className="w-full h-12 px-4 text-sm bg-white/[0.04] border border-white/10 focus:border-white/40 rounded-none outline-none text-white placeholder-zinc-600 transition-colors font-sansation"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-2">
            Senha
          </label>
          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              required
              className="w-full h-12 pl-4 pr-11 text-sm bg-white/[0.04] border border-white/10 focus:border-white/40 rounded-none outline-none text-white placeholder-zinc-600 transition-colors font-sansation"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              title={showPassword ? 'Ocultar senha' : 'Ver senha'}
              aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
            >
              {showPassword ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full h-12 mt-1 bg-white hover:bg-zinc-200 text-black font-semibold rounded-none text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            isSubmitting ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>Entrando...</span>
            </>
          ) : (
            <span>Entrar</span>
          )}
        </button>
      </form>

      {/* Register Link */}
      <div className="text-sm text-zinc-400 mt-7">
        Não tem uma conta?{' '}
        <Link 
          href={searchParams.get('inviteCode') ? `/register?inviteCode=${searchParams.get('inviteCode')}` : "/register"} 
          className="text-white font-medium hover:underline underline-offset-4"
        >
          Cadastre-se
        </Link>
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full bg-[#141414] overflow-y-auto overflow-x-hidden font-sansation">
      <main className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-[1fr_1fr] bg-[#141414]">
        <aside className="hidden lg:flex relative lg:min-h-full overflow-hidden bg-white text-[#111113] p-7 sm:p-10 lg:p-14 flex-col justify-between">
          <Link href="/" className="inline-flex w-fit items-center gap-3 text-[#111113]" title="Voltar ao início">
            <TesseractLogo size={36} className="[--foreground:#111113]" priority />
            <span className="text-lg font-semibold tracking-tight">Tesseract</span>
          </Link>
          <div className="relative z-10 max-w-lg py-12 lg:py-0">
            <h2 className="text-4xl sm:text-5xl xl:text-6xl font-semibold tracking-[-0.045em] leading-[1.04]">
              Ideias conectadas. Conhecimento em movimento.
            </h2>
            <p className="max-w-md text-sm sm:text-base leading-relaxed text-zinc-600 mt-6">
              Reúna notas, projetos e referências em um espaço que acompanha a forma como você pensa.
            </p>
          </div>
          <div aria-hidden="true" />
        </aside>
        <div className="min-h-screen lg:min-h-[560px] px-6 py-12 sm:px-12 lg:px-16 xl:px-24 flex items-center justify-center">
          <Suspense fallback={<div className="text-xs text-zinc-500 font-sansation">Carregando...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
