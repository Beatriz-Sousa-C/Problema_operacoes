/**
 * Acesso aos dados no servidor. Os CSVs ficam FORA de `public/`: nunca são
 * servidos como arquivo estático, e no repositório público só existe a versão
 * cifrada (`*.csv.enc`, AES-256-GCM com chave derivada por scrypt).
 *
 * Ordem de leitura de cada arquivo:
 *  1. `dados/<arquivo>` em texto puro (máquina de quem desenvolve; ignorado pelo git);
 *  2. `dados/<arquivo>.enc` decifrado com DADOS_SENHA (Vercel e qualquer clone).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Csvs {
  excecoes: string;
  clientes: string;
  transportadoras: string;
}

export const ARQUIVOS: Record<keyof Csvs, string> = {
  excecoes: "pedidos_excecao.csv",
  clientes: "clientes.csv",
  transportadoras: "transportadoras.csv",
};

export const PASTA_DADOS = join(process.cwd(), "dados");
export const ARQUIVO_PLANO = join(PASTA_DADOS, "gerado", "plano.json");

// ---------- Cifra ----------

const MAGICA = Buffer.from("GGD1"); // identifica o formato e a versão
const SAL = 16;
const IV = 12;
const TAG = 16;

export function cifrar(texto: string, senha: string): Buffer {
  const sal = randomBytes(SAL);
  const iv = randomBytes(IV);
  const chave = scryptSync(senha, sal, 32);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  const corpo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return Buffer.concat([MAGICA, sal, iv, cifra.getAuthTag(), corpo]);
}

export function decifrar(dados: Buffer, senha: string): string {
  if (dados.length < MAGICA.length + SAL + IV + TAG || !dados.subarray(0, MAGICA.length).equals(MAGICA)) {
    throw new Error("arquivo cifrado em formato desconhecido");
  }
  let p = MAGICA.length;
  const sal = dados.subarray(p, (p += SAL));
  const iv = dados.subarray(p, (p += IV));
  const tag = dados.subarray(p, (p += TAG));
  const chave = scryptSync(senha, sal, 32);
  const decifra = createDecipheriv("aes-256-gcm", chave, iv);
  decifra.setAuthTag(tag);
  try {
    return Buffer.concat([decifra.update(dados.subarray(p)), decifra.final()]).toString("utf8");
  } catch {
    throw new Error("não foi possível decifrar: a senha (DADOS_SENHA) está errada ou o arquivo foi alterado");
  }
}

// ---------- Leitura ----------

export interface OpcoesLeitura {
  pasta?: string;
  senha?: string;
}

function lerArquivo(nome: string, { pasta = PASTA_DADOS, senha = process.env.DADOS_SENHA }: OpcoesLeitura): string {
  // Os arquivos de dados/ entram no deploy por outputFileTracingIncludes; o rastreio automático não precisa segui-los.
  const puro = join(/*turbopackIgnore: true*/ pasta, nome);
  if (existsSync(puro)) return readFileSync(puro, "utf8");
  const cifrado = `${puro}.enc`;
  if (existsSync(cifrado)) {
    if (!senha) throw new Error(`${nome}: só existe a versão cifrada e DADOS_SENHA não está definida`);
    return decifrar(readFileSync(cifrado), senha);
  }
  throw new Error(`${nome}: arquivo não encontrado em ${pasta} (nem em texto puro, nem cifrado)`);
}

/** Os três CSVs do desafio, do disco (texto puro ou cifrado). */
export function lerCsvsDoDisco(opcoes: OpcoesLeitura = {}): Csvs {
  return {
    excecoes: lerArquivo(ARQUIVOS.excecoes, opcoes),
    clientes: lerArquivo(ARQUIVOS.clientes, opcoes),
    transportadoras: lerArquivo(ARQUIVOS.transportadoras, opcoes),
  };
}

/** Gera `*.csv.enc` a partir dos CSVs em texto puro. Devolve os caminhos escritos. */
export function cifrarCsvs(senha: string, pasta = PASTA_DADOS): string[] {
  const escritos: string[] = [];
  for (const nome of Object.values(ARQUIVOS)) {
    const origem = join(/*turbopackIgnore: true*/ pasta, nome);
    if (!existsSync(origem)) throw new Error(`${nome}: não encontrado em ${pasta}`);
    const destino = `${origem}.enc`;
    writeFileSync(destino, cifrar(readFileSync(origem, "utf8"), senha));
    escritos.push(destino);
  }
  return escritos;
}

// ---------- Plano gerado no build ----------

export function lerPlanoGerado<T = unknown>(): T | null {
  if (!existsSync(ARQUIVO_PLANO)) return null;
  try {
    return JSON.parse(readFileSync(ARQUIVO_PLANO, "utf8")) as T;
  } catch {
    return null;
  }
}

export function gravarPlanoGerado(conteudo: unknown): void {
  mkdirSync(join(PASTA_DADOS, "gerado"), { recursive: true });
  writeFileSync(ARQUIVO_PLANO, JSON.stringify(conteudo, null, 1));
}
