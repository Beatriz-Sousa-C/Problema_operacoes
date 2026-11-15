# Central de exceções, com agente de IA

Solução para o **Problema 2 (Operações)** do Desafio AI-First do Gogroup: receber a lista de pedidos com exceção, priorizar com a capacidade real do time, investigar as causas e ajudar a resolver, com um agente de IA decidindo e redigindo as tratativas e uma pessoa aprovando o que envolve dinheiro.

- **Aplicação:** _link do Vercel_
- **Registro de decisões:** [DECISOES.md](DECISOES.md)

> Os dados são sintéticos e foram fornecidos para o processo seletivo. Eles **não estão em texto puro neste repositório** (só a versão cifrada) e a aplicação nunca os serve como arquivo. Repositório e aplicação devem ser retirados do ar ao fim do processo.

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

1. **Decide a tratativa de cada grupo do dia** (mesmo tipo de exceção e mesma causa): ações, justificativa com os números do grupo, modelo de mensagem ao cliente e um chamado único para a área responsável pelo lote.
2. **Investiga individualmente os casos sensíveis** (clientes de alto valor, clientes com várias exceções) num laço com ferramentas: consulta o pedido e o risco, o histórico do cliente, o desempenho da transportadora na região, as causas de processo e a política, e termina registrando uma decisão estruturada. A trilha de consultas aparece na tela, em linguagem simples.
3. **Escreve planos de correção** para cada causa de processo, endereçados à área responsável.

**A IA propõe; o código decide.** Toda ação passa pela política em [`src/core/politica.ts`](src/core/politica.ts):

| Ação | Status |
|---|---|
| Mensagem informativa, pedido de foto, acionar transportadora | Automática para todos os clientes |
| Reenvio, nova produção, substituto, reembolso, cancelamento (qualquer valor) | Sempre precisa de aprovação humana |
| Reenvio e nova produção em avaria, vazamento e erro de personalização | O pedido de foto sai na hora; depois da foto, vai para aprovação |
| Ação fora da política para o tipo de exceção | Bloqueada |

A mensagem ao cliente segue o status de **todas** as ações com dinheiro que ela anuncia: só sai quando todas forem aprovadas (e, quando a política exige, depois da foto). Se alguma for recusada, a tela marca a mensagem como "não enviar". **O texto da mensagem também é conferido pelo código**, não só pelo prompt: não pode ter link, não pode prometer reembolso ou cancelamento que não esteja entre as ações e não pode citar números internos de risco. Se violar, o erro volta ao modelo para corrigir uma vez; se insistir, vale a tratativa padrão da política. No dia de referência: 48 ações com dinheiro esperando aprovação (41 reenvios e 7 substitutos), agrupadas em 5 decisões, 36 esperando a foto e 102 mensagens saindo na hora.

### Como usar

- **Visão geral:** os números que importam (perda hoje, perda com a solução, cancelamentos evitados, causas), o que o agente já preparou, o briefing do dia e o gráfico das três estratégias.
- **Trabalho de hoje:** o que o agente fez (grupos, chamados, investigações, mensagens), a exportação em lotes e o que falta, em três passos. **1. Decidir** as ações com dinheiro, agrupadas como o agente decidiu, cada grupo com custo, valor em jogo e a recomendação com o motivo; um clique aprova o grupo, ou abre-se a lista para decidir caso a caso. **2. Registrar** as fotos que os clientes mandarem. **3. Enviar** as mensagens liberadas, com "Copiar" e "Marcar como enviada". Depois, **exportar** o lote para quem executa. O registro e os lotes ficam salvos no navegador e podem ser apagados com "Recomeçar o dia".
- **Fila completa:** a tabela do dia inteira, com filtros; cada pedido abre um painel com a situação, a tratativa, as mensagens e a investigação do agente.
- **Causas de processo** (com o ganho mensal de cada correção), **Ontem × hoje** (comparação com a lista do dia seguinte), **Simulador** (outra capacidade do time) e **Método** (premissas e parâmetros).

### Briefing do dia para a liderança

Uma chamada ao modelo por dia, no build: o agente recebe só os números já calculados (fila, perdas por estratégia, o que depende de aprovação, causas com a projeção mensal, auditoria da data prometida) e escreve um título com o número do dia, 2 a 4 parágrafos e 3 a 5 prioridades acionáveis com área responsável. Sai na Visão geral com "Copiar para enviar à liderança". Sem IA, a mesma estrutura é montada pela política com os mesmos números; com link ou formato errado, o erro volta ao modelo uma vez e depois vale a versão por regras.

