# Fila de exceções com agente de IA

Solução para o **Problema 2 (Operações)** do Desafio AI-First do Gogroup: receber a lista de pedidos com exceção, priorizar com a capacidade real do time, investigar as causas e ajudar a resolver, com um agente de IA decidindo e redigindo as tratativas.

- **Aplicação:** _link do Vercel_
- **Registro de decisões:** [DECISOES.md](DECISOES.md)

> Os dados são sintéticos e foram fornecidos para o processo seletivo. Este repositório e a aplicação devem ser retirados do ar ao fim do processo.

## Respostas, com números

**Quanto dinheiro está em risco, e quanto a solução recupera?**
Com 150 tratativas por dia, as 2.000 exceções levam 14 dias úteis para zerar. Pela ordem de chegada (processo atual), a perda esperada (reembolsos de quem cancela mais a margem das recompras perdidas) é de **R$ 132,4 mil**. Ordenando pelo custo de esperar, cai para **R$ 104,1 mil**: **R$ 28,3 mil recuperados e 140 cancelamentos a menos**, sem contratar ninguém. Desse total, R$ 100,4 mil já estão comprometidos pelo atraso acumulado até hoje e nenhuma ordem recupera; a solução captura 88% do que ainda dá para salvar. Para a ordem de chegada chegar ao mesmo resultado, o time precisaria de cerca de 840 tratativas por dia.

**Quais pedidos tratar hoje, e por quê?**
Os 150 com maior **custo de esperar**: quanto a perda esperada de cada pedido cresce se ele for para o fim da fila. A chance de cancelar sobe em faixas (4%, 10%, 22%, 40%) conforme os dias úteis de atraso, então um pedido com 2 dias de atraso tem muito a perder esperando, e um com 15 dias já está na faixa máxima. Tratar primeiro os mais atrasados, o instinto natural, recupera só R$ 5,2 mil.

**O que está causando as exceções?** Concentrações confirmadas por teste estatístico (duas proporções, correção de Bonferroni):

| Onde | Exceção | Ocorrências | Esperado | Vezes acima |
|---|---|---:|---:|---:|
| Cálculo da data prometida | Atraso dentro do prazo contratado | 157 de 497 | — | regra errada em 100% das datas |
| Rota Express no Nordeste | Atraso na entrega | 295 | 27,8 | 4,7× |
| CD2, turno da noite | Item faltante (com brinde) | 210 | 11,3 | 10,5× |
| Carga Norte | Avaria no transporte | 98 | 13,5 | 5,4× |
| Rota Express no Nordeste | Rastreio parado | 101 | 17,6 | 4,7× |
| SKU APC-1067, lote L2607-B | Vazamento | 74 | 0,3 | 29,6× |
| Impressora IMP-02 | Falha de personalização | 77 | 10,2 | 4,4× |
| Lescent (colônias em vidro) | Avaria no transporte | 64 | 6,5 | 6,2× |
| KSH-1010 | Ruptura pós-venda | 18 | 0,3 | 14,1× |

O excesso dessas causas custou cerca de **R$ 47,5 mil** em reenvios e contatos nos 60 dias.

**O que se resolve caso a caso e o que exige mudar o processo?**
A fila trata o pedido. As causas acima só param com mudança de processo: corrigir o cálculo da data prometida no checkout, calibrar a IMP-02, colocar o brinde no picking do CD2 noite, bloquear o lote L2607-B, rever a Rota Express no Nordeste e a embalagem das colônias Lescent. O agente escreve um plano de correção para cada uma.

## O agente de IA

O agente não é um chat: ele trabalha na fila do dia e produz tratativas executáveis.

1. **Decide a tratativa de cada grupo do dia** (mesmo tipo de exceção e mesma causa): ações, justificativa, modelo de mensagem ao cliente e um chamado único para a área responsável pelo lote.
2. **Investiga individualmente os casos sensíveis** (clientes de alto valor, clientes com várias exceções) num laço com ferramentas: consulta o pedido e o risco, o histórico do cliente, o desempenho da transportadora na região, as causas sistêmicas e a política, e termina registrando uma decisão estruturada. A trilha de consultas aparece na tela.
3. **Escreve planos de correção** para cada causa de processo.

**A IA propõe; o código decide.** Toda ação passa pela política em [`src/core/politica.ts`](src/core/politica.ts):

