/**
 * Detecção de causas sistêmicas.
 *
 * Não temos o volume total de pedidos por máquina, turno ou transportadora
 * (só os pedidos com exceção). Para não confundir "tem mais problema" com
 * "tem mais volume", comparamos a PARTICIPAÇÃO de um tipo de exceção dentro do
 * grupo com a participação no resto da base: os outros tipos de exceção servem
 * como medida de volume. Um teste de duas proporções (unilateral) com correção
 * de Bonferroni separa concentração real de ruído.
 */
import type { ExcecaoAnalisada, TipoExcecao } from "./tipos";

export interface Dimensao {
  chave: string;
  rotulo: string;
  extrair: (e: ExcecaoAnalisada) => string | null;
}

export const DIMENSOES: Dimensao[] = [
  { chave: "maquina", rotulo: "Impressora", extrair: (e) => e.maquina },
  { chave: "cd_turno", rotulo: "CD e turno", extrair: (e) => `${e.cd}, turno da ${e.turno}` },
  { chave: "transportadora", rotulo: "Transportadora", extrair: (e) => e.transportadora },
  { chave: "transportadora_regiao", rotulo: "Transportadora e região", extrair: (e) => `${e.transportadora} no ${e.regiao}` },
  { chave: "lote", rotulo: "Lote", extrair: (e) => e.lote_produto },
  { chave: "sku", rotulo: "SKU", extrair: (e) => `${e.sku} (${e.descricao_produto})` },
  { chave: "marca", rotulo: "Marca", extrair: (e) => e.marca },
  { chave: "brinde", rotulo: "Pedido com brinde", extrair: (e) => (e.brinde_no_pedido ? "com brinde" : "sem brinde") },
];

export interface CausaSistemica {
  id: string;
  dimensao: string;
  grupo: string;
  tipo: TipoExcecao;
  /** Exceções desse tipo no grupo */
  observado: number;
  /** Quantas seriam esperadas se o grupo se comportasse como o resto da base */
  esperado: number;
  excesso: number;
  /** Participação do tipo dentro do grupo / no resto da base */
  taxaGrupo: number;
  taxaResto: number;
  lift: number;
  pValor: number;
  /** Custo direto estimado do excesso: reenvio + 1 contato de atendimento por exceção */
  custoDoExcesso: number;
  pedidos: string[];
  /** Outras leituras do mesmo problema (ex.: o SKU e o lote que se sobrepõem) */
  tambemVisivelEm: string[];
}

/** Φ(x) via aproximação de Abramowitz-Stegun para erf (erro < 1,5e-7). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Teste unilateral de duas proporções: H1 = taxa do grupo > taxa do resto. */
export function testeDuasProporcoes(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 1;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  return 1 - normalCdf((p1 - p2) / se);
}

export interface OpcoesCausas {
  alfa?: number;
  excessoMinimo?: number;
  liftMinimo?: number;
  /** Sobreposição de pedidos acima da qual duas causas são o mesmo problema */
  sobreposicaoParaFundir?: number;
  custoContato: number;
}

