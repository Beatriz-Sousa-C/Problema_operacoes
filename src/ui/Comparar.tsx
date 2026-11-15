"use client";
/** Ontem × hoje: o que a fila previu e o que aconteceu quando a lista do dia seguinte chega. */
import { Aviso, Badge, Cabecalho, Icone, Kpi } from "./componentes";
import type { Comparacao, TendenciaCausa } from "./comparacao";
import { brl, dataCompleta, num, num1, pct, plural, ROTULO_TIPO } from "./formato";

interface Props {
  comparacao: Comparacao | null;
  /** Origem da lista atual (nome dos arquivos ou "simulação") */
  origem: string;
  simulada: boolean;
  aoCarregar: () => void;
  aoSimular: () => void;
  aoVoltar: () => void;
  irPara: (aba: string) => void;
}

const TENDENCIA: Record<TendenciaCausa["tendencia"], { rotulo: string; tom: "critico" | "atencao" | "ok" | "neutro" | "agente" }> = {
  piorou: { rotulo: "Piorou", tom: "critico" },
  nova: { rotulo: "Nova", tom: "atencao" },
  estavel: { rotulo: "Estável", tom: "neutro" },
  melhorou: { rotulo: "Melhorou", tom: "ok" },
  sumiu: { rotulo: "Não aparece mais", tom: "ok" },
};

