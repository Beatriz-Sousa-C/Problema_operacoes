import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Central de exceções · Operações",
  description: "Fila de pedidos com exceção priorizada pelo custo de esperar, causas de processo e um agente de IA que decide e prepara as tratativas.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e1d44" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1430" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
