"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { carregarBase } from "@/core";
import { briefingPorRegras, criarContexto, type Contexto, type PlanoDoDia } from "@/agente";
import { Causas } from "./Causas";
import { Comparar } from "./Comparar";
import { compararDias, excecoesParaCsv, simularAmanha } from "./comparacao";
import { Fila } from "./Fila";
import { Hoje } from "./Hoje";
import { Metodo } from "./Metodo";
import { Resumo } from "./Resumo";
import { Simulador } from "./Simulador";
import { Aviso, Carregando, Icone, type NomeIcone } from "./componentes";
import {
  carregarPadrao,
  chaveRegistro,
  lerAbaDoLink,
  lerArquivosEnviados,
  lerPedidoDoLink,
  lerRegistroSalvo,
  useContexto,
  useLotes,
  usePlano,
  useRegistro,
  type Dados,
} from "./estado";
import { dataCompleta, dataHora, num } from "./formato";
import { atividadeDoAgente, placarDoAgente, useDia, type AtividadeAgente } from "./tratativas";

const ABAS: { id: string; rotulo: string; icone: NomeIcone }[] = [
  { id: "resumo", rotulo: "Visão geral", icone: "resumo" },
  { id: "hoje", rotulo: "Trabalho de hoje", icone: "hoje" },
  { id: "fila", rotulo: "Fila completa", icone: "fila" },
  { id: "causas", rotulo: "Causas de processo", icone: "causas" },
  { id: "comparar", rotulo: "Ontem × hoje", icone: "comparar" },
  { id: "simulador", rotulo: "Simulador", icone: "simulador" },
  { id: "metodo", rotulo: "Método", icone: "metodo" },
];

const ORIGEM_SIMULADA = "lista de amanhã simulada (demonstração)";

