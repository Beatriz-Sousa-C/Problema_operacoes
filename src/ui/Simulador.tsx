"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { analisar, PARAMETROS, simular, type BaseDados } from "@/core";
import { GraficoPerda } from "./GraficoPerda";
import { brl, num, pct } from "./formato";

export function Simulador({ base }: { base: BaseDados }) {
  const [capacidade, setCapacidade] = useState(PARAMETROS.capacidadeDiaria);
  const adiada = useDeferredValue(capacidade);
  const { analise, sim } = useMemo(() => {
    const analise = analisar(base, { ...PARAMETROS, capacidadeDiaria: adiada });
    return { analise, sim: simular(analise) };
  }, [base, adiada]);
  // Quanta capacidade a ordem de chegada precisaria para empatar com a solução a 150/dia?
  const equivalente = useMemo(() => {
    const perda = (cap: number, est: string) =>
      simular(analisar(base, { ...PARAMETROS, capacidadeDiaria: cap })).estrategias.find((s) => s.estrategia === est)!.perdaEsperada;
    const alvo = perda(PARAMETROS.capacidadeDiaria, "custo_de_esperar");
    // Busca binária: a perda da ordem de chegada só cai quando a capacidade sobe.
    let [lo, hi] = [PARAMETROS.capacidadeDiaria, 1000];
    if (perda(hi, "ordem_de_chegada") > alvo) return { cap: null, alvo };
    while (hi - lo > 10) {
      const meio = Math.round((lo + hi) / 20) * 10;
      if (perda(meio, "ordem_de_chegada") <= alvo) hi = meio;
      else lo = meio;
    }
    return { cap: hi, alvo };
  }, [base]);
  const atual = sim.estrategias.find((s) => s.estrategia === "ordem_de_chegada")!;
  const solucao = sim.estrategias.find((s) => s.estrategia === "custo_de_esperar")!;

  return (
    <div className="simulador">
      <h1 className="titulo-largo titulo-largo--menor">E se o time tivesse outra capacidade?</h1>
      <p className="secao__intro">
        Mude a capacidade diária e veja a fila inteira ser recalculada no seu navegador. Ajuda a decidir se vale reforçar o time ou só mudar a ordem.
      </p>
      <label className="controle">
        <span>
          Tratativas por dia: <strong>{num(capacidade)}</strong> ({num((capacidade * PARAMETROS.minutosPorTratativa) / 60)} horas de trabalho)
        </span>
        <input type="range" min={50} max={400} step={10} value={capacidade} onChange={(e) => setCapacidade(Number(e.target.value))} />
      </label>
      <dl className="simulador__numeros">
        <div><dt>Dias úteis para zerar</dt><dd>{analise.horizonteDias}</dd></div>
        <div><dt>Perda pela ordem de chegada</dt><dd>{brl(atual.perdaEsperada)}</dd></div>
        <div><dt>Perda com a solução</dt><dd>{brl(solucao.perdaEsperada)}</dd></div>
        <div><dt>Recuperado</dt><dd>{brl(sim.recuperadoVsAtual)} ({pct(sim.eficiencia)} do possível)</dd></div>
      </dl>
      <GraficoPerda simulacao={sim} dias={analise.diasDeTratamento} />
      <p className="simulador__conclusao">
        Com {num(PARAMETROS.capacidadeDiaria)} tratativas por dia e a fila priorizada, a perda é de {brl(equivalente.alvo)}.{" "}
        {equivalente.cap
          ? `Para chegar ao mesmo resultado tratando por ordem de chegada, o time precisaria de ${num(equivalente.cap)} tratativas por dia: ${pct(equivalente.cap / PARAMETROS.capacidadeDiaria - 1)} mais capacidade de tratamento. Mudar a ordem vale esse reforço de equipe.`
          : "Nem com 1.000 tratativas por dia a ordem de chegada empata com a fila priorizada."}
      </p>
    </div>
  );
}
