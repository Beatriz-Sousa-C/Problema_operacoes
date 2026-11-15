/**
 * Peças do agente que só existem no servidor: os dados originais, o cliente
 * do modelo com a chave e o limitador de uso.
 *
 * O navegador nunca fala com o modelo: ele manda só o id de um pedido ou a
 * chave de um grupo, e o servidor monta a conversa inteira. Assim a chave da
 * Groq não pode ser usada como chat genérico.
 */
import { carregarBase } from "@/core";
import { lerCsvsDoDisco, lerPlanoGerado, type Csvs } from "@/servidor/dados";
import { criarContexto, type Contexto } from "./contexto";
import { ClienteGroq, ClienteIndisponivel, modelosDoAmbiente, type ClienteLlm } from "./llm";
import { ClienteContado, configDoAmbiente, ipDaRequisicao, Limitador, type TipoUso } from "./limite";

let csvs: Csvs | null = null;
let contexto: Contexto | null = null;

/** CSVs originais, lidos uma vez por instância (texto puro no desenvolvimento, cifrados no deploy). */
export function csvsDoServidor(): Csvs {
  csvs ??= lerCsvsDoDisco();
  return csvs;
}

/** Contexto da lista original, criado uma vez por instância. */
export function contextoDoServidor(): Contexto {
  contexto ??= criarContexto(carregarBase(csvsDoServidor()));
  return contexto;
}

/** Plano do agente gerado no build (null se o build rodou sem gerar). */
export const planoDoServidor = () => lerPlanoGerado();

export const limitador = new Limitador(configDoAmbiente());

/** Tempo máximo de uma rota do agente, abaixo do maxDuration de 60 s. */
export const PRAZO_ROTA_MS = 50_000;

/**
 * Cliente do modelo para uma requisição. Se a IA não estiver configurada ou o
 * limite tiver estourado, devolve um cliente que falha com o motivo: o agente
 * cai na tratativa da política e a tela mostra o aviso.
 */
export function clienteParaRequisicao(headers: Headers, tipo: TipoUso): ClienteLlm {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) return new ClienteIndisponivel("IA não configurada no servidor (GROQ_API_KEY ausente)");
  const uso = limitador.permitir(ipDaRequisicao(headers), tipo);
  if (!uso.ok) return new ClienteIndisponivel(uso.motivo);
  const groq = new ClienteGroq({
    chave,
    modelos: modelosDoAmbiente(process.env.GROQ_MODELOS),
    tentativasPorModelo: 2,
    esperaMaximaMs: 20_000,
    prazoFinal: Date.now() + PRAZO_ROTA_MS,
  });
  return new ClienteContado(groq, limitador);
}