export function App() {
  const [dados, setDados] = useState<Dados | null>(null);
  /** A lista original fica guardada para comparar com uma lista enviada ou simulada. */
  const [dadosOriginais, setDadosOriginais] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState("resumo");
  const [planoAoVivo, setPlanoAoVivo] = useState<PlanoDoDia | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarPadrao()
      .then((d) => {
        setDados(d);
        setDadosOriginais(d);
      })
      .catch((e) => setErro(e.message));
    const sincronizar = () => {
      const doHash = lerAbaDoLink();
      if (ABAS.some((a) => a.id === doHash)) setAba(doHash);
      else if (lerPedidoDoLink()) setAba("fila"); // link direto de um pedido sem aba: abre na fila
    };
    sincronizar();
    window.addEventListener("hashchange", sincronizar);
    return () => window.removeEventListener("hashchange", sincronizar);
  }, []);

  const irPara = useCallback((id: string) => {
    setAba(id);
    history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  }, []);

  const { ctx, base, erro: erroDados } = useContexto(dados);
  const { plano: planoArquivo, correcoes, briefing: briefingArquivo } = usePlano(ctx, dados);
  const plano = planoAoVivo ?? planoArquivo;
  const briefing = useMemo(() => briefingArquivo ?? (ctx && plano ? briefingPorRegras(ctx, plano) : null), [briefingArquivo, ctx, plano]);
  // Registro acima das abas: trocar de aba ou recarregar não apaga fotos, aprovações e investigações.
  const chave = useMemo(() => (dados && ctx ? chaveRegistro(dados, ctx.analise.parametros.dataReferencia) : null), [dados, ctx]);
  const { registro, despachar } = useRegistro(chave);
  const { lotes, despacharLotes } = useLotes(chave);
  const original = dados?.origem === "padrao";
  // O dia inteiro (tratativas, pendências, mensagens) calculado uma vez e compartilhado pelas telas.
  const dia = useDia(ctx, plano, registro);
  const atividade = useMemo(() => (ctx && dia ? atividadeDoAgente(ctx, plano, dia.tratativas) : null), [ctx, plano, dia]);
  const placar = useMemo(() => (ctx && dia ? placarDoAgente(ctx, dia, registro, plano) : null), [ctx, dia, registro, plano]);

  // Ontem × hoje: a lista original contra a lista em uso (enviada ou simulada).
  const ctxOriginal = useMemo(() => {
    if (original) return ctx;
    if (!dadosOriginais) return null;
    try {
      return criarContexto(carregarBase(dadosOriginais.csvs));
    } catch {
      return null;
    }
  }, [original, ctx, dadosOriginais]);
  const comparacao = useMemo(() => {
    if (original || !ctx || !ctxOriginal || !dadosOriginais) return null;
    const registroOriginal = lerRegistroSalvo(chaveRegistro(dadosOriginais, ctxOriginal.analise.parametros.dataReferencia));
    return compararDias(ctxOriginal, ctx, registroOriginal);
  }, [original, ctx, ctxOriginal, dadosOriginais]);

  function simularListaDeAmanha() {
    if (!dadosOriginais || !ctxOriginal) return;
    try {
      const baseOriginal = carregarBase(dadosOriginais.csvs);
      const registroOriginal = lerRegistroSalvo(chaveRegistro(dadosOriginais, ctxOriginal.analise.parametros.dataReferencia));
      const { base: simulada } = simularAmanha(baseOriginal, ctxOriginal, registroOriginal);
      setDados({ csvs: { ...dadosOriginais.csvs, excecoes: excecoesParaCsv(simulada.excecoes) }, origem: ORIGEM_SIMULADA, plano: null });
      setPlanoAoVivo(null);
      setErro(null);
      irPara("comparar");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function enviar(ev: React.ChangeEvent<HTMLInputElement>) {
    if (!ev.target.files?.length || !dados) return;
    try {
      setDados(await lerArquivosEnviados(ev.target.files, dados.csvs));
      setPlanoAoVivo(null);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      ev.target.value = "";
    }
  }

  function voltarAoOriginal() {
    if (dadosOriginais) {
      setDados(dadosOriginais);
      setPlanoAoVivo(null);
      setErro(null);
      return;
    }
    carregarPadrao()
      .then((d) => {
        setDados(d);
        setDadosOriginais(d);
        setPlanoAoVivo(null);
        setErro(null);
      })
      .catch((e) => setErro(e.message));
  }

  const mensagemErro = erro ?? erroDados;

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <span className="marca__logo" aria-hidden="true">
            <Icone nome="hoje" />
          </span>
          <div className="marca__texto">
            <strong>Central de exceções</strong>
            <span>Operações · Gocase e GoBeauté</span>
          </div>
        </div>
        <nav className="nav" aria-label="Seções">
          {ABAS.map((a) => (
            <button key={a.id} className="nav__item" aria-current={aba === a.id ? "page" : undefined} onClick={() => irPara(a.id)}>
              <Icone nome={a.icone} />
              <span>{a.rotulo}</span>
              {a.id === "hoje" && dia && dia.nCartoes > 0 && (
                <em className="nav__contador" title={`${num(dia.nCartoes)} decisões esperando você`}>
                  {num(dia.nCartoes)}
                </em>
              )}
            </button>
          ))}
        </nav>
        <div className="lateral__rodape">
          <PainelAgente atividade={atividade} plano={plano} />
          <section className="painel-lateral" aria-label="Dados carregados">
            <h4>Dados</h4>
            {ctx ? (
              <>
                <div className="painel-lateral__linha">
                  <span>{original ? "Lista original" : dados?.origem === ORIGEM_SIMULADA ? "Lista simulada" : "Lista enviada"}</span>
                  <strong>{num(ctx.analise.excecoes.length)} exceções</strong>
                </div>
                <div className="painel-lateral__linha">
                  <span>Data de referência</span>
                  <strong>{dataCompleta(ctx.analise.parametros.dataReferencia)}</strong>
                </div>
                {!original && <span>{dados?.origem}</span>}
                <div className="botoes">
                  <button className="botao-texto" onClick={() => arquivoRef.current?.click()}>
                    Carregar outra lista
                  </button>
                  {!original && (
                    <button className="botao-texto" onClick={voltarAoOriginal}>
                      Voltar à original
                    </button>
                  )}
                </div>
              </>
            ) : (
              <span>Carregando…</span>
            )}
          </section>
        </div>
        <input ref={arquivoRef} type="file" accept=".csv,text/csv" multiple hidden onChange={enviar} />
      </aside>

      <div className="principal">
        <div className="topo-mobile">
          {ctx ? (
            <>
              <span>
                <span className={`ponto ${atividade?.ligado ? "ponto--ligado" : "ponto--desligado"}`} aria-hidden="true" />
                {atividade?.ligado ? "Agente ligado" : "Agente desligado"} · {num(ctx.analise.excecoes.length)} exceções · {dataCompleta(ctx.analise.parametros.dataReferencia)}
              </span>
              <button className="botao-texto botao-texto--mudo" onClick={() => arquivoRef.current?.click()}>
                Carregar outra lista
              </button>
            </>
          ) : (
            <span>Carregando…</span>
          )}
        </div>
        <main className="conteudo">
          {mensagemErro && <Aviso tom="critico">{mensagemErro}</Aviso>}
          {!ctx && !mensagemErro && <Carregando>Calculando a fila de exceções…</Carregando>}
          {ctx && dia && atividade && placar && aba === "resumo" && (
            <Resumo ctx={ctx} dia={dia} atividade={atividade} placar={placar} briefing={briefing} irPara={irPara} />
          )}
          {ctx && base && dia && atividade && placar && aba === "hoje" && (
            <Hoje
              ctx={ctx}
              base={base}
              plano={plano}
              dia={dia}
              atividade={atividade}
              placar={placar}
              aoTrocarPlano={setPlanoAoVivo}
              registro={registro}
              despachar={despachar}
              lotes={lotes}
              despacharLotes={despacharLotes}
              iaAoVivo={original}
              irPara={irPara}
            />
          )}
          {ctx && dia && aba === "fila" && (
            <Fila ctx={ctx} plano={plano} dia={dia} registro={registro} lotes={lotes} despachar={despachar} iaAoVivo={original} irPara={irPara} />
          )}
          {ctx && aba === "causas" && <Causas ctx={ctx} planos={original ? correcoes : null} />}
          {ctx && aba === "comparar" && (
            <Comparar
              comparacao={comparacao}
              origem={dados?.origem ?? ""}
              simulada={dados?.origem === ORIGEM_SIMULADA}
              aoCarregar={() => arquivoRef.current?.click()}
              aoSimular={simularListaDeAmanha}
              aoVoltar={voltarAoOriginal}
              irPara={irPara}
            />
          )}
          {ctx && base && aba === "simulador" && <Simulador base={base} parametros={ctx.analise.parametros} />}
          {aba === "metodo" && <Metodo />}
        </main>
      </div>
    </div>
  );
}

function PainelAgente({ atividade: at, plano }: { atividade: AtividadeAgente | null; plano: PlanoDoDia | null }) {
  return (
    <section className="painel-lateral" aria-label="Estado do agente de IA">
      <h4>Agente de IA</h4>
      {!at || !plano ? (
        <span>Preparando o plano do dia…</span>
      ) : (
        <>
          <div>
            <span className={`ponto ${at.ligado ? "ponto--ligado" : "ponto--desligado"}`} aria-hidden="true" />
            <strong>{at.ligado ? "Plano decidido pelo agente" : "Agente desligado"}</strong>
          </div>
          {at.ligado && at.modelo && <span>Modelo: {at.modelo}</span>}
          {at.geradoEm && <span>Plano gerado em {dataHora(at.geradoEm)}</span>}
          {!at.ligado && <span>Sem a chave da Groq, a política padrão assume.</span>}
        </>
      )}
    </section>
  );
}

export type { Contexto };