### Ontem × hoje: fechar o ciclo

Quando a lista do dia seguinte chega (basta carregá-la), o sistema compara com a original: **resolvidas** (saíram da lista), **continuam** (com o atraso médio de antes e de agora), **novas** (por tipo) e **reincidência** (novas ligadas a causas já conhecidas). O cartão **previsto × realizado** mostra quanto dos pedidos priorizados pela fila de fato saiu, contra os deixados para depois e contra os que tiveram ação aprovada pela pessoa; a tabela de causas marca cada uma como piorou, melhorou, estável, nova ou não aparece mais. A data de referência de qualquer lista é inferida da própria lista (a mais recente entre abertura, pedido e entrega), então os números da lista original não mudam. Sem a lista real, um botão **simula a lista de amanhã** (determinística: parte da fila se resolve, o resto envelhece um dia útil, entram exceções novas repetindo as causas conhecidas), claramente marcada como demonstração.

### Placar de confiança no agente

Conforme a pessoa aprova ou recusa, a Visão geral e o Trabalho de hoje mostram quantas recomendações foram aprovadas (e a taxa) e em que tipo de exceção e ação as recusas se concentram. É o critério para a empresa ampliar a autonomia com o tempo, e mostra onde o agente erra.

### Ganho mensal de cada causa

Cada causa de processo traz "corrigir evita cerca de N exceções e R$ X por mês" (o excesso observado em 60 dias levado a 30), e a aba Causas soma o ganho mensal se tudo for corrigido. Transforma a lista de causas numa fila de investimento.

### Link direto para um pedido

Abrir um pedido coloca `#fila?pedido=GC7004826` no endereço, e o painel tem "Copiar link do pedido": serve para colar num chamado ou numa mensagem interna. Quem abre o link cai direto no pedido.

### Exportar para quem executa

Não há integração com transportadoras, CD, financeiro ou atendimento, então aprovar precisa ter um destino: em **Trabalho de hoje**, o cartão "Exportar para quem executa" gera no navegador (sem servidor) um arquivo pronto para encaminhar a cada área:

| Aba | O que leva |
|---|---|
| Resumo | data da fila, lote, hora, modelo do agente, contagens e custo total aprovado |
| Uma por transportadora | começa com o **chamado em lote escrito pelo agente** e lista os pedidos com acionamento liberado ou com ação aprovada que gera pedido de indenização ou sinistro (extravio, rastreio parado, devolvido, avaria): destino, exceção, datas prometida e contratada, atraso, ação solicitada, causa de processo |
| Reenvios e produção | reenvios, novas produções e substitutos aprovados: SKU, produto, quantidade, CD, turno, lote, impressora, custo, foto recebida, justificativa do agente |
| Reembolsos e cancelamentos | ações financeiras aprovadas, com valor e justificativa |
| Mensagens | mensagens liberadas por pedido, com status (a enviar ou enviada) e quem escreveu |
| Chamados internos | chamados do agente para CD, qualidade, manutenção e afins, com a lista de pedidos |
| Recusas | o que a pessoa recusou, com o custo que teria, para auditoria |

Cada exportação vira um **lote numerado**: o próximo traz só o que foi aprovado ou liberado depois. Para ninguém perder nada por um clique errado: a prévia mostra o que vai entrar antes de baixar; o último lote pode ser **desfeito**; qualquer lote pode ser **baixado de novo**, idêntico, porque é recalculado do registro; e **exportar o dia inteiro** está sempre disponível, sem mexer nos lotes. XLSX é o padrão (`write-excel-file`, gerado no navegador); cada aba também sai em CSV (`;`, BOM UTF-8), sem fechar o lote. O painel do pedido mostra em que lote cada ação ou mensagem saiu.

Se o modelo devolver algo fora do formato, o erro volta para ele corrigir. Se a IA estiver fora do ar ou sem cota, o sistema aplica a tratativa padrão da política e avisa na tela: a operação nunca para.

### Custo da IA sob controle