| Ação | Status |
|---|---|
| Mensagem informativa, pedido de foto, acionar transportadora | Automática para todos os clientes |
| Reenvio, nova produção ou substituto até R$ 65 | Automática |
| Reenvio, nova produção ou substituto acima de R$ 65, ou para cliente de alto valor | Precisa de aprovação |
| Reembolso, cancelamento | Sempre precisa de aprovação |
| Reenvio em avaria, vazamento e erro de personalização | Depois da foto do cliente, segue a regra acima |
| Ação fora da política para o tipo de exceção | Bloqueada |

A mensagem ao cliente segue o status da ação que ela anuncia: se o reenvio espera aprovação, a mensagem que o anuncia espera junto. Assim a empresa nunca promete o que ainda não foi aprovado. No dia de referência: 31 aprovações (todas com dinheiro), 36 ações esperando foto e 119 mensagens saindo na hora.

Se o modelo devolver algo fora do formato, o erro volta para ele corrigir. Se a IA estiver fora do ar ou sem cota, o sistema aplica a tratativa padrão da política e avisa na tela: a operação nunca para.

**Cabe na cota gratuita.** Decidir por grupo usa cerca de 20 chamadas por dia em vez de 150. O plano do dia é gerado no build, então quem abre o link vê o trabalho do agente sem gastar cota; investigações individuais rodam ao vivo pelo botão "Investigar com o agente".

## Arquitetura

```
public/dados/*.csv           dados do desafio
src/core/                    núcleo de domínio, TypeScript puro (roda no servidor, no navegador e nos testes)
  parametros.ts              parâmetros de negócio num único lugar
  calendario.ts              dias úteis com feriados (soma acumulada em cache, O(1) por consulta)
  dados.ts                   leitura, validação e remoção de duplicatas
  risco.ts                   valor em jogo, atraso, chance de cancelar, custo de esperar
  priorizacao.ts             estratégias de fila
  simulacao.ts               simulação dia a dia das estratégias
  causas.ts                  detecção estatística de causas e auditoria da data prometida
  politica.ts                ações permitidas e regras de autonomia
src/agente/                  agente de IA
  llm.ts                     interface do modelo + cliente Groq (espera do limite por minuto, troca de modelo)
  ferramentas.ts             ferramentas que o agente consulta e esquemas de saída (zod)
  investigador.ts            laço de raciocínio com ferramentas para um pedido
  planoDoDia.ts              plano por grupos, casos especiais e planos de correção
  protocolo.ts               o que o navegador pode pedir ao proxy
src/app/api/llm/route.ts     proxy do modelo: a chave fica só no servidor
src/ui/                      interface (React / Next.js)
scripts/gerar-plano.ts       gera o plano do agente antes do build
tests/                       testes (Vitest)
```

Escolhas que importam:
- **Um só núcleo de cálculo** para servidor, navegador e testes: o que a banca vê é o que foi testado. Por isso também dá para **carregar outra lista de exceções** e ver tudo recalculado no navegador.
- **O modelo é injetado por interface** (`ClienteLlm`): os testes usam um modelo falso roteirizado, e trocar de provedor não mexe no agente.
- **O proxy só aceita conversas do agente** (prompts e ferramentas conhecidos), para o link público não virar um chat grátis com a chave.

## Como rodar

```bash
npm install
npm test            # testes do núcleo e do agente
npm run relatorio   # números principais no terminal
npm run dev         # http://localhost:3000
```

Variáveis de ambiente (veja `.env.example`):

| Variável | Uso |
|---|---|
| `GROQ_API_KEY` | Chave da Groq. Sem ela, o app funciona com a tratativa padrão da política e avisa. |
| `GROQ_MODELOS` | Opcional. Modelos em ordem de preferência, separados por vírgula. |
| `NEXT_PUBLIC_REPO_URL` | Opcional. Link deste repositório, exibido na aba Método. |
| `FORCAR_PLANO` | Opcional. `1` para regenerar o plano do agente no build. |

## Publicar no Vercel

1. Importe o repositório no Vercel (framework detectado: Next.js).
2. Em Settings > Environment Variables, adicione `GROQ_API_KEY` e, se quiser, `NEXT_PUBLIC_REPO_URL`.
3. Faça o deploy. O build roda `scripts/gerar-plano.ts`, que gera o plano do dia com o agente (alguns minutos, por causa do limite por minuto da cota gratuita).

## Limitações conhecidas

- As premissas do modelo de perda estão em [DECISOES.md](DECISOES.md); a principal é que tratar um pedido não desfaz o risco que o atraso já criou.
- As causas usam os outros tipos de exceção como medida de volume, porque os dados não trazem o total de pedidos por máquina, turno ou transportadora.
- "Executar" uma ação significa registrá-la com a mensagem pronta: não há sistema real da empresa conectado. As aprovações ficam na sessão do navegador.
