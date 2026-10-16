import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TitleBar from "@/components/TitleBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Tesseract",
  description: "A comprehensive study tool with notes, graph visualization, canvas, and flashcards",
  applicationName: "Tesseract",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tesseract",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/tesseract-icon.svg", type: "image/svg+xml" },
      { url: "/tesseract-logo-256.png", type: "image/png" },
    ],
    apple: [
      { url: "/tesseract-logo-512.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('tesseract_theme') || localStorage.getItem('synap_theme') || 'dark';
                  var isDark = saved === 'dark' || (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  var root = document.documentElement;
                  if (isDark) {
                    root.classList.add('dark');
                    root.classList.remove('light');
                    root.setAttribute('data-theme', 'dark');
                    root.style.colorScheme = 'dark';
                  } else {
                    root.classList.add('light');
                    root.classList.remove('dark');
                    root.setAttribute('data-theme', 'light');
                    root.style.colorScheme = 'light';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sansation h-full w-full overflow-hidden flex flex-col`} suppressHydrationWarning>
        <ThemeProvider>
          <TitleBar />
          <main className="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col font-sansation">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
