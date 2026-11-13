# Fila de exceções com agente de IA

Solução para o **Problema 2 (Operações)** do Desafio AI-First do Gogroup: receber a lista de pedidos com exceção, priorizar com a capacidade real do time, investigar as causas e ajudar a resolver, com um agente de IA decidindo e redigindo as tratativas.

- **Aplicação:** _link do Vercel_
- **Registro de decisões:** [DECISOES.md](DECISOES.md)

> Os dados são sintéticos e foram fornecidos para o processo seletivo. Este repositório e a aplicação devem ser retirados do ar ao fim do processo.

## Respostas, com números

**Quanto dinheiro está em risco, e quanto a solução recupera?**
Com 150 tratativas por dia, as 2.000 exceções levam 14 dias úteis para zerar. Pela ordem de chegada (processo atual), a perda esperada (reembolsos de quem cancela mais a margem das recompras perdidas) é de **R$ 112,7 mil**. Ordenando pelo custo de esperar, cai para **R$ 88,6 mil**: **R$ 24,1 mil recuperados e 139 cancelamentos a menos**, sem contratar ninguém. Desse total, R$ 85,2 mil já estão comprometidos pelo atraso acumulado até hoje e nenhuma ordem recupera; a solução captura 88% do que ainda dá para salvar. Para a ordem de chegada chegar ao mesmo resultado, o time precisaria de cerca de 820 tratativas por dia. (O valor futuro de um cliente com várias exceções abertas é dividido entre elas: ele só pode ir embora uma vez.)

**Quais pedidos tratar hoje, e por quê?**
Os 150 com maior **custo de esperar**: quanto a perda esperada de cada pedido cresce se ele for para o fim da fila. A chance de cancelar sobe em faixas (4%, 10%, 22%, 40%) conforme os dias úteis de atraso, então um pedido com 2 dias de atraso tem muito a perder esperando, e um com 15 dias já está na faixa máxima. Tratar primeiro os mais atrasados, o instinto natural, recupera só R$ 4,5 mil.

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
| Reenvio, nova produção, substituto, reembolso, cancelamento (qualquer valor) | Sempre precisa de aprovação humana |
| Reenvio e nova produção em avaria, vazamento e erro de personalização | O pedido de foto sai na hora; depois da foto, vai para aprovação |
| Ação fora da política para o tipo de exceção | Bloqueada |

A mensagem ao cliente segue o status de **todas** as ações com dinheiro que ela anuncia: só sai quando todas forem aprovadas (e, quando a política exige, depois da foto). Se alguma for recusada, a tela marca a mensagem como "não enviar". Assim a empresa nunca promete o que não foi aprovado. No dia de referência, pela política: 48 ações com dinheiro esperando aprovação (41 reenvios e 7 substitutos), 36 esperando a foto (e depois a aprovação) e 102 mensagens saindo na hora (66 informativas e 36 pedidos de foto).

### Como usar (aba "Hoje")

O agente analisa e prepara; a pessoa decide o que envolve dinheiro e envia. A aba **Hoje** mostra o que o agente já fez (grupos decididos, chamados em lote, investigações, mensagens escritas) e o que falta em três passos:

1. **Para você decidir:** as ações com dinheiro agrupadas como o agente decidiu, cada grupo com o custo, o valor em jogo e a recomendação do agente com o motivo. Um clique aprova ou recusa o grupo inteiro; dá para abrir a lista e decidir caso a caso. No dia de referência, as 48 ações com dinheiro viram 5 decisões.
2. **Esperando o cliente:** pedidos que aguardam a foto. "Foto recebida" leva o caso ao passo 1.
3. **Prontas para enviar:** mensagens liberadas, agrupadas, com "Copiar" e "Marcar como enviada". Mensagens que anunciavam uma ação recusada aparecem em "Não enviar".

Uma barra mostra quantos dos 150 pedidos do dia estão concluídos. O registro fica salvo no navegador (sobrevive à troca de abas e ao recarregar a página) e pode ser apagado com "Recomeçar o dia". A aba **Fila completa** mostra a tabela inteira para consulta.

Se o modelo devolver algo fora do formato, o erro volta para ele corrigir. Se a IA estiver fora do ar ou sem cota, o sistema aplica a tratativa padrão da política e avisa na tela: a operação nunca para.

**Cabe na cota gratuita.** Decidir por grupo usa cerca de 20 chamadas por dia em vez de 150. O plano do dia é gerado no build, então quem abre o link vê o trabalho do agente sem gastar cota; investigações individuais rodam ao vivo pelo botão "Investigar com o agente".

