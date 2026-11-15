"use client";
/**
 * Página de erro global, no lugar da genérica do Next. Não usa nada do layout
 * (ele não está na árvore quando ela renderiza), só estilos inline.
 */
export default function ErroGlobal({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f3f5f9", color: "#0f172a", margin: 0, display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <main style={{ background: "#fff", border: "1px solid #e3e8ef", borderRadius: 12, padding: "28px 32px", maxWidth: 480, display: "grid", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Algo deu errado nesta página</h1>
          <p style={{ margin: 0, color: "#475569" }}>Os dados e as decisões registradas não foram perdidos. Tente recarregar.</p>
          <button
            onClick={reset}
            style={{ justifySelf: "start", background: "#2155b5", color: "#fff", border: 0, borderRadius: 8, padding: "9px 16px", fontWeight: 600, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
