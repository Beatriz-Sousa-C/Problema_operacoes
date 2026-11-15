import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARQUIVOS, cifrar, cifrarCsvs, decifrar, lerCsvsDoDisco } from "@/servidor/dados";

const senha = "senha-de-teste-bem-longa-123";

describe("cifra dos dados", () => {
  it("cifra e decifra o mesmo texto; senha errada ou arquivo alterado falham", () => {
    const texto = "order_id,valor\nGC1,10.5\nçãõ";
    const cifrado = cifrar(texto, senha);
    expect(cifrado.toString("utf8")).not.toContain("GC1");
    expect(decifrar(cifrado, senha)).toBe(texto);
    expect(() => decifrar(cifrado, "outra-senha-bem-longa-12345")).toThrow(/senha/);
    const alterado = Buffer.from(cifrado);
    alterado[alterado.length - 1] ^= 0xff;
    expect(() => decifrar(alterado, senha)).toThrow();
    expect(() => decifrar(Buffer.from("lixo"), senha)).toThrow(/formato/);
  });

  it("lê texto puro quando existe e cai no cifrado quando não", () => {
    const pasta = mkdtempSync(join(tmpdir(), "dados-"));
    for (const [chave, nome] of Object.entries(ARQUIVOS)) writeFileSync(join(pasta, nome), `${chave}\n1`);
    expect(lerCsvsDoDisco({ pasta }).clientes).toBe("clientes\n1");

    const cifrada = mkdtempSync(join(tmpdir(), "dados-enc-"));
    for (const [chave, nome] of Object.entries(ARQUIVOS)) writeFileSync(join(cifrada, nome), `${chave}\n2`);
    cifrarCsvs(senha, cifrada);
    for (const nome of Object.values(ARQUIVOS)) unlinkSync(join(cifrada, nome));
    expect(lerCsvsDoDisco({ pasta: cifrada, senha }).excecoes).toBe("excecoes\n2");
    expect(() => lerCsvsDoDisco({ pasta: cifrada, senha: undefined })).toThrow(/DADOS_SENHA/);
  });

  it("os dados do desafio abrem (texto puro ou cifrado)", () => {
    const csvs = lerCsvsDoDisco();
    expect(csvs.excecoes.split("\n")[0]).toContain("tipo_excecao");
  });
});
