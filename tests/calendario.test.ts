import { describe, expect, it } from "vitest";
import { Calendario, feriadosNacionais, paraDia, PARAMETROS, pascoa } from "@/core";

describe("feriados nacionais", () => {
  it("calcula a Páscoa e a Sexta-feira Santa", () => {
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
    expect(feriadosNacionais(2026)).toContain("2026-04-03");
  });
  it("inclui as datas fixas, inclusive 20/11", () => {
    for (const d of ["2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]) {
      expect(PARAMETROS.feriados).toContain(d);
    }
  });
});

const cal = new Calendario(PARAMETROS.feriados);

describe("Calendario", () => {
  it("pedido na sexta, sábado ou domingo: segunda é o dia 1 (exemplo do parametros.md)", () => {
    // 2026-09-11 é sexta; SLA 0 devolve o próprio dia 1
    for (const pedido of ["2026-09-11", "2026-09-12", "2026-09-13"]) {
      expect(cal.prazoContratado(pedido, 0)).toBe("2026-09-14");
    }
  });

  it("pula o feriado de 07/09 ao contar o SLA", () => {
    // pedido sexta 04/09 → dia 1 = terça 08/09 (07/09 é feriado); +3 úteis = sexta 11/09
    expect(cal.prazoContratado("2026-09-04", 3)).toBe("2026-09-11");
  });

  it("conta atraso como dias úteis em (prometida, fim]", () => {
    // prometida sábado 26/09, hoje quarta 30/09 → seg, ter, qua = 3
    expect(cal.diasUteisEntre(paraDia("2026-09-26"), paraDia("2026-09-30"))).toBe(3);
    expect(cal.diasUteisEntre(paraDia("2026-09-30"), paraDia("2026-09-30"))).toBe(0);
    expect(cal.diasUteisEntre(paraDia("2026-10-05"), paraDia("2026-09-30"))).toBe(0);
  });

  it("o cache de somas acumuladas dá o mesmo resultado que a contagem direta", () => {
    const ingenuo = (a: number, b: number) => {
      let n = 0;
      for (let d = a + 1; d <= b; d++) if (cal.ehDiaUtil(d)) n++;
      return n;
    };
    const ini = paraDia("2026-07-01");
    for (let a = ini; a < ini + 60; a += 7) for (let b = a; b < a + 50; b += 3) {
      expect(cal.diasUteisEntre(a, b)).toBe(ingenuo(a, b));
    }
  });
});
