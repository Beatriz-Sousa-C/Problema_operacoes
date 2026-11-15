import type { NextConfig } from "next";

const producao = process.env.NODE_ENV === "production";

/**
 * Cabeçalhos de segurança. A aplicação é pública, mas trata dados da operação:
 * não deve ser indexada, embutida em outro site nem carregar nada de fora.
 */
const cabecalhos = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(producao
    ? [
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
      ]
    : []),
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // As rotas leem os dados cifrados e o plano gerado no build, que ficam fora de public/.
  outputFileTracingIncludes: {
    "/api/**": ["./dados/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

export default config;
