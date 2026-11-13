"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanoDoDia } from "@/agente";
import { Causas } from "./Causas";
import { Fila } from "./Fila";
import { Metodo } from "./Metodo";
import { Resumo } from "./Resumo";
import { Simulador } from "./Simulador";
import { carregarPadrao, lerArquivosEnviados, useContexto, usePlano, type Dados } from "./estado";
import { dataBr, num } from "./formato";

const ABAS = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "fila", rotulo: "Fila de hoje" },
  { id: "causas", rotulo: "Causas" },
  { id: "simulador", rotulo: "Simulador" },
  { id: "metodo", rotulo: "Método" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export function App() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("resumo");
  const [planoAoVivo, setPlanoAoVivo] = useState<PlanoDoDia | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarPadrao().then(setDados).catch((e) => setErro(e.message));
    const sincronizar = () => {
      const doHash = window.location.hash.slice(1) as Aba;
      if (ABAS.some((a) => a.id === doHash)) setAba(doHash);
    };
    sincronizar();
    window.addEventListener("hashchange", sincronizar);
    return () => window.removeEventListener("hashchange", sincronizar);
  }, []);

  const irPara = useCallback((id: string) => {
    setAba(id as Aba);
    history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  }, []);

  const { ctx, base, erro: erroDados } = useContexto(dados);
  const { plano: planoArquivo, correcoes, fonte } = usePlano(ctx, dados?.origem);
  const plano = planoAoVivo ?? planoArquivo;

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

  const mensagemErro = erro ?? erroDados;

  return (
    <>
      <header className="topo">
        <div className="topo__marca">
          <span className="topo__nome">Fila de exceções</span>
          <span className="topo__contexto">
            {ctx
              ? `Gocase e GoBeauté, ${num(ctx.analise.excecoes.length)} exceções abertas em ${dataBr(ctx.analise.parametros.dataReferencia)}${
                  dados?.origem !== "padrao" ? `, arquivo ${dados?.origem}` : ""
                }`
              : "Carregando os dados"}
          </span>
        </div>
        <div className="topo__acoes">
          {dados?.origem !== "padrao" && (
            <button className="botao-texto" onClick={() => carregarPadrao().then(setDados)}>
              Voltar aos dados originais
            </button>
          )}
          <button className="botao botao--secundario" onClick={() => arquivoRef.current?.click()}>
            Carregar outra lista
          </button>
          <input ref={arquivoRef} type="file" accept=".csv,text/csv" multiple hidden onChange={enviar} />
        </div>
        <nav className="abas" aria-label="Seções">
          {ABAS.map((a) => (
            <button key={a.id} className="abas__item" aria-current={aba === a.id ? "page" : undefined} onClick={() => irPara(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </nav>
      </header>

      <main className="conteudo">
        {mensagemErro && (
          <p className="erro" role="alert">
            {mensagemErro}
          </p>
        )}
        {!ctx && !mensagemErro && <p className="carregando">Calculando a fila…</p>}
        {ctx && aba === "resumo" && <Resumo ctx={ctx} irPara={irPara} />}
        {ctx && aba === "fila" && <Fila ctx={ctx} plano={plano} fonte={planoAoVivo ? "agente" : fonte} aoTrocarPlano={setPlanoAoVivo} />}
        {ctx && aba === "causas" && <Causas ctx={ctx} planos={dados?.origem === "padrao" ? correcoes : null} />}
        {ctx && base && aba === "simulador" && <Simulador base={base} />}
        {aba === "metodo" && <Metodo />}
      </main>
    </>
  );
}
