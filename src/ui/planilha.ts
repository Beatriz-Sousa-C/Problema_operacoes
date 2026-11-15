/**
 * Converte as abas da exportação para o formato do write-excel-file.
 * Módulo puro (só tipos da biblioteca), para o conteúdo ser testado em Node.
 */
import type { CellObject, Sheet } from "write-excel-file/browser";
import type { Aba, Celula, Exportacao } from "./exportacao";

const celula = (v: Celula, larga: boolean): CellObject | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return { value: v, type: Number };
  return { value: v, type: String, wrap: larga };
};

/** `F` é o tipo de conteúdo de imagem da biblioteca (Blob no navegador, Buffer em Node); não usamos imagens. */
export function planilhaDe<F = Blob>(aba: Aba): Sheet<F> {
  const n = aba.colunas.length;
  const linhas: (CellObject | null)[][] = [];
  // Célula mesclada na largura da tabela: as demais células da linha ficam nulas, como a biblioteca pede.
  for (const p of aba.preambulo) {
    linhas.push([{ value: p, type: String, wrap: true, columnSpan: n, fontWeight: "bold", backgroundColor: "#E8EFFB", height: Math.min(120, 15 * Math.ceil(p.length / 110) + 6) }, ...Array<null>(Math.max(0, n - 1)).fill(null)]);
  }
  linhas.push(aba.colunas.map((c) => ({ value: c.titulo, type: String, fontWeight: "bold", backgroundColor: "#F3F5F9" })));
  for (const l of aba.linhas) linhas.push(l.celulas.map((v, i) => celula(v, (aba.colunas[i]?.largura ?? 0) >= 30) ?? { value: "" }));
  return {
    sheet: aba.nome,
    data: linhas,
    columns: aba.colunas.map((c) => ({ width: c.largura ?? 14 })),
    stickyRowsCount: aba.preambulo.length + 1,
  };
}

export const planilhasDe = <F = Blob>(exp: Exportacao): Sheet<F>[] => exp.abas.map((a) => planilhaDe<F>(a));
