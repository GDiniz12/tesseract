'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import TesseractLogo from '@/components/TesseractLogo';

function RegisterForm() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const formattedUsername = username.trim().toLowerCase();
  const isUsernameValid = formattedUsername.length >= 3 && /^[a-z0-9_.]+$/.test(formattedUsername);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Informe seu nome de exibição.');
      return;
    }

    if (!formattedUsername) {
      setError('Informe um nome de usuário.');
      return;
    }

    const usernameRegex = /^[a-z0-9_.]+$/;
    if (formattedUsername.length < 3 || formattedUsername.length > 30 || !usernameRegex.test(formattedUsername)) {
      setError('O nome de usuário deve ter entre 3 e 30 caracteres (letras minúsculas, números, pontos e underlines).');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ 
          name: name.trim(), 
          username: formattedUsername, 
          email: email.trim(), 
          password 
        }),
      });

      const inviteCode = searchParams.get('inviteCode') || localStorage.getItem('pending_invite_code') || sessionStorage.getItem('pending_invite_code');

      // Auto-login immediately after successful registration for instant access
      try {
        const loginData = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password }),
        });

        if (loginData?.user) {
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
              console.error('Erro ao auto-ingressar:', joinErr);
            }
          }

          router.push('/dashboard');
          return;
        }
      } catch {
        // Fallback to login page if auto-login fails
      }

      router.push(inviteCode ? `/login?registered=true&inviteCode=${inviteCode}` : '/login?registered=true');
    } catch (err: any) {
      console.error('Erro no cadastro:', err);
      setError(err.message || 'Não foi possível criar a conta. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="w-full max-w-[440px] flex flex-col font-sansation relative my-auto">
      <div className="mb-9">
        <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">Criar uma conta</h1>
        <p className="text-sm text-zinc-400 mt-3">
          Comece a organizar suas notas, conexões e flashcards.
        </p>
      </div>

      {/* Error Alert Box */}
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

      {/* Registration Form */}
      <form onSubmit={handleRegister} className="flex flex-col gap-5">
        {/* E-mail */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-2">
            E-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
            required
            className="w-full h-12 px-4 text-sm bg-white/[0.04] border border-white/10 focus:border-white/40 rounded-none outline-none text-white placeholder-zinc-600 transition-colors font-sansation"
          />
        </div>

        {/* Nome de Exibição */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-2">
            Nome de Exibição
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como quer ser chamado?"
            required
            className="w-full h-12 px-4 text-sm bg-white/[0.04] border border-white/10 focus:border-white/40 rounded-none outline-none text-white placeholder-zinc-600 transition-colors font-sansation"
          />
        </div>

        {/* Nome de Usuário */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-2">
            Nome de Usuário
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-zinc-500 font-mono text-xs select-none pointer-events-none">
              @
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              placeholder="usuario"
              required
              className="w-full h-12 pl-9 pr-11 text-sm bg-white/[0.04] border border-white/10 focus:border-white/40 rounded-none outline-none text-white placeholder-zinc-600 transition-colors font-sansation"
            />
            {isUsernameValid && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute right-3 text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <span className="text-xs text-zinc-500 mt-2 block">
            Apenas letras minúsculas, números, pontos ou underlines.
          </span>
        </div>

        {/* Senha */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-2">
            Senha
          </label>
          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full h-12 pl-4 pr-11 text-sm bg-white/[0.04] border border-white/10 focus:border-white/40 rounded-none outline-none text-white placeholder-zinc-600 transition-colors font-sansation"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
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
          <span className="text-xs text-zinc-500 mt-2 block">
            Mínimo de 6 caracteres.
          </span>
        </div>

        {/* Submit Button */}
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
              <span>Criando sua conta...</span>
            </>
          ) : (
            <span>Continuar</span>
          )}
        </button>
      </form>

      {/* Link to Login */}
      <div className="text-sm text-zinc-400 mt-7">
        Já tem uma conta?{' '}
        <Link 
          href={searchParams.get('inviteCode') ? `/login?inviteCode=${searchParams.get('inviteCode')}` : "/login"} 
          className="text-white font-medium hover:underline underline-offset-4"
        >
          Entrar
        </Link>
      </div>

      {/* Legal Disclaimer */}
      <p className="text-xs text-zinc-500 leading-relaxed mt-5">
        Ao se registrar, você concorda com os Termos de Serviço e a Política de Privacidade do Tesseract.
      </p>
    </section>
  );
}

export default function RegisterPage() {
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
            <RegisterForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
