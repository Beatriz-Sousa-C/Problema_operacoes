"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { analisar, simular, type BaseDados, type Parametros } from "@/core";
import { GraficoPerda } from "./GraficoPerda";
import { Aviso, Cabecalho, Kpi } from "./componentes";
import { brl, num, pct } from "./formato";

/** Recebe os parâmetros da lista em uso (a data de referência é a dela), para a simulação bater com o resto da tela. */
export function Simulador({ base, parametros: PARAMETROS }: { base: BaseDados; parametros: Parametros }) {
  const [capacidade, setCapacidade] = useState(PARAMETROS.capacidadeDiaria);
  const adiada = useDeferredValue(capacidade);
  const { analise, sim } = useMemo(() => {
    const analise = analisar(base, { ...PARAMETROS, capacidadeDiaria: adiada });
    return { analise, sim: simular(analise) };
  }, [base, adiada, PARAMETROS]);
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
  }, [base, PARAMETROS]);
  const atual = sim.estrategias.find((s) => s.estrategia === "ordem_de_chegada")!;
  const solucao = sim.estrategias.find((s) => s.estrategia === "custo_de_esperar")!;
  const horas = (capacidade * PARAMETROS.minutosPorTratativa) / 60;

  return (
    <div className="pagina">
      <Cabecalho
        sobre="Simulador"
        titulo="E se o time tivesse outra capacidade?"
        texto="Mude a capacidade diária e veja a fila inteira ser recalculada no seu navegador. Ajuda a decidir se vale reforçar o time ou só mudar a ordem."
      />

      <div className="grade-lado">
        <section className="cartao">
          <label className="controle">
            <div className="controle__valor">
              <span>
                Tratativas por dia: <strong>{num(capacidade)}</strong>
              </span>
              <span className="mudo">
                {num(horas)} horas de trabalho ({PARAMETROS.minutosPorTratativa} min por tratativa)
              </span>
            </div>
            <input type="range" min={50} max={400} step={10} value={capacidade} onChange={(e) => setCapacidade(Number(e.target.value))} />
            <div className="controle__escala">
              <span>50</span>
              <span>{num(PARAMETROS.capacidadeDiaria)} (hoje)</span>
              <span>400</span>
            </div>
          </label>
          <div className="grade-4">
            <Kpi rotulo="Dias úteis para zerar" valor={num(analise.horizonteDias)} />
            <Kpi rotulo="Perda como é hoje" valor={brl(atual.perdaEsperada)} detalhe="Ordem de chegada" />
            <Kpi rotulo="Perda com a solução" valor={brl(solucao.perdaEsperada)} tom="marca" />
            <Kpi rotulo="Economia" valor={brl(sim.recuperadoVsAtual)} tom="ok" detalhe={`${pct(sim.eficiencia)} do que dá para salvar`} />
          </div>
        </section>
        <section className="cartao cartao--suave" aria-label="O que esta simulação faz">
          <h2>O que a simulação faz</h2>
          <ol className="lista-marcada">
            <li>
              Pega as <strong>{num(analise.excecoes.length)} exceções abertas</strong> hoje.
            </li>
            <li>
              Põe o time para trabalhar a <strong>{num(adiada)} pedidos por dia</strong>: a fila leva <strong>{analise.horizonteDias} dias úteis</strong> para zerar.
            </li>
            <li>
              Enquanto um pedido espera, o atraso cresce e a chance de o cliente cancelar sobe ({PARAMETROS.faixasCancelamento.map((f) => pct(f.probabilidade)).join(", ")}{" "}
              conforme os dias úteis de atraso). Quem cancela custa o reembolso e as compras futuras.
            </li>
            <li>Repete tudo três vezes, mudando só a ordem de atendimento, e soma a perda dia a dia.</li>
          </ol>
        </section>
      </div>

      <section className="cartao">
        <div className="cartao__cabeca">
          <div>
            <h2>Perda acumulada até a fila zerar, com {num(adiada)} tratativas por dia</h2>
            <p>Quanto mais baixa a linha, menos dinheiro perdido.</p>
          </div>
        </div>
        <GraficoPerda simulacao={sim} dias={analise.diasDeTratamento} capacidade={adiada} pedidos={analise.excecoes.length} />
      </section>

      <Aviso tom="info">
        Com {num(PARAMETROS.capacidadeDiaria)} tratativas por dia e a fila priorizada, a perda é de {brl(equivalente.alvo)}.{" "}
        {equivalente.cap
          ? `Para chegar ao mesmo resultado tratando por ordem de chegada, o time precisaria de ${num(equivalente.cap)} tratativas por dia: ${pct(
              equivalente.cap / PARAMETROS.capacidadeDiaria - 1,
            )} mais capacidade. Mudar a ordem vale esse reforço de equipe.`
          : "Nem com 1.000 tratativas por dia a ordem de chegada empata com a fila priorizada."}
      </Aviso>
    </div>
  );
}
