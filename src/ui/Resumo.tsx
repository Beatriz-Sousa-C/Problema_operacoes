"use client";
import { useMemo } from "react";
import { simular } from "@/core";
import type { Contexto } from "@/agente";
import { GraficoPerda } from "./GraficoPerda";
import { brl, dataBr, milhar, num, num1, pct, ROTULO_TIPO } from "./formato";

export function Resumo({ ctx, irPara }: { ctx: Contexto; irPara: (aba: string) => void }) {
  const sim = useMemo(() => simular(ctx.analise), [ctx]);
  const atual = sim.estrategias.find((s) => s.estrategia === "ordem_de_chegada")!;
  const solucao = sim.estrategias.find((s) => s.estrategia === "custo_de_esperar")!;
  const { analise, auditoria, causas } = ctx;
  const p = analise.parametros;
  const custoCausas = causas.reduce((s, c) => s + c.custoDoExcesso, 0);

  return (
    <div className="resumo">
      <section className="abertura">
        <h1 className="titulo-largo">
          Tratar a fila pelo custo de esperar evita {milhar(sim.recuperadoVsAtual)} em perdas nos próximos {analise.horizonteDias} dias úteis.
        </h1>
        <p className="abertura__texto">
          Hoje o time trata as exceções por ordem de chegada. Com {num(p.capacidadeDiaria)} tratativas por dia, as{" "}
          {num(analise.excecoes.length)} exceções abertas levam {analise.horizonteDias} dias úteis para zerar. Mudando só a ordem, a perda
          esperada cai de {brl(atual.perdaEsperada)} para {brl(solucao.perdaEsperada)}, com{" "}
          {num(atual.cancelamentosEsperados - solucao.cancelamentosEsperados)} cancelamentos a menos. É {pct(sim.eficiencia)} de tudo o que
          ainda dá para salvar.
        </p>
        <GraficoPerda simulacao={sim} dias={analise.diasDeTratamento} />
      </section>

      <section className="fatos" aria-label="Números da fila">
        <div>
          <span className="fatos__valor">{brl(sim.perdaInevitavel)}</span>
          <span className="fatos__rotulo">já está comprometido pelo atraso acumulado até hoje e nenhuma ordem de fila recupera</span>
        </div>
        <div>
          <span className="fatos__valor">{brl(atual.perdaEsperada - sim.perdaInevitavel)}</span>
          <span className="fatos__rotulo">é o que ainda está em jogo; a solução recupera {brl(sim.recuperadoVsAtual)} disso</span>
        </div>
        <div>
          <span className="fatos__valor">{brl(custoCausas)}</span>
          <span className="fatos__rotulo">em reenvios e contatos nos últimos 60 dias vieram de {causas.length} causas de processo que a fila não resolve</span>
        </div>
      </section>

      {auditoria.regraObservada && (
        <section className="achado">
          <h2>O site promete a entrega antes do prazo que a transportadora tem</h2>
          <p>
            A regra é 1 dia útil de separação mais o prazo da transportadora em dias úteis. Em {pct(1)} dos pedidos, a data mostrada ao cliente
            foi calculada em dias corridos: em média {num1(auditoria.diasPrometidosAMenosMedio)} dia útil a menos, chegando a{" "}
            {auditoria.diasPrometidosAMenosMax}. Por isso {num(auditoria.atrasosDentroDoContrato)} dos {num(auditoria.atrasosTotal)} atrasos
            registrados estão dentro do prazo contratado: a transportadora cumpriu, a promessa é que estava errada. Corrigir o cálculo custa quase nada
            e reduz o atraso percebido de toda a fila.
          </p>
          <button className="botao-texto" onClick={() => irPara("causas")}>
            Ver o plano de correção
          </button>
        </section>
      )}

      <section className="causas-resumo">
        <h2>Onde as exceções nascem</h2>
        <p className="secao__intro">
          Concentrações que não são acaso (teste estatístico com correção para comparações múltiplas). Cada uma pede uma mudança de processo, não
          mais tratativas.
        </p>
        <table className="tabela tabela--compacta">
          <thead>
            <tr>
              <th scope="col">Onde</th>
              <th scope="col">Exceção</th>
              <th scope="col" className="num">Ocorrências</th>
              <th scope="col" className="num">Esperado se fosse normal</th>
              <th scope="col" className="num">Vezes acima</th>
              <th scope="col" className="num">Custo direto do excesso</th>
            </tr>
          </thead>
          <tbody>
            {causas.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.grupo}
                  <small>{c.dimensao}</small>
                </td>
                <td>{ROTULO_TIPO[c.tipo]}</td>
                <td className="num">{num(c.observado)}</td>
                <td className="num">{num1(c.esperado)}</td>
                <td className="num">{num1(c.lift)}×</td>
                <td className="num">{brl(c.custoDoExcesso)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="botao-texto" onClick={() => irPara("causas")}>
          Ver evidências e planos de correção
        </button>
      </section>

      <section className="qualidade">
        <h2>Antes de calcular, a limpeza</h2>
        <p>
          Recebemos {num(analise.qualidade.linhasRecebidas)} linhas. {num(analise.qualidade.duplicatasRemovidas)} eram a mesma exceção aberta duas
          vezes para o mesmo pedido, com status diferentes; mantivemos o registro mais avançado. Tratar as duas seria gastar{" "}
          {num(analise.qualidade.duplicatasRemovidas)} tratativas à toa. Dados de referência: {dataBr(p.dataReferencia)}/2026.
        </p>
      </section>
    </div>
  );
}
