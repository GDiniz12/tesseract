'use client';

import { useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import TesseractLogo from '@/components/TesseractLogo';
import LandingTesseractGraph from '@/components/LandingTesseractGraph';

export default function LandingPage() {
  const router = useRouter();

  const scrollToSecondBrain = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const target = document.getElementById('segundo-cerebro');
    if (!target) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      target.scrollIntoView();
      return;
    }

    const start = window.scrollY;
    const destination = target.getBoundingClientRect().top + start - 56;
    const distance = destination - start;
    const duration = 950;
    const startedAt = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      window.scrollTo(0, start + distance * eased);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        window.history.replaceState(null, '', '#segundo-cerebro');
      }
    };

    requestAnimationFrame(animate);
  };

  useEffect(() => {
    const isDesktop = Boolean(window.tesseractDesktop?.isDesktop || window.synapDesktop?.isDesktop);

    api('/auth/me', { retries: isDesktop ? undefined : 0 })
      .then(() => router.replace('/dashboard'))
      .catch(() => {
        if (isDesktop) router.replace('/login');
      });
  }, [router]);

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[var(--background)] text-[var(--foreground)] select-none">
      {/* Top Navigation Bar - Sem linha divisória com o tom de fundo do projeto */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 h-14 bg-[var(--background)]/85 backdrop-blur-md">
        {/* Top Left: Logo & Brand Name */}
        <Link
          href="/"
          aria-label="Tesseract Início"
          className="group flex items-center gap-2.5 transition-opacity duration-150 hover:opacity-85 focus-visible:outline-none"
        >
          <TesseractLogo size={22} />
          <span className="font-semibold text-base tracking-tight text-[var(--foreground)] font-sans">
            Tesseract
          </span>
        </Link>

        {/* Top Right: Sign In Button sem bordas arredondadas */}
        <div className="flex items-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-1.5 text-xs font-medium tracking-wide bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--accents-7)] transition-colors rounded-none focus-visible:outline-none shadow-sm cursor-pointer"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* Main 3D Graph Visualization Area */}
      <section className="relative w-full h-[calc(100vh-3.5rem)] overflow-hidden">
        <LandingTesseractGraph />
        <a
          href="#segundo-cerebro"
          onClick={scrollToSecondBrain}
          aria-label="Ir para a seção Seu Segundo Cérebro"
          className="group absolute bottom-7 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 border border-[var(--accents-3)] bg-[var(--background)]/80 px-4 py-2.5 text-[11px] font-medium tracking-wide text-[var(--accents-6)] backdrop-blur-md transition-colors hover:border-[var(--accents-5)] hover:text-[var(--foreground)] focus-visible:outline-none sm:bottom-9"
        >
          <span>Descobrir</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="transition-transform duration-200 group-hover:translate-y-0.5"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </a>
      </section>

      <section
        id="segundo-cerebro"
        aria-labelledby="second-brain-title"
        className="relative isolate scroll-mt-14 overflow-hidden border-t border-black/10 bg-[#f3f3f1] px-6 py-24 text-[#111113] sm:px-10 sm:py-32 lg:px-16 lg:py-40"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(17,17,19,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,19,0.045) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="mx-auto max-w-[1400px]">
          <h2
            id="second-brain-title"
            className="max-w-6xl text-[clamp(3.7rem,10vw,9.5rem)] font-medium leading-[0.84] tracking-[-0.075em]"
          >
            Seu Segundo
            <span className="block text-black/35">Cérebro.</span>
          </h2>

          <div className="mt-20 border-t border-black/15 sm:mt-28 lg:ml-[28%] lg:mt-36">
            <SecondBrainFeature
              title="Na nuvem"
              description="Seu conhecimento disponível e sincronizado onde você estiver."
              icon="cloud"
            />
            <SecondBrainFeature
              title="Com sistema de revisão"
              description="Revisões inteligentes transformam anotações em memória de longo prazo."
              icon="review"
            />
            <SecondBrainFeature
              title="Com inteligência artificial integrada"
              description="Uma camada de inteligência que conecta, organiza e expande suas ideias."
              icon="ai"
            />
          </div>

          <div className="mt-12 flex justify-end sm:mt-16">
            <Link
              href="/register"
              className="group inline-flex items-center gap-5 bg-[#111113] px-6 py-3.5 text-sm font-medium text-[#f3f3f1] transition-colors hover:bg-black focus-visible:outline-none sm:px-8 sm:py-4"
            >
              Criar minha conta
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      <section
        id="downloads"
        aria-labelledby="downloads-title"
        className="relative overflow-hidden border-t border-white/10 bg-black px-6 py-24 text-[#ededed] sm:px-10 sm:py-32 lg:px-16 lg:py-40"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.16) 0.7px, transparent 0.7px)',
            backgroundSize: '14px 14px',
          }}
        />

        <div className="relative mx-auto max-w-[1400px]">
          <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <h2
              id="downloads-title"
              className="text-[clamp(3.6rem,9vw,8.5rem)] font-medium leading-[0.86] tracking-[-0.07em]"
            >
              Tesseract,
              <span className="block text-white/35">em qualquer lugar.</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-white/50 lg:justify-self-end lg:pb-3">
              Leve suas notas, conexões e revisões para o desktop. Escolha seu sistema e continue de onde parou.
            </p>
          </div>

          <div className="mt-20 border-t border-white/15 sm:mt-28 lg:mt-36">
            <DownloadOption
              href="/api/download?os=windows"
              platform="Windows"
              format="Instalador .exe"
              icon="windows"
            />
            <DownloadOption
              href="/api/download?os=linux"
              platform="Linux"
              format="AppImage ou .deb"
              icon="linux"
            />
            <DownloadOption
              href="/api/download?os=macos"
              platform="macOS"
              format="Apple Silicon e Intel"
              icon="mac"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="transition-transform duration-200 group-hover:translate-x-1"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