- **Decisão por grupo:** cerca de 20 chamadas por dia em vez de 150 investigações completas.
- **Plano gerado no build:** quem abre o link vê o trabalho do agente sem gastar cota. Investigações ao vivo rodam pelo botão "Investigar com o agente"; "Pedir ao agente um plano novo" refaz o dia (17 grupos e 2 investigações).
- **Investigação curta:** no máximo 6 passos e 4 consultas antes de decidir; cada passo reenvia a conversa, então isso é o que mantém uma investigação em cerca de 15 mil tokens.
- **Limite medido em tokens:** a cota gratuita da Groq é limitada sobretudo por tokens por dia (100 a 200 mil por modelo). Por IP, 8 investigações e 40 decisões de grupo a cada 10 minutos; teto global de 400 chamadas **e 400 mil tokens** por dia, que vira à meia-noite de Brasília. Ao atingir um limite, a tela mostra a tratativa da política com um aviso, sem erro. Tudo ajustável por variável de ambiente.
- **Troca automática de modelo** quando a cota de um acaba, e **timeout de 60 s por chamada**: uma requisição pendurada nunca trava o build nem a rota.

### Segurança dos dados e da chave

- **Os CSVs não ficam em `public/`** e não são servidos como arquivo estático. No repositório existe só a versão cifrada (`dados/*.csv.enc`, AES-256-GCM, chave derivada por scrypt). O servidor decifra em memória com `DADOS_SENHA`.
- O navegador recebe os dados pela rota `/api/dados`, com `Cache-Control: private, no-store` e `noindex`. A tela precisa deles para calcular a fila localmente (é o que permite carregar outra lista e simular outra capacidade sem servidor), então quem usa a aplicação vê os pedidos; quem não usa não baixa nada.
- **O agente roda no servidor e só recebe ids.** Não existe campo de texto livre que chegue ao modelo, então o link público não vira um chat com a chave. A chave da Groq nunca sai do servidor.
- Cabeçalhos: `X-Robots-Tag: noindex`, `Content-Security-Policy` só com a própria origem, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`; `robots.txt` bloqueia tudo.
- Dados do pedido entram no prompt como dados, com a instrução de ignorar qualquer texto que pareça ordem; a saída é validada por esquema e passa pela política, então um texto malicioso num campo não vira ação.

## Arquitetura

```
dados/                       CSVs do desafio: *.csv.enc no git; *.csv em texto puro só localmente (ignorado)
  gerado/plano.json          plano do agente gerado no build (ignorado)
src/core/                    núcleo de domínio, TypeScript puro (roda no servidor, no navegador e nos testes)
  parametros.ts              parâmetros de negócio num único lugar
  calendario.ts              dias úteis com feriados (soma acumulada em cache, O(1) por consulta)
  dados.ts                   leitura tolerante (BOM, ";", vírgula decimal, dd/mm/aaaa), validação por linha e remoção de duplicatas
  risco.ts                   valor em jogo, atraso, chance de cancelar, custo de esperar
  priorizacao.ts             estratégias de fila
  simulacao.ts               simulação dia a dia das estratégias
  causas.ts                  detecção estatística de causas e auditoria da data prometida
  politica.ts                ações permitidas, autonomia, dependências das mensagens e conferência do texto
  execucao.ts                estado de cada ação e mensagem depois de foto, aprovações e recusas
src/agente/                  agente de IA
  llm.ts                     interface do modelo + cliente Groq (espera do limite por minuto, troca de modelo, prazo, timeout)
  ferramentas.ts             ferramentas que o agente consulta e esquemas de saída (zod)
  investigador.ts            laço de raciocínio com ferramentas para um pedido
  planoDoDia.ts              plano por grupos, casos especiais, planos de correção e briefing do dia
  servidor.ts                só servidor: dados, cliente do modelo com a chave, limitador
  limite.ts                  só servidor: limite por IP e teto diário de chamadas e tokens
src/servidor/dados.ts        só servidor: leitura dos CSVs (texto puro ou cifrados) e cifra
src/app/api/dados            entrega dados e plano ao navegador (nunca arquivo estático)
src/app/api/agente/          rotas do agente (investigar, grupo): recebem só ids
src/ui/                      interface (React / Next.js): casca com barra lateral, telas e componentes
  comparacao.ts              ontem × hoje e a lista de amanhã simulada (puro)
  exportacao.ts              monta as planilhas por destino a partir do dia, do registro e do plano (puro)
  lotes.ts                   lotes de exportação: fechar, desfazer, reproduzir (puro)
  planilha.ts / baixar.ts    conversão para XLSX (write-excel-file) e CSV, download no navegador
