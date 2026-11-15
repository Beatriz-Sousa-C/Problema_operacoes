"use client";
import { useMemo } from "react";
import { useState } from "react";
import { simular } from "@/core";
import type { Briefing, Contexto } from "@/agente";
import { GraficoPerda } from "./GraficoPerda";
import { Badge, Cabecalho, Icone, Kpi } from "./componentes";
import { brl, dataCompleta, dataHora, milhar, num, num1, pct, plural, ROTULO_TIPO } from "./formato";
import type { AtividadeAgente, Dia, Placar } from "./tratativas";

interface Props {
  ctx: Contexto;
  dia: Dia;
  atividade: AtividadeAgente;
  placar: Placar;
  briefing: Briefing | null;
  irPara: (aba: string) => void;
}

const textoDoBriefing = (b: Briefing) =>
  `${b.titulo}\n\n${b.paragrafos.join("\n\n")}\n\nPrioridades:\n${b.prioridades.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;

export function Resumo({ ctx, dia, atividade: at, placar, briefing, irPara }: Props) {
  const [briefingCopiado, setBriefingCopiado] = useState(false);
  const sim = useMemo(() => simular(ctx.analise), [ctx]);
  const atual = sim.estrategias.find((s) => s.estrategia === "ordem_de_chegada")!;
  const solucao = sim.estrategias.find((s) => s.estrategia === "custo_de_esperar")!;
  const { analise, auditoria, causas } = ctx;
  const p = analise.parametros;
  const custoCausas = causas.reduce((s, c) => s + c.custoDoExcesso, 0);
  const cancelamentosEvitados = atual.cancelamentosEsperados - solucao.cancelamentosEsperados;
  const coberturaRegra = auditoria.pedidos ? auditoria.batemComCorridos / auditoria.pedidos : 0;

  return (
    <div className="pagina">
      <Cabecalho
        sobre={`Operações · ${num(analise.excecoes.length)} exceções abertas em ${dataCompleta(p.dataReferencia)}`}
        titulo={
          <>
            Mudar a ordem da fila evita <span className="kpi__valor--marca">{milhar(sim.recuperadoVsAtual)}</span> em perdas nos próximos{" "}
            {analise.horizonteDias} dias úteis, com o mesmo time.
          </>
        }
        texto={
          <>
            Hoje as exceções são tratadas por ordem de chegada. Com {num(p.capacidadeDiaria)} tratativas por dia, a fila leva {analise.horizonteDias} dias
            úteis para zerar. Ordenando pelo <strong>custo de esperar</strong>, a perda esperada cai de {brl(atual.perdaEsperada)} para{" "}
            {brl(solucao.perdaEsperada)}: {pct(sim.eficiencia)} de tudo o que ainda dá para salvar.
          </>
        }
        acoes={
          <button className="botao botao--grande" onClick={() => irPara("hoje")}>
            Abrir o trabalho de hoje <Icone nome="seta" className="icone-botao" />
          </button>
        }
      />

      <div className="grade-4">
        <div className="cartao">
          <Kpi rotulo="Perda esperada como é hoje" valor={brl(atual.perdaEsperada)} detalhe="Ordem de chegada, até a fila zerar" />
        </div>
        <div className="cartao">
          <Kpi rotulo="Perda esperada com a solução" valor={brl(solucao.perdaEsperada)} tom="marca" detalhe={`${brl(sim.recuperadoVsAtual)} recuperados`} />
        </div>
        <div className="cartao">
          <Kpi rotulo="Cancelamentos a menos" valor={num(cancelamentosEvitados)} tom="ok" detalhe={`De ${num(atual.cancelamentosEsperados)} para ${num(solucao.cancelamentosEsperados)} clientes`} />
        </div>
        <div className="cartao">
          <Kpi rotulo="Causas de processo" valor={num(causas.length + (auditoria.regraObservada ? 1 : 0))} tom="critico" detalhe={`${brl(custoCausas)} em reenvios e contatos em 60 dias`} />
        </div>
      </div>

      <section className="cartao cartao--marca" aria-label="O que o agente de IA já preparou">
        <div className="cartao__cabeca">
          <div>
            <Badge tom="lima" icone="agente">
              Agente de IA
            </Badge>
            <h2 style={{ marginTop: 10, fontSize: "1.375rem" }}>
              {at.ligado ? "O agente já preparou o dia. Faltam só as suas decisões." : "O agente está desligado: a política padrão preparou o dia."}
            </h2>
            <p className="suave">
              {at.ligado
                ? `Ele analisou os ${num(dia.total)} pedidos de hoje em ${plural(at.grupos, "grupo", "grupos")}, decidiu as ações de cada um, abriu ${plural(at.chamados.length, "chamado em lote", "chamados em lote")}, investigou ${plural(at.investigados, "caso sensível", "casos sensíveis")} um a um e escreveu ${plural(at.mensagens, "mensagem", "mensagens")}. O que envolve dinheiro espera a sua aprovação.`
                : "Com a chave da Groq configurada, o agente decide a tratativa de cada grupo, investiga os casos sensíveis, abre os chamados e escreve as mensagens. Sem ela, valem as regras padrão da política."}
            </p>
          </div>
          <button className="botao botao--lima" onClick={() => irPara("hoje")}>
            {dia.nCartoes > 0 ? `Decidir ${plural(dia.nCartoes, "grupo", "grupos")}` : "Ver o trabalho de hoje"}
          </button>
        </div>
        <div className="grade-4">
          <Kpi rotulo="Pedidos na fila de hoje" valor={num(dia.total)} />
          <Kpi rotulo="Decisões que dependem de você" valor={num(dia.nCartoes)} detalhe={`${plural(dia.nDecidir, "ação com dinheiro", "ações com dinheiro")}, agrupadas`} />
          <Kpi rotulo="Mensagens prontas para sair" valor={num(dia.nEnviar)} />
          <Kpi
            rotulo="Recomendações aprovadas por você"
            valor={placar.decididas ? `${num(placar.aprovadas)} de ${num(placar.decididas)}` : "—"}
            detalhe={placar.decididas ? `${pct(placar.taxa ?? 0)} de aprovação até agora` : "Aparece conforme você decide"}
          />
        </div>
      </section>

      {briefing && (
        <section className="cartao" aria-label="Briefing do dia">
          <div className="cartao__cabeca">
            <div>
              {briefing.fonte === "agente" ? (
                <Badge tom="agente" icone="agente">
                  Briefing escrito pelo agente
                </Badge>
              ) : (
                <Badge tom="regras">Briefing montado pela política (agente desligado)</Badge>
              )}
              <h2 style={{ marginTop: 10 }}>{briefing.titulo}</h2>
            </div>
            <button className="botao botao--secundario" onClick={() => navigator.clipboard.writeText(textoDoBriefing(briefing)).then(() => setBriefingCopiado(true))}>
              {briefingCopiado ? "Copiado" : "Copiar para enviar à liderança"}
            </button>
          </div>
          <div className="briefing">
            {briefing.paragrafos.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div>
            <h3 style={{ marginBottom: 6 }}>Prioridades</h3>
            <ol className="lista-marcada">
              {briefing.prioridades.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </div>
          <p className="meta">
            Gerado em {dataHora(briefing.geradoEm)}
            {briefing.modelo ? ` · ${briefing.modelo}` : ""} · só com os números calculados pelo sistema
          </p>
        </section>
      )}

      <section className="cartao" aria-label="Simulação das estratégias">
        <div className="cartao__cabeca">
          <div>
            <h2>Quanto a empresa perde até a fila zerar, em cada ordem de atendimento</h2>
            <p>
              Mesma fila, mesmo time ({num(p.capacidadeDiaria)} pedidos por dia); só muda a ordem. Quanto mais baixa a linha, menos dinheiro perdido.
            </p>
          </div>
          <button className="botao-texto" onClick={() => irPara("simulador")}>
            Testar outra capacidade
          </button>
        </div>
        <GraficoPerda simulacao={sim} dias={analise.diasDeTratamento} capacidade={p.capacidadeDiaria} pedidos={analise.excecoes.length} />
      </section>

      <div className="grade-lado">
        <section className="cartao" aria-label="Onde as exceções nascem">
          <div className="cartao__cabeca">
            <div>
              <h2>Onde as exceções nascem</h2>
              <p>Concentrações que não são acaso (teste estatístico com correção para comparações múltiplas). Cada uma pede uma mudança de processo, não mais tratativas.</p>
            </div>
          </div>
          <div className="tabela-rolagem" style={{ boxShadow: "none" }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Onde</th>
                  <th scope="col">Exceção</th>
                  <th scope="col" className="num">Ocorrências</th>
                  <th scope="col" className="num">Esperado</th>
                  <th scope="col" className="num">Vezes acima</th>
                  <th scope="col" className="num">Custo do excesso</th>
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
          </div>
          <button className="botao-texto" onClick={() => irPara("causas")}>
            Ver evidências e planos de correção
          </button>
        </section>

        <div style={{ display: "grid", gap: 16 }}>
          {auditoria.regraObservada && (
            <section className="cartao" style={{ borderLeft: "4px solid var(--serie-2)" }} aria-label="Achado: data prometida">
              <Badge tom="atencao" icone="alerta">
                Achado que a fila não resolve
              </Badge>
              <h2>O site promete a entrega antes do prazo que a transportadora tem</h2>
              <p className="suave">
                A regra é 1 dia útil de separação mais o prazo da transportadora em dias úteis. Em {pct(coberturaRegra)} dos pedidos a data mostrada ao cliente foi
                calculada em dias corridos: em média {num1(auditoria.diasPrometidosAMenosMedio)} dia útil a menos, chegando a {auditoria.diasPrometidosAMenosMax}.
                Por isso <strong>{num(auditoria.atrasosDentroDoContrato)} dos {num(auditoria.atrasosTotal)} atrasos</strong> estão dentro do prazo contratado: a
                transportadora cumpriu, a promessa é que estava errada.
              </p>
              <button className="botao-texto" onClick={() => irPara("causas")}>
                Ver o plano de correção
              </button>
            </section>
          )}

          <section className="cartao cartao--suave" aria-label="Qualidade dos dados">
            <h2>Antes de calcular, a limpeza</h2>
            <p className="suave">
              {num(analise.qualidade.linhasRecebidas)} linhas recebidas. {num(analise.qualidade.duplicatasRemovidas)} eram a mesma exceção aberta duas vezes para o
              mesmo pedido; ficou o registro mais avançado, o que poupa {num(analise.qualidade.duplicatasRemovidas)} tratativas.
              {analise.qualidade.transportadorasSemSla > 0 &&
                ` ${num(analise.qualidade.transportadorasSemSla)} exceções usam uma transportadora fora da tabela para a UF: SLA e frete estimados pela mediana.`}
            </p>
            {analise.qualidade.linhasDescartadas.length > 0 && (
              <details>
                <summary>{num(analise.qualidade.linhasDescartadas.length)} linhas ignoradas por erro nos dados</summary>
                <ul className="lista-marcada" style={{ marginTop: 8 }}>
                  {analise.qualidade.linhasDescartadas.slice(0, 50).map((d) => (
                    <li key={`${d.arquivo}|${d.linha}`}>
                      {d.arquivo}, linha {d.linha}: {d.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {analise.qualidade.linhasCorrigidas.length > 0 && (
              <details>
                <summary>{num(analise.qualidade.linhasCorrigidas.length)} linhas aceitas com um campo corrigido</summary>
                <ul className="lista-marcada" style={{ marginTop: 8 }}>
                  {analise.qualidade.linhasCorrigidas.slice(0, 50).map((d) => (
                    <li key={`${d.arquivo}|${d.linha}`}>
                      {d.arquivo}, linha {d.linha}: {d.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