interface DownloadOptionProps {
  href: string;
  platform: string;
  format: string;
  icon: 'windows' | 'linux' | 'mac';
}

function DownloadOption({ href, platform, format, icon }: DownloadOptionProps) {
  return (
    <a
      href={href}
      className="group grid grid-cols-[52px_1fr_auto] items-center gap-5 border-b border-white/15 py-7 transition-colors hover:border-white/40 sm:grid-cols-[72px_1fr_0.55fr_32px] sm:gap-7 sm:py-9"
    >
      <span className="flex h-12 w-12 items-center justify-center border border-white/20 text-white/75 transition-colors group-hover:bg-white group-hover:text-black sm:h-14 sm:w-14">
        <PlatformIcon kind={icon} />
      </span>
      <strong className="text-2xl font-medium tracking-[-0.035em] sm:text-3xl lg:text-4xl">
        {platform}
      </strong>
      <span className="hidden text-sm text-white/40 sm:block">{format}</span>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-white/45 transition-transform duration-200 group-hover:translate-x-1 group-hover:translate-y-1 group-hover:text-white"
      >
        <path d="M7 7h10v10M7 17 17 7" />
      </svg>
    </a>
  );
}

function PlatformIcon({ kind }: { kind: DownloadOptionProps['icon'] }) {
  if (kind === 'windows') {
    return (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 4.6 10.3 3.6v7.5H3V4.6Zm8.3-1.15L21 2v9.1h-9.7V3.45ZM3 12.1h7.3v7.55L3 18.6v-6.5Zm8.3 0H21V22l-9.7-1.4v-8.5Z" />
      </svg>
    );
  }

  if (kind === 'linux') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8.5 15.5c-1.3 1.1-2 2.6-2 4.5h11c0-1.9-.7-3.4-2-4.5" />
        <path d="M8.2 13.5C7.4 11.4 8 4 12 4s4.6 7.4 3.8 9.5c-.7 1.8-2 3-3.8 3s-3.1-1.2-3.8-3Z" />
        <path d="M9.5 9.5h.01M14.5 9.5h.01M10 12.5c1.3.7 2.7.7 4 0" />
        <path d="M7 18 4.5 16.5M17 18l2.5-1.5" />
      </svg>
    );
  }

  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15.4 6.5c.8-1 1.3-2.3 1.2-3.5-1.2.1-2.6.9-3.4 1.9-.7.8-1.3 2.1-1.2 3.3 1.3.1 2.6-.7 3.4-1.7Z" />
      <path d="M18.7 12.8c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-1-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.3 2.5 1.3-.1 1.8-.8 3.4-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.2 3.2-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-3.2-1.2-3.2-4Z" />
    </svg>
  );
}

interface SecondBrainFeatureProps {
  title: string;
  description: string;
  icon: 'cloud' | 'review' | 'ai';
}

function SecondBrainFeature({ title, description, icon }: SecondBrainFeatureProps) {
  return (
    <article className="group grid gap-5 border-b border-black/15 py-8 transition-colors duration-200 hover:border-black/35 sm:grid-cols-[64px_minmax(0,1fr)_minmax(220px,0.65fr)] sm:items-center sm:gap-6 sm:py-10">
      <span className="flex h-12 w-12 items-center justify-center border border-black/15 bg-white/45 transition-transform duration-300 group-hover:-translate-y-1">
        <SecondBrainIcon kind={icon} />
      </span>
      <h3 className="text-2xl font-medium leading-tight tracking-[-0.035em] sm:text-3xl lg:text-4xl">
        {title}
      </h3>
      <p className="max-w-sm text-sm leading-relaxed text-black/50 sm:text-[15px]">
        {description}
      </p>
    </article>
  );
}

function SecondBrainIcon({ kind }: { kind: SecondBrainFeatureProps['icon'] }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'cloud' ? (
        <path d="M17.5 19H7a5 5 0 0 1-.7-9.95A7 7 0 0 1 19.8 11.5 3.75 3.75 0 0 1 17.5 19Z" />
      ) : kind === 'review' ? (
        <>
          <path d="M20 7v5h-5" />
          <path d="M4.93 17A8 8 0 1 0 6 5.3L4 7" />
          <path d="M12 8v4l2.5 1.5" />
        </>
      ) : (
        <>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          <path d="m5.64 5.64 2.83 2.83M15.53 15.53l2.83 2.83M18.36 5.64l-2.83 2.83M8.47 15.53l-2.83 2.83" />
          <circle cx="12" cy="12" r="3.5" />
        </>
      )}
    </svg>
  );
}
