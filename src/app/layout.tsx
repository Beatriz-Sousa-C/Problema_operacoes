import type { Metadata } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fila de exceções · Gocase e GoBeauté",
  description: "Priorização de pedidos com exceção por custo de esperar, causas de processo e agente de IA que decide a tratativa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
