"use client";
import { useMemo, useRef, useState } from "react";
import type { Estrategia, ResultadoSimulacao } from "@/core";
import { brl, dataBr, num } from "./formato";

/** Cor segue a estratégia (nunca a posição): paleta categórica validada, 3 primeiros slots. */
export const COR_ESTRATEGIA: Record<string, string> = {
  custo_de_esperar: "var(--serie-1)",
  ordem_de_chegada: "var(--serie-2)",
  exposicao: "var(--serie-3)",
};

/** Nome curto (fim da linha e dica) e explicação em linguagem simples (legenda). */
const LEGENDA: Record<Estrategia, { curto: string; nome: string; como: string }> = {
  custo_de_esperar: {
    curto: "Solução",
    nome: "Solução: quem mais piora esperando vai primeiro",
    como: "Atende primeiro os pedidos cuja chance de cancelar mais sobe se ficarem mais um dia na fila.",
  },
  ordem_de_chegada: {
    curto: "Como é hoje",
    nome: "Como é hoje: ordem de chegada",
    como: "Atende primeiro a exceção aberta há mais tempo, como o time faz hoje.",
  },
  exposicao: {
    curto: "Mais atrasados",
    nome: "Alternativa: maior risco agora primeiro",
    como: "Atende primeiro quem tem a maior perda esperada hoje, em geral os mais atrasados. Esses clientes já estão no risco máximo.",
  },
};

interface Props {
  simulacao: ResultadoSimulacao;
  dias: string[];
  /** Tratativas por dia usadas na simulação (aparece na dica). */
  capacidade: number;
  /** Total de exceções na fila. */
  pedidos: number;
}

const ALTURA = 300;
const MARGEM = { topo: 24, direita: 132, base: 44, esquerda: 56 };
const LARGURA = 760;

