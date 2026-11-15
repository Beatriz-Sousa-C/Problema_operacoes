"use client";
/** Downloads no navegador: XLSX (write-excel-file) e CSV (Blob). Nada passa pelo servidor. */
import writeXlsxFile from "write-excel-file/browser";
import { nomeDoArquivo, paraCsv, type Aba, type Exportacao } from "./exportacao";
import { planilhasDe } from "./planilha";

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function baixarXlsx(exp: Exportacao): Promise<string> {
  const nome = nomeDoArquivo(exp.dataReferencia, exp.numeroLote, "xlsx");
  const arquivo = await writeXlsxFile(planilhasDe(exp), { fontFamily: "Calibri", fontSize: 11 });
  baixarBlob(await arquivo.toBlob(), nome);
  return nome;
}

export function baixarCsv(exp: Exportacao, aba: Aba): string {
  const nome = nomeDoArquivo(exp.dataReferencia, exp.numeroLote, "csv", aba);
  baixarBlob(new Blob([paraCsv(aba)], { type: "text/csv;charset=utf-8" }), nome);
  return nome;
}
