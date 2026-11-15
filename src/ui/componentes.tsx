/** Peças pequenas e repetidas da interface: ícones, badges, indicadores, cabeçalhos. */
import type { ReactNode } from "react";

const CAMINHOS = {
  resumo: "M3 3v18h18M7 14l4-4 4 3 5-6",
  hoje: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  fila: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  causas: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  simulador: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  metodo: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
  comparar: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  agente: "M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z",
  check: "M20 6 9 17l-5-5",
  fechar: "M18 6 6 18M6 6l12 12",
  info: "M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
  alerta: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  seta: "M5 12h14m-6-6 6 6-6 6",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
} as const;
export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, className }: { nome: NomeIcone; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}

export type TomBadge = "agente" | "regras" | "ok" | "atencao" | "critico" | "neutro" | "lima";

export function Badge({ tom = "neutro", icone, children, title }: { tom?: TomBadge; icone?: NomeIcone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tom}`} title={title}>
      {icone && <Icone nome={icone} />}
      {children}
    </span>
  );
}

/** Quem decidiu: o agente de IA ou a política padrão (quando a IA não respondeu). */
export function BadgeFonte({ fonte, aviso }: { fonte: "agente" | "regras"; aviso?: string }) {
  return fonte === "agente" ? (
    <Badge tom="agente" icone="agente">Decidido pelo agente</Badge>
  ) : (
    <Badge tom="regras" title={aviso}>Política padrão{aviso ? " · IA não respondeu" : ""}</Badge>
  );
}

export function Kpi({ rotulo, valor, detalhe, tom, grande }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "marca" | "ok" | "critico"; grande?: boolean }) {
  return (
    <div className={`kpi${grande ? " kpi--grande" : ""}`}>
      <span className="kpi__rotulo">{rotulo}</span>
      <span className={`kpi__valor${tom ? ` kpi__valor--${tom}` : ""}`}>{valor}</span>
      {detalhe && <span className="kpi__detalhe">{detalhe}</span>}
    </div>
  );
}

export function Cabecalho({ sobre, titulo, texto, acoes }: { sobre?: string; titulo: ReactNode; texto?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="pagina__cabeca">
      <div>
        {sobre && <p className="pagina__sobre">{sobre}</p>}
        <h1>{titulo}</h1>
        {texto && <p className="pagina__texto">{texto}</p>}
      </div>
      {acoes && <div className="pagina__acoes">{acoes}</div>}
    </header>
  );
}

export function Aviso({ tom, children }: { tom: "info" | "atencao" | "critico" | "ok"; children: ReactNode }) {
  return (
    <div className={`aviso aviso--${tom}`} role={tom === "critico" ? "alert" : "status"}>
      <Icone nome={tom === "info" ? "info" : tom === "ok" ? "check" : "alerta"} />
      <div>{children}</div>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <p className="vazio">
      <Icone nome="check" />
      {children}
    </p>
  );
}

export function Carregando({ children }: { children: ReactNode }) {
  return (
    <div className="carregando" role="status">
      <span className="carregando__anel" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
