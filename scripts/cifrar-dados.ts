/**
 * Cifra os CSVs de `dados/` para `dados/*.csv.enc` com DADOS_SENHA.
 * Só a versão cifrada vai para o repositório; o texto puro fica ignorado pelo git.
 *
 *   npm run dados:cifrar
 */
import "./env";
import { readFileSync } from "node:fs";
import { cifrarCsvs, decifrar, lerCsvsDoDisco, PASTA_DADOS, type Csvs } from "../src/servidor/dados";

const senha = process.env.DADOS_SENHA;
if (!senha || senha.length < 16) {
  console.error("Defina DADOS_SENHA (pelo menos 16 caracteres) em .env.local antes de cifrar.");
  process.exit(1);
}
const escritos = cifrarCsvs(senha);
// Confere que o que foi escrito abre com a mesma senha e bate com o original.
const original = lerCsvsDoDisco();
const chaves: (keyof Csvs)[] = ["excecoes", "clientes", "transportadoras"];
chaves.forEach((chave, i) => {
  if (decifrar(readFileSync(escritos[i]), senha) !== original[chave]) throw new Error(`${escritos[i]}: conferência falhou`);
});
console.log(`[dados] ${escritos.length} arquivos cifrados em ${PASTA_DADOS}:`);
for (const c of escritos) console.log("  ", c);