export function detectarCausas(excecoes: readonly ExcecaoAnalisada[], opcoes: OpcoesCausas): CausaSistemica[] {
  const { alfa = 0.01, excessoMinimo = 15, liftMinimo = 2, sobreposicaoParaFundir = 0.6, custoContato } = opcoes;
  // População elegível por tipo: só marcas onde o tipo pode ocorrer. Sem isso,
  // "falha de personalização" apareceria como problema da marca Gocase, quando
  // é apenas o único produto personalizado (exclusividade estrutural, não causa).
  const marcasElegiveis = new Map<TipoExcecao, Set<string>>();
  for (const e of excecoes) {
    const s = marcasElegiveis.get(e.tipo_excecao) ?? new Set<string>();
    s.add(e.marca);
    marcasElegiveis.set(e.tipo_excecao, s);
  }

  type Candidata = Omit<CausaSistemica, "tambemVisivelEm" | "id">;
  const candidatas: Candidata[] = [];
  let testes = 0;

  for (const dim of DIMENSOES) {
    const grupos = new Map<string, ExcecaoAnalisada[]>();
    for (const e of excecoes) {
      const g = dim.extrair(e);
      if (g === null) continue;
      const lista = grupos.get(g);
      if (lista) lista.push(e);
      else grupos.set(g, [e]);
    }
    if (grupos.size < 2) continue;

    // Base de comparação: só pedidos que têm valor na dimensão (impressoras
    // só existem para Gocase) e que são elegíveis ao tipo testado.
    const naDimensao = [...grupos.values()].flat();

    for (const tipo of marcasElegiveis.keys()) {
      const elegiveis = marcasElegiveis.get(tipo)!;
      const ehElegivel = (e: ExcecaoAnalisada) => elegiveis.has(e.marca);
      const nDim = naDimensao.filter(ehElegivel).length;
      const xDim = naDimensao.filter((e) => ehElegivel(e) && e.tipo_excecao === tipo).length;

      for (const [grupo, todos] of grupos) {
        const membros = todos.filter(ehElegivel);
        const doTipo = membros.filter((e) => e.tipo_excecao === tipo);
        const n1 = membros.length;
        const x1 = doTipo.length;
        const n2 = nDim - n1;
        const x2 = xDim - x1;
        if (x1 === 0 || n2 <= 0) continue;
        testes++;
        // Exclusividade estrutural (o tipo só existe nesse grupo): não é causa.
        if (x2 === 0) continue;
        const taxaGrupo = x1 / n1;
        const taxaResto = x2 / n2;
        // Esperado: o volume "não relacionado" do grupo com a proporção do resto.
        // Resolve x = taxaResto × (outros + x) → x = taxaResto × outros / (1 − taxaResto).
        const outros = n1 - x1;
        const esperado = taxaResto < 1 ? (taxaResto * outros) / (1 - taxaResto) : x1;
        const excesso = x1 - esperado;
        const lift = taxaResto > 0 ? taxaGrupo / taxaResto : Number.POSITIVE_INFINITY;
        const custoMedio = doTipo.reduce((s, e) => s + e.custoReenvio + custoContato, 0) / x1;
        candidatas.push({
          dimensao: dim.rotulo,
          grupo,
          tipo,
          observado: x1,
          esperado,
          excesso,
          taxaGrupo,
          taxaResto,
          lift,
          pValor: testeDuasProporcoes(x1, n1, x2, n2),
          custoDoExcesso: Math.max(0, excesso) * custoMedio,
          pedidos: doTipo.map((e) => e.id),
        });
      }
    }
  }

  const limiar = alfa / Math.max(1, testes); // Bonferroni
  const significativas = candidatas
    .filter((c) => c.pValor < limiar && c.excesso >= excessoMinimo && c.lift >= liftMinimo)
    .sort((a, b) => b.excesso - a.excesso);

  // Funde leituras do mesmo problema (mesmo tipo, mesmos pedidos), mantendo a
  // de maior lift, que é a explicação mais específica.
  const resultado: CausaSistemica[] = [];
  const porLift = [...significativas].sort((a, b) => b.lift - a.lift);
  for (const c of porLift) {
    const conjunto = new Set(c.pedidos);
    const dona = resultado.find((r) => {
      if (r.tipo !== c.tipo) return false;
      const inter = r.pedidos.filter((id) => conjunto.has(id)).length;
      return inter / Math.min(r.pedidos.length, c.pedidos.length) >= sobreposicaoParaFundir;
    });
    if (dona) dona.tambemVisivelEm.push(`${c.dimensao}: ${c.grupo}`);
    else resultado.push({ ...c, id: `${c.dimensao}|${c.grupo}|${c.tipo}`, tambemVisivelEm: [] });
  }
  return resultado.sort((a, b) => b.excesso - a.excesso);
}

/** Auditoria da data prometida: o sistema usa a regra de dias úteis? */
export interface AuditoriaPrazo {
  pedidos: number;
  divergentes: number;
  diasPrometidosAMenosMedio: number;
  diasPrometidosAMenosMax: number;
  /** Exceções de atraso que estão dentro do prazo contratado: o "atraso" foi criado pela promessa */
  atrasosDentroDoContrato: number;
  atrasosTotal: number;
  /** Datas prometidas que batem com a hipótese de dias corridos */
  batemComCorridos: number;
  /** Hipótese que explica pelo menos 95% das datas, se houver */
  regraObservada: string | null;
}

/** Fração mínima das datas que precisa bater com a hipótese: um erro de digitação não apaga o achado. */
const COBERTURA_MINIMA_REGRA = 0.95;

export function auditarPrazos(excecoes: readonly ExcecaoAnalisada[]): AuditoriaPrazo {
  // Pedidos com SLA estimado não servem de prova: o prazo deles não veio do contrato.
  const auditaveis = excecoes.filter((e) => !e.slaEstimado);
  const divergentes = auditaveis.filter((e) => e.data_prometida !== e.prazoContratado);
  const aMenos = auditaveis.map((e) => e.diasPrometidosAMenos);
  const atrasos = auditaveis.filter((e) => e.tipo_excecao === "atraso_entrega");

  // Testa a hipótese "dias corridos": prometida = pedido + 1 + SLA (corridos).
  const batemComCorridos = auditaveis.filter((e) => {
    const d = new Date(`${e.data_pedido}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1 + e.slaContratado);
    return d.toISOString().slice(0, 10) === e.data_prometida;
  }).length;
  const cobertura = auditaveis.length ? batemComCorridos / auditaveis.length : 0;

  return {
    pedidos: auditaveis.length,
    divergentes: divergentes.length,
    diasPrometidosAMenosMedio: aMenos.reduce((s, v) => s + v, 0) / Math.max(1, aMenos.length),
    diasPrometidosAMenosMax: aMenos.reduce((m, v) => Math.max(m, v), 0),
    atrasosDentroDoContrato: atrasos.filter((e) => e.atrasoVsContrato === 0).length,
    atrasosTotal: atrasos.length,
    batemComCorridos,
    regraObservada:
      auditaveis.length > 0 && cobertura >= COBERTURA_MINIMA_REGRA
        ? `data do pedido + 1 + SLA em dias CORRIDOS, em ${batemComCorridos.toLocaleString("pt-BR")} de ${auditaveis.length.toLocaleString("pt-BR")} datas (a regra manda contar dias úteis)`
        : null,
  };
}
