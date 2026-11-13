import { readFileSync } from "node:fs";
import { join } from "node:path";
import { carregarBase } from "@/core";

const ler = (f: string) => readFileSync(join(__dirname, "..", "public", "dados", f), "utf8");

export const baseReal = () =>
  carregarBase({
    excecoes: ler("pedidos_excecao.csv"),
    clientes: ler("clientes.csv"),
    transportadoras: ler("transportadoras.csv"),
  });
