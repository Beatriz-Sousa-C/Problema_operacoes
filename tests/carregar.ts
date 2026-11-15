import { carregarBase } from "@/core";
import { lerCsvsDoDisco } from "@/servidor/dados";

/** Base do desafio: CSVs em texto puro em dados/ ou cifrados com DADOS_SENHA. */
export const baseReal = () => carregarBase(lerCsvsDoDisco());