**O agente roda no servidor.** O navegador manda só o id do pedido (ou a chave do grupo); o servidor monta a conversa inteira com o modelo. Não existe nenhum campo de texto livre que chegue à IA, então o link público não vira um chat grátis com a chave. A IA ao vivo funciona com a lista original; uma lista carregada pelo navegador usa a tratativa da política.

**Limite de uso folgado.** Por IP, 30 investigações e 60 decisões de grupo a cada 10 minutos, e um teto global de 1.500 chamadas ao modelo por dia. Serve para barrar robôs, não para atrapalhar quem avalia: vários avaliadores na mesma rede somam bem menos que isso. Ao atingir um limite, a tela mostra a tratativa da política com um aviso, sem erro. Os limites mudam por variável de ambiente, sem mexer no código.

## Arquitetura

```
public/dados/*.csv           dados do desafio
src/core/                    núcleo de domínio, TypeScript puro (roda no servidor, no navegador e nos testes)
  parametros.ts              parâmetros de negócio num único lugar
  calendario.ts              dias úteis com feriados (soma acumulada em cache, O(1) por consulta)
  dados.ts                   leitura tolerante (BOM, ";", vírgula decimal, dd/mm/aaaa), validação por linha e remoção de duplicatas
  risco.ts                   valor em jogo, atraso, chance de cancelar, custo de esperar
  priorizacao.ts             estratégias de fila
  simulacao.ts               simulação dia a dia das estratégias
  causas.ts                  detecção estatística de causas e auditoria da data prometida
  politica.ts                ações permitidas, regras de autonomia e dependências das mensagens
  execucao.ts                estado de cada ação e mensagem depois de foto, aprovações e recusas
src/agente/                  agente de IA
  llm.ts                     interface do modelo + cliente Groq (espera do limite por minuto, troca de modelo, prazo)
  ferramentas.ts             ferramentas que o agente consulta e esquemas de saída (zod)
  investigador.ts            laço de raciocínio com ferramentas para um pedido
  planoDoDia.ts              plano por grupos, casos especiais e planos de correção
  servidor.ts                só servidor: dados originais, cliente do modelo com a chave
  limite.ts                  só servidor: limite por IP e teto diário de chamadas
src/app/api/agente/          rotas do agente (investigar, grupo): recebem só ids
src/ui/                      interface (React / Next.js)
scripts/gerar-plano.ts       gera o plano do agente antes do build
tests/                       testes (Vitest)
```

Escolhas que importam:
- **Um só núcleo de cálculo** para servidor, navegador e testes: o que a banca vê é o que foi testado. Por isso também dá para **carregar outra lista de exceções** e ver tudo recalculado no navegador.
- **O modelo é injetado por interface** (`ClienteLlm`): os testes usam um modelo falso roteirizado, e trocar de provedor não mexe no agente.
- **O agente roda no servidor e só recebe ids**, para o link público não virar um chat grátis com a chave.

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
| `LIMITE_IA_POR_IP` | Opcional. Investigações por IP a cada 10 minutos (padrão 30; decisões de grupo, o dobro). |
| `LIMITE_IA_DIARIO` | Opcional. Chamadas ao modelo por dia, somando todos os visitantes (padrão 1.500). |

## Publicar no Vercel

1. Importe o repositório no Vercel (framework detectado: Next.js).
2. Em Settings > Environment Variables, adicione `GROQ_API_KEY` e, se quiser, `NEXT_PUBLIC_REPO_URL`.
3. Faça o deploy. O build roda `scripts/gerar-plano.ts`, que gera o plano do dia com o agente (alguns minutos, por causa do limite por minuto da cota gratuita).

## Limitações conhecidas

- As premissas do modelo de perda estão em [DECISOES.md](DECISOES.md); a principal é que tratar um pedido não desfaz o risco que o atraso já criou.
- As causas usam os outros tipos de exceção como medida de volume, porque os dados não trazem o total de pedidos por máquina, turno ou transportadora.
- "Executar" uma ação significa registrá-la com a mensagem pronta: não há sistema real da empresa conectado. Fotos, aprovações e recusas ficam salvas no navegador de quem opera, não num servidor compartilhado.
- O limite de uso fica na memória de cada instância do servidor: é aproximado (o Vercel pode rodar mais de uma cópia). O limite final é a própria cota da Groq; ao estourar, o app usa a política e não quebra.
- Uma lista carregada pelo navegador é validada linha a linha: linhas com erro são ignoradas e listadas no Resumo. Transportadora × UF fora da tabela usa SLA e frete estimados pela mediana da transportadora. Os feriados cobrem os nacionais de 2025 a 2027.
