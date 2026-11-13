"use client";
import { useMemo, useRef, useState } from "react";
import type { ResultadoSimulacao } from "@/core";
import { brl, dataBr } from "./formato";

/** Cor segue a estratégia (nunca a posição): paleta categórica validada, 3 primeiros slots. */
export const COR_ESTRATEGIA: Record<string, string> = {
  custo_de_esperar: "var(--serie-1)",
  ordem_de_chegada: "var(--serie-2)",
  exposicao: "var(--serie-3)",
};

interface Props {
  simulacao: ResultadoSimulacao;
  dias: string[];
}

const ALTURA = 300;
const MARGEM = { topo: 16, direita: 132, base: 34, esquerda: 64 };
const LARGURA = 760;

export function GraficoPerda({ simulacao, dias }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const series = simulacao.estrategias;

  const { x, y, ticksY, maxY } = useMemo(() => {
    const maxBruto = Math.max(...series.flatMap((s) => s.perdaAcumuladaPorDia));
    const passo = maxBruto > 100_000 ? 25_000 : maxBruto > 40_000 ? 10_000 : 5_000;
    const maxY = Math.ceil(maxBruto / passo) * passo;
    const largura = LARGURA - MARGEM.esquerda - MARGEM.direita;
    const altura = ALTURA - MARGEM.topo - MARGEM.base;
    return {
      maxY,
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
    for (let i = 1; i < itens.length; i++) if (itens[i].yy - itens[i - 1].yy < 38) itens[i].yy = itens[i - 1].yy + 38;
    return itens;
  }, [series, y]);

  return (
    <figure className="grafico">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Perda esperada acumulada por dia útil de tratamento, por estratégia"
        onPointerMove={aoMover}
        onPointerLeave={() => setHover(null)}
      >
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
            <text key={d} className="grafico__eixo" x={x(i)} y={ALTURA - 10} textAnchor="middle">
              {dataBr(d)}
            </text>
          ) : null,
        )}
        <line
          className="grafico__referencia"
          x1={MARGEM.esquerda}
          x2={LARGURA - MARGEM.direita}
          y1={y(simulacao.perdaInevitavel)}
          y2={y(simulacao.perdaInevitavel)}
        />
        <text className="grafico__eixo" x={MARGEM.esquerda + 4} y={y(simulacao.perdaInevitavel) - 6}>
          Perda já contratada pelo atraso de hoje: {brl(simulacao.perdaInevitavel)}
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
              {s.estrategia === "custo_de_esperar" ? "solução" : s.estrategia === "ordem_de_chegada" ? "como é hoje" : "maior perda hoje"}
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
          <strong>Até {dataBr(dias[hover])}</strong>
          {[...series]
            .sort((a, b) => b.perdaAcumuladaPorDia[hover] - a.perdaAcumuladaPorDia[hover])
            .map((s) => (
              <span key={s.estrategia}>
                <i style={{ background: COR_ESTRATEGIA[s.estrategia] }} />
                {s.nome}: {brl(s.perdaAcumuladaPorDia[hover])}
              </span>
            ))}
        </div>
      )}
      <figcaption className="legenda">
        {series.map((s) => (
          <span key={s.estrategia}>
            <i style={{ background: COR_ESTRATEGIA[s.estrategia] }} />
            {s.nome}
          </span>
        ))}
        <span className="legenda__nota">Eixo: perda esperada acumulada (R$) até cada dia útil. Máx. {brl(maxY)}.</span>
      </figcaption>
    </figure>
  );
}
