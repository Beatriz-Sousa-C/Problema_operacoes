/**
 * Carrega .env.local e .env como o Next faz, para os scripts que rodam fora
 * dele (prebuild, relatório). No Vercel as variáveis já vêm do ambiente.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