export function GraficoPerda({ simulacao, dias, capacidade, pedidos }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const series = simulacao.estrategias;
  const atual = series.find((s) => s.estrategia === "ordem_de_chegada");
  const solucao = series.find((s) => s.estrategia === "custo_de_esperar");

  const { x, y, ticksY } = useMemo(() => {
    const maxBruto = Math.max(...series.flatMap((s) => s.perdaAcumuladaPorDia));
    const passo = maxBruto > 100_000 ? 25_000 : maxBruto > 40_000 ? 10_000 : 5_000;
    const maxY = Math.ceil(maxBruto / passo) * passo;
    const largura = LARGURA - MARGEM.esquerda - MARGEM.direita;
    const altura = ALTURA - MARGEM.topo - MARGEM.base;
    return {
      x: (i: number) => MARGEM.esquerda + (dias.length === 1 ? 0 : (i / (dias.length - 1)) * largura),
      y: (v: number) => MARGEM.topo + altura - (v / maxY) * altura,
      ticksY: Array.from({ length: maxY / passo + 1 }, (_, i) => i * passo),
    };
  }, [series, dias.length]);

  const aoMover = (ev: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * LARGURA;
    const i = Math.round(((px - MARGEM.esquerda) / (LARGURA - MARGEM.esquerda - MARGEM.direita)) * (dias.length - 1));
    setHover(Math.max(0, Math.min(dias.length - 1, i)));
  };

  // Rótulos diretos no fim de cada linha, afastados para não colidirem.
  const rotulos = useMemo(() => {
    const itens = series.map((s) => ({ s, yy: y(s.perdaAcumuladaPorDia.at(-1) ?? 0) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < itens.length; i++) if (itens[i].yy - itens[i - 1].yy < 36) itens[i].yy = itens[i - 1].yy + 36;
    return itens;
  }, [series, y]);

  return (
    <figure className="grafico">
      <div className="grafico__area">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          role="img"
          aria-label="Perda acumulada em reais a cada dia de trabalho na fila, para cada ordem de atendimento"
          onPointerMove={aoMover}
          onPointerLeave={() => setHover(null)}
        >
          <text className="grafico__eixo-titulo" x={MARGEM.esquerda} y={12}>
            R$ perdidos, somados desde o 1º dia
          </text>
          {ticksY.map((t) => (
            <g key={t}>
              <line className="grafico__grade" x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={y(t)} y2={y(t)} />
              <text className="grafico__eixo" x={MARGEM.esquerda - 8} y={y(t) + 4} textAnchor="end">
                {t === 0 ? "0" : `${t / 1000} mil`}
              </text>
            </g>
          ))}
          {dias.map((d, i) =>
            i % 2 === 0 || i === dias.length - 1 ? (
              <text key={d} className="grafico__eixo" x={x(i)} y={ALTURA - 26} textAnchor="middle">
                {dataBr(d)}
              </text>
            ) : null,
          )}
          <text className="grafico__eixo-titulo" x={(MARGEM.esquerda + LARGURA - MARGEM.direita) / 2} y={ALTURA - 6} textAnchor="middle">
            Dias úteis de trabalho até tratar a fila inteira
          </text>
          <line className="grafico__referencia" x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={y(simulacao.perdaInevitavel)} y2={y(simulacao.perdaInevitavel)} />
          <text className="grafico__eixo" x={MARGEM.esquerda + 4} y={y(simulacao.perdaInevitavel) - 6}>
            Piso: {brl(simulacao.perdaInevitavel)} já perdidos pelo atraso até hoje
          </text>
          {series.map((s) => (
            <polyline
              key={s.estrategia}
              fill="none"
              stroke={COR_ESTRATEGIA[s.estrategia]}
              strokeWidth={s.estrategia === "custo_de_esperar" ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.perdaAcumuladaPorDia.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
          ))}
          {rotulos.map(({ s, yy }) => (
            <g key={s.estrategia}>
              <circle cx={x(dias.length - 1)} cy={y(s.perdaAcumuladaPorDia.at(-1) ?? 0)} r={4} fill={COR_ESTRATEGIA[s.estrategia]} stroke="var(--superficie)" strokeWidth={2} />
              <text className="grafico__rotulo" x={LARGURA - MARGEM.direita + 10} y={yy + 4}>
                {brl(s.perdaEsperada)}
              </text>
              <text className="grafico__rotulo-sub" x={LARGURA - MARGEM.direita + 10} y={yy + 18}>
                {LEGENDA[s.estrategia].curto}
              </text>
            </g>
          ))}
          {hover !== null && (
            <g>
              <line className="grafico__mira" x1={x(hover)} x2={x(hover)} y1={MARGEM.topo} y2={ALTURA - MARGEM.base} />
              {series.map((s) => (
                <circle key={s.estrategia} cx={x(hover)} cy={y(s.perdaAcumuladaPorDia[hover])} r={5} fill={COR_ESTRATEGIA[s.estrategia]} stroke="var(--superficie)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={MARGEM.esquerda} y={MARGEM.topo} width={LARGURA - MARGEM.esquerda - MARGEM.direita} height={ALTURA - MARGEM.topo - MARGEM.base} fill="transparent" />
        </svg>
        {hover !== null && (
          <div className="grafico__dica" style={{ left: `${(x(hover) / LARGURA) * 100}%` }} role="status">
            <strong>
              Dia {hover + 1} de {dias.length} ({dataBr(dias[hover])})
            </strong>
            <span className="grafico__dica-sub">
              {num(Math.min((hover + 1) * capacidade, pedidos))} de {num(pedidos)} pedidos tratados. Perda somada:
            </span>
            {[...series]
              .sort((a, b) => b.perdaAcumuladaPorDia[hover] - a.perdaAcumuladaPorDia[hover])
              .map((s) => (
                <span key={s.estrategia}>
                  <i style={{ background: COR_ESTRATEGIA[s.estrategia] }} />
                  {LEGENDA[s.estrategia].curto}: {brl(s.perdaAcumuladaPorDia[hover])}
                </span>
              ))}
          </div>
        )}
      </div>
      <figcaption className="legenda">
        <ul className="legenda__lista">
          {series.map((s) => (
            <li key={s.estrategia}>
              <i style={{ background: COR_ESTRATEGIA[s.estrategia] }} />
              <div>
                <strong>
                  {LEGENDA[s.estrategia].nome} · {brl(s.perdaEsperada)}
                </strong>
                <span>{LEGENDA[s.estrategia].como}</span>
              </div>
            </li>
          ))}
          <li>
            <i className="legenda__tracejado" />
            <div>
              <strong>Linha tracejada: o piso</strong>
              <span>Perda que o atraso acumulado até hoje já causou. Mesmo tratando a fila inteira hoje, ela não volta.</span>
            </div>
          </li>
        </ul>
        {atual && solucao && (
          <p className="legenda__nota">
            A distância entre a linha laranja e a azul no fim, <strong>{brl(atual.perdaEsperada - solucao.perdaEsperada)}</strong>, é o que a solução economiza em
            relação a hoje. Passe o mouse ou o dedo sobre o gráfico para ver cada dia.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
