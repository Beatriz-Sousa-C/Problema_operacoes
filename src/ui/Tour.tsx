"use client";
/** Tour da primeira visita: os três passos para avaliar a solução em poucos minutos. */
import { useEffect, useRef } from "react";
import { Badge, Icone } from "./componentes";
import { dataHora } from "./formato";
import type { AtividadeAgente } from "./tratativas";

export const CHAVE_TOUR = "tour|v1";

export function tourJaVisto(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_TOUR) === "1";
  } catch {
    return true; // sem armazenamento, não insiste
  }
}

export function marcarTourVisto() {
  try {
    window.localStorage.setItem(CHAVE_TOUR, "1");
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

const PASSOS = [
  {
    aba: "resumo",
    titulo: "Visão geral",
    texto: "Quanto a fila perde hoje, quanto a ordem certa recupera e o briefing do dia escrito pelo agente, pronto para copiar.",
  },
  {
    aba: "hoje",
    titulo: "Trabalho de hoje",
    texto: "O agente já decidiu cada grupo, abriu os chamados e escreveu as mensagens. Aprove um grupo que ele recomendou, abra um pedido para ver a investigação e exporte o lote para quem executa.",
  },
  {
    aba: "comparar",
    titulo: "Ontem × hoje",
    texto: "Simule a lista de amanhã e veja previsto × realizado: quanto do que a fila priorizou de fato saiu, o que é novo e se as causas pioraram.",
  },
];

interface Props {
  atividade: AtividadeAgente;
  irPara: (aba: string) => void;
  aoFechar: () => void;
}

export function Tour({ atividade: at, irPara, aoFechar }: Props) {
  const principalRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    principalRef.current?.focus();
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = anterior;
    };
  }, [aoFechar]);

  return (
    <>
      <div className="gaveta__fundo" onClick={aoFechar} aria-hidden="true" />
      <section className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-titulo">
        <div className="cartao__cabeca">
          <div>
            <Badge tom="lima" icone="agente">
              Como avaliar em 3 minutos
            </Badge>
            <h2 id="tour-titulo" style={{ marginTop: 10 }}>
              Uma fila de exceções com um agente de IA trabalhando dentro dela
            </h2>
            <p>
              O agente decide a tratativa de cada grupo, investiga os casos sensíveis, abre chamados e escreve mensagens, planos de correção e o briefing. A pessoa aprova o
              que envolve dinheiro. Três lugares mostram isso:
            </p>
          </div>
          <button className="gaveta__fechar" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>
        <ol className="tour__passos">
          {PASSOS.map((p, i) => (
            <li key={p.aba}>
              <span className="passo__numero">{i + 1}</span>
              <div>
                <button className="link-linha" onClick={() => irPara(p.aba)}>
                  {p.titulo}
                </button>
                <p className="suave">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="meta">
          {at.ligado
            ? `O agente roda no servidor${at.modelo ? ` (${at.modelo})` : ""}; o plano deste dia foi gerado por ele${at.geradoEm ? ` em ${dataHora(at.geradoEm)}` : ""}. As investigações ao vivo rodam na hora.`
            : "O agente está desligado nesta instalação: valem as regras padrão da política, e a tela avisa onde ele entraria."}
        </p>
        <div className="botoes">
          <button ref={principalRef} className="botao" onClick={() => irPara("resumo")}>
            Começar pela Visão geral
          </button>
          <button className="botao-texto botao-texto--mudo" onClick={aoFechar}>
            Explorar por conta própria
          </button>
        </div>
      </section>
    </>
  );
}
