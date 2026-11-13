import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // As rotas do agente leem os CSVs originais do disco: precisam ir junto no deploy.
  outputFileTracingIncludes: {
    "/api/agente/**": ["./public/dados/**"],
  },
};

export default config;