export function Comparar({ comparacao: c, origem, simulada, aoCarregar, aoSimular, aoVoltar, irPara }: Props) {
  if (!c) {
    return (
      <div className="pagina">
        <Cabecalho
          sobre="Fechar o ciclo"
          titulo="Ontem × hoje: o que a fila previu e o que aconteceu"
          texto="Quando a lista do dia seguinte chega, o sistema compara com a de hoje: o que foi resolvido, o que continua, o que é novo, se as causas pioraram e quanto do que a fila priorizou de fato saiu. É o que transforma a priorização numa promessa verificável."
        />
        <div className="grade-2">
          <section className="cartao">
            <h2>Carregar a lista de amanhã</h2>
            <p className="suave">Envie o `pedidos_excecao.csv` do dia seguinte (mesmo formato). A data de referência é inferida da própria lista e a comparação aparece aqui.</p>
            <button className="botao" onClick={aoCarregar} style={{ justifySelf: "start" }}>
              <Icone nome="upload" className="icone-botao" />
              Carregar lista
            </button>
          </section>
          <section className="cartao cartao--suave">
            <h2>Não tem a lista de amanhã? Simule uma</h2>
            <p className="suave">
              Para demonstração: o sistema gera uma lista plausível a partir da de hoje (parte da fila se resolve, o resto envelhece um dia útil, entram exceções novas
              repetindo as causas conhecidas). Fica claramente marcada como simulada.
            </p>
            <button className="botao botao--secundario" onClick={aoSimular} style={{ justifySelf: "start" }}>
              Simular a lista de amanhã
            </button>
          </section>
        </div>
      </div>
    );
  }

  const pr = c.previstoRealizado;
  return (
    <div className="pagina">
      <Cabecalho
        sobre="Fechar o ciclo"
        titulo={`${dataCompleta(c.dataAnterior)} × ${dataCompleta(c.dataAtual)}`}
        texto={`A lista anterior tinha ${num(c.totalAnterior)} exceções; a atual tem ${num(c.totalAtual)}. ${num(c.resolvidas.total)} saíram, ${num(c.continuam.total)} continuam e ${num(c.novas.total)} são novas.`}
        acoes={
          <div className="botoes">
            <button className="botao botao--secundario" onClick={aoCarregar}>
              Carregar outra lista
            </button>
            <button className="botao-texto botao-texto--mudo" onClick={aoVoltar}>
              Voltar à lista original
            </button>
          </div>
        }
      />

      {simulada ? (
        <Aviso tom="atencao">
          <strong>Lista simulada para demonstração.</strong> Gerada a partir da lista original: não são dados reais do dia seguinte. Com a lista real, a comparação é a
          mesma.
        </Aviso>
      ) : (
        <Aviso tom="info">Comparando a lista original com {origem}.</Aviso>
      )}

      <div className="grade-4">
        <div className="cartao">
          <Kpi rotulo="Resolvidas" valor={num(c.resolvidas.total)} tom="ok" detalhe={`${brl(c.resolvidas.valorEmJogo)} que estavam em jogo`} />
        </div>
        <div className="cartao">
          <Kpi rotulo="Continuam abertas" valor={num(c.continuam.total)} detalhe={`Atraso médio de ${num1(c.continuam.atrasoMedioAntes)} para ${num1(c.continuam.atrasoMedioAgora)} dias úteis`} />
        </div>
        <div className="cartao">
          <Kpi rotulo="Novas exceções" valor={num(c.novas.total)} tom="critico" detalhe={`${brl(c.novas.valorEmJogo)} em jogo`} />
        </div>
        <div className="cartao">
          <Kpi
            rotulo="Reincidência"
            valor={pct(c.novas.total ? c.novas.ligadasACausaConhecida / c.novas.total : 0)}
            detalhe={`${num(c.novas.ligadasACausaConhecida)} das novas repetem uma causa já conhecida`}
          />
        </div>
      </div>

      <section className="cartao" aria-label="Previsto e realizado">
        <div className="cartao__cabeca">
          <div>
            <h2>Previsto × realizado</h2>
            <p>A fila priorizou {num(pr.filaDoDia)} pedidos para o dia. Se a priorização funciona, eles somem da lista numa proporção muito maior do que os demais.</p>
          </div>
        </div>
        <div className="comparar-barras">
          <Barra rotulo={`Priorizados pela fila (${num(pr.filaDoDia)})`} fracao={pr.fracaoFila} texto={`${num(pr.filaResolvidos)} resolvidos (${pct(pr.fracaoFila)})`} tom="marca" />
          <Barra rotulo={`Deixados para depois (${num(pr.foraDaFila)})`} fracao={pr.fracaoFora} texto={`${num(pr.foraResolvidos)} resolvidos (${pct(pr.fracaoFora)})`} tom="neutro" />
          {pr.aprovadosOntem > 0 && (
            <Barra rotulo={`Com ação aprovada por você (${num(pr.aprovadosOntem)})`} fracao={pr.fracaoAprovados} texto={`${num(pr.aprovadosResolvidos)} resolvidos (${pct(pr.fracaoAprovados)})`} tom="ok" />
          )}
        </div>
        <p className="suave">
          Dos {num(pr.filaDoDia)} priorizados, {num(c.continuam.daFilaDoDia)} ainda estão abertos: são os primeiros a conferir hoje.{" "}
          <button className="botao-texto" onClick={() => irPara("hoje")}>
            Abrir o trabalho de hoje
          </button>
        </p>
      </section>

      <div className="grade-lado">
        <section className="cartao" aria-label="Causas: ontem e hoje">
          <div className="cartao__cabeca">
            <div>
              <h2>Causas de processo: ontem × hoje</h2>
              <p>Uma causa que piora depois do chamado em lote pede escalonamento; uma que some confirma que a correção funcionou.</p>
            </div>
          </div>
          <div className="tabela-rolagem" style={{ boxShadow: "none" }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Causa</th>
                  <th scope="col">Exceção</th>
                  <th scope="col" className="num">Ontem</th>
                  <th scope="col" className="num">Hoje</th>
                  <th scope="col" className="num">Vezes acima</th>
                  <th scope="col">Tendência</th>
                </tr>
              </thead>
              <tbody>
                {c.causas.map((t) => (
                  <tr key={t.id}>
                    <td>{t.rotulo}</td>
                    <td>{ROTULO_TIPO[t.tipo]}</td>
                    <td className="num">{t.observadoAntes === null ? "—" : num(t.observadoAntes)}</td>
                    <td className="num">{t.observadoAgora === null ? "—" : num(t.observadoAgora)}</td>
                    <td className="num">
                      {t.liftAntes === null ? "—" : `${num1(t.liftAntes)}×`} → {t.liftAgora === null ? "—" : `${num1(t.liftAgora)}×`}
                    </td>
                    <td>
                      <Badge tom={TENDENCIA[t.tendencia].tom}>{TENDENCIA[t.tendencia].rotulo}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="cartao" aria-label="Novas exceções por tipo">
          <h2>Novas exceções por tipo</h2>
          <ul className="lista">
            {c.novas.porTipo.map((t) => (
              <li key={t.tipo}>
                <span className="lista__texto">{ROTULO_TIPO[t.tipo]}</span>
                <strong className="tabular">{plural(t.n, "pedido", "pedidos")}</strong>
              </li>
            ))}
            {c.novas.porTipo.length === 0 && <li className="suave">Nenhuma exceção nova.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Barra({ rotulo, fracao, texto, tom }: { rotulo: string; fracao: number; texto: string; tom: "marca" | "neutro" | "ok" }) {
  return (
    <div className="barra">
      <div className="barra__cabeca">
        <span>{rotulo}</span>
        <strong>{texto}</strong>
      </div>
      <div className="barra__trilho" aria-hidden="true">
        <span className={`barra__valor barra__valor--${tom}`} style={{ width: `${Math.max(1, Math.min(100, fracao * 100))}%` }} />
      </div>
    </div>
  );
}