scripts/gerar-plano.ts       gera o plano do agente antes do build
scripts/cifrar-dados.ts      cifra os CSVs para o repositório
tests/                       testes (Vitest)
```

Escolhas que importam:
- **Um só núcleo de cálculo** para servidor, navegador e testes: o que a banca vê é o que foi testado. Por isso também dá para **carregar outra lista de exceções** e ver tudo recalculado no navegador.
- **O modelo é injetado por interface** (`ClienteLlm`): os testes usam um modelo falso roteirizado, e trocar de provedor não mexe no agente.
- **O agente roda no servidor e só recebe ids**, para o link público não virar um chat grátis com a chave.

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha DADOS_SENHA (e GROQ_API_KEY, se tiver)
npm test                     # testes do núcleo, do agente, da cifra e da interface
npm run relatorio            # números principais no terminal
npm run dev                  # http://localhost:3000
```

Os CSVs originais podem ficar em `dados/` em texto puro (o git os ignora) ou só na versão cifrada com `DADOS_SENHA`. Depois de mudar um CSV, `npm run dados:cifrar` atualiza os `.enc`.

Variáveis de ambiente (veja `.env.example`):

| Variável | Uso |
|---|---|
| `DADOS_SENHA` | **Obrigatória no deploy.** Senha que abre `dados/*.csv.enc`. |
| `GROQ_API_KEY` | Chave da Groq. Sem ela, o app funciona com a tratativa padrão da política e avisa. |
| `GROQ_MODELOS` | Opcional. Modelos em ordem de preferência, separados por vírgula. |
| `NEXT_PUBLIC_REPO_URL` | Opcional. Link deste repositório, exibido na aba Método. |
| `FORCAR_PLANO` | Opcional. `1` para regenerar o plano do agente no build. |
| `LIMITE_IA_POR_IP` | Opcional. Investigações por IP a cada 10 minutos (padrão 8; decisões de grupo, 5 vezes isso). |
| `LIMITE_IA_DIARIO` | Opcional. Chamadas ao modelo por dia, somando todos os visitantes (padrão 400). |
| `LIMITE_IA_TOKENS_DIARIO` | Opcional. Tokens por dia, somando todos os visitantes (padrão 400.000). |

## Publicar no Vercel

1. Importe o repositório no Vercel (framework detectado: Next.js).
2. Em Settings > Environment Variables, adicione `DADOS_SENHA` e `GROQ_API_KEY` (e, se quiser, `NEXT_PUBLIC_REPO_URL`).
3. Faça o deploy. O build roda `scripts/gerar-plano.ts`, que gera o plano do dia com o agente (alguns minutos, por causa do limite por minuto da cota gratuita). Sem a chave, o plano sai pela política e a tela avisa.

## Limitações conhecidas

- As premissas do modelo de perda estão em [DECISOES.md](DECISOES.md); a principal é que tratar um pedido não desfaz o risco que o atraso já criou.
- As causas usam os outros tipos de exceção como medida de volume, porque os dados não trazem o total de pedidos por máquina, turno ou transportadora.
- "Executar" uma ação significa registrá-la com a mensagem pronta: não há sistema real da empresa conectado. Fotos, aprovações e recusas ficam salvas no navegador de quem opera, não num servidor compartilhado.
- O limite de uso fica na memória de cada instância do servidor: é aproximado (o Vercel pode rodar mais de uma cópia). O limite final é a própria cota da Groq; ao estourar, o app usa a política e não quebra.
- Uma lista carregada pelo navegador é validada linha a linha: linhas com erro são ignoradas e listadas na Visão geral. Transportadora × UF fora da tabela usa SLA e frete estimados pela mediana da transportadora. Os feriados cobrem os nacionais de 2025 a 2027.
- **No Windows**, rode `npm run build` a partir do caminho com a grafia real da pasta (por exemplo `D:\usuario\...`, e não `D:\Usuario\...`): com a grafia diferente, o Node carrega os módulos duas vezes e a pré-renderização do Next falha com `Cannot read properties of null (reading 'useContext')`. No Vercel (Linux) isso não acontece.
