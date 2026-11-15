# Registro de decisões

Cada decisão com as alternativas consideradas, os números que a sustentaram e o porquê. As decisões marcadas como **de negócio** foram tomadas por mim a partir de opções apresentadas com números; as **técnicas**, pela implementação.

## 1. Problema escolhido: Operações (negócio)

Os três problemas foram avaliados com os dados na mão.
- **Atendimento** tinha a tarefa mais "nativa" de IA (classificar texto), mas classificar 4.000 conversas consome de 2 a 3 milhões de tokens, cerca de duas semanas da cota gratuita da Groq (cerca de 200 mil tokens por dia nos modelos maiores), e as tags manuais não servem de gabarito para medir acerto.
- **Estoque** tinha o maior valor financeiro, mas a decisão de compra é matemática (previsão, estoque de segurança, otimização com orçamento): a IA ficaria decorativa, o que fere a regra do desafio.
- **Operações** tinha parâmetros que permitem colocar reais em cada decisão, causas escondidas nítidas e um volume (150 por dia) que cabe na cota. Foi a escolha.

## 2. Valor em jogo inclui o valor futuro do cliente (negócio)

- **A)** Só a perda imediata (reembolso esperado): os 575 pedidos já entregues com problema (avaria, item faltante, vazamento) teriam risco zero e nunca chegariam ao topo; só 13 clientes de alto valor entrariam nos 150 do dia.
- **B, escolhida)** Perda imediata + recompra ameaçada, com os parâmetros da empresa: recompra de 70% (receita acima de R$ 1.500) ou 28%, cortada pela metade quando a exceção é mal resolvida.

## 3. A recompra considera a frequência de compra (negócio)

O modelo inicial contava uma única compra futura, tratando igual quem compra todo mês e quem compra uma vez por ano. Havia 52 clientes que compram uma vez por mês ou mais, mas gastaram menos de R$ 1.500, tratados como comuns.
- **Escolhido:** margem das compras esperadas em 12 meses = frequência histórica × ticket médio × margem de 76%.
- **Proteções:** mínimo de 6 meses de histórico (sem isso, cliente novo com 2 pedidos em 1 mês valeria 24 compras por ano) e teto de 24 compras por ano (há clientes com 34 pedidos em 2 meses, provavelmente revendedores ou erro de cadastro).
- **Premissa:** o parâmetro da empresa diz só que o cliente recompra pelo menos uma vez em 12 meses; supor que ele mantém o ritmo histórico é nossa.
- **Ajuste posterior (negócio): a recompra é dividida entre as exceções abertas do cliente.** 522 clientes têm mais de uma exceção aberta, e o modelo somava as compras futuras inteiras em cada uma: um cliente com 3 exceções contava como se a empresa pudesse perdê-lo 3 vezes. Agora cada exceção leva a sua parte (compras futuras ÷ exceções do cliente). Isso reduziu todos os valores em reais (tabela da decisão 4) sem mudar a conclusão: a solução continua capturando 88% do que dá para salvar.

## 4. Critério da fila: custo de esperar, com a perda atual como desempate (negócio)

A primeira recomendação foi o contrário (perda esperada hoje como critério). A simulação mostrou o erro: com a chance de cancelamento dependendo do atraso acumulado, um pedido com 15 dias já está na faixa máxima de 40% e não piora esperando; um pedido com 2 dias sobe de faixa em faixa. Priorizar a perda atual põe na frente justamente quem não piora.

| Estratégia | Perda esperada em 14 dias | Recuperado |
|---|---:|---:|
| Ordem de chegada (atual) | R$ 112.686 | — |
| Maior perda esperada hoje | R$ 108.196 | R$ 4.490 |
| **Custo de esperar (escolhida)** | **R$ 88.565** | **R$ 24.121** |
| Limite teórico (tudo tratado hoje) | R$ 85.233 | R$ 27.453 |

(Valores com a recompra dividida entre as exceções do cliente; ver decisão 3.)

Os mais atrasados, com custo de esperar zero, ficam ordenados entre si pela perda atual. Para eles, a alavanca não é a posição na fila, e sim o contato proativo que o agente prepara.

## 5. Autonomia do agente (negócio)

- **A)** Só recomenda: seguro, mas não libera capacidade.
- **B, escolhida)** Autonomia dentro da política: contato, transportadora e reenvio até R$ 65 (90% dos reenvios custam menos) são automáticos; reembolso, cancelamento, cliente de alto valor e reenvio mais caro pedem aprovação.
- **C)** Autonomia total: rápida, mas um erro do modelo vira dinheiro saindo da empresa.

Ajuste posterior (negócio): com a frequência de compra no modelo, 53 dos 150 pedidos do dia eram de clientes de alto valor, e todas as ações deles iam para aprovação, inclusive mensagens simples: 128 aprovações por dia, 59% delas só de comunicação. A regra foi refinada:
- **Comunicação sem custo é automática para todos,** inclusive alto valor: mensagem informativa, pedido de foto, acionar a transportadora. O cliente mais valioso não espera uma aprovação para receber "estamos cuidando do seu pedido".
- **A mensagem segue o status da ação que ela anuncia.** Se o reenvio precisa de aprovação, a mensagem que o anuncia espera junto e só sai quando a pessoa aprovar. A checagem é feita pela estrutura da decisão, não pelo texto, então não depende de o modelo se comportar. Isso fecha um risco que existia antes: anunciar ao cliente um reenvio que depois é recusado.
- **Avaria, vazamento e erro de personalização começam pelo pedido de foto,** como a política exige. O pedido de foto é um texto fixo, sem promessa; a mensagem da solução sai depois da foto. Se o modelo esquecer o pedido de foto, o código o inclui.
- Oferecer substituto passou a contar como ação com custo (mercadoria e frete).

Resultado no dia: aprovações caem de 128 para 31 (todas com dinheiro envolvido: 26 reenvios e 5 substitutos), 36 ações esperam a foto e 119 mensagens saem na hora.

Segundo ajuste (negócio): **todo dinheiro passa por uma pessoa.** O reenvio automático até R$ 65 foi retirado: reenvio, nova produção, substituto, reembolso e cancelamento esperam aprovação humana, de qualquer valor. Comunicação sem dinheiro continua automática para todos.
- O pedido de foto sai na hora; a ação com dinheiro só vai para aprovação depois que a foto chega.
- A mensagem que anuncia ações com dinheiro depende de **todas** elas: só sai quando todas forem aprovadas. Antes, a tela liberava a mensagem quando qualquer uma era aprovada, e uma mensagem "vamos reenviar e reembolsar" podia sair com o reembolso recusado. Se alguma for recusada, a mensagem fica marcada como "não enviar".
- Resultado no dia (pela política): 48 ações com dinheiro em aprovação, 36 esperando a foto e 102 mensagens saindo na hora.

Terceiro ajuste (negócio): **aprovação por grupo, com a recomendação do agente.** Com todo dinheiro passando por uma pessoa, eram 48 aprovações soltas por dia, e a tela escondia o trabalho do agente: parecia um encaminhador de mensagens. Agora as ações com dinheiro aparecem agrupadas como o agente decidiu, cada grupo com o custo, o valor em jogo e a justificativa do agente; um clique aprova o grupo, e dá para decidir caso a caso. As 48 ações viram 5 decisões. Pedidos investigados individualmente pelo agente viram cartões próprios. A tela "Hoje" organiza o dia em três passos (decidir, registrar fotos, enviar) e mostra o que o agente já fez.

Item faltante ficou sem exigência de foto: a política de atendimento menciona foto também para item faltante, mas a concentração no CD2 noite já é evidência suficiente. É um ponto a validar com o time.

## 6. Pedidos ligados a causas sistêmicas: híbrido (negócio)

903 dos 2.000 pedidos (45%) pertencem a alguma causa.
- **A)** Só sinalizar.
- **B, escolhida)** A fila segue ordenada por custo de esperar; pedidos da mesma causa que caem no mesmo dia são tratados com uma ação única (chamado em lote), e cada causa ganha um plano de correção.
- **C)** Tratar todos em lote primeiro: a fila zeraria em 9 dias em vez de 14, mas a perda quase não muda (R$ 70,5 mil contra R$ 71,6 mil no modelo de então) e o ganho dependia de uma premissa sem dado (lote custando 1/4 de uma tratativa).

## 7. Premissas do modelo de perda (técnicas)

- A chance de cancelar usa o atraso em dias úteis contra a data **mostrada ao cliente**, porque é ela que o cliente vê. A cobrança da transportadora usa o prazo do contrato.
- Atraso conta dias úteis no intervalo (data prometida, hoje]. Prazos que caem em fim de semana (efeito do cálculo errado) não geram atraso no próprio fim de semana.
- Tratar um pedido congela o atraso dele; não desfaz o risco já criado.
- Avaria, vazamento e item faltante contam atraso desde a data prometida: o cliente ainda não tem o produto certo.
- Atraso já entregue tem perda travada: a fila não muda o resultado.
- Pagamento pendente não gera reembolso; arrisca a margem da venda.
- Quem cancela conta como exceção mal resolvida (perde metade da chance de recompra).
- A recompra de um cliente com várias exceções abertas é dividida entre elas: ele só pode ir embora uma vez.
- O tempo de reenvio depois da tratativa vale igual para todas as estratégias e fica fora da comparação.

## 8. Qualidade dos dados (técnica)

- 42 linhas duplicadas (mesmo pedido, mesmo tipo de exceção, status diferentes). Mantido o registro mais avançado: tratar as duas gastaria capacidade à toa.
- 100% das datas prometidas batem com "pedido + 1 + SLA em dias **corridos**", contra a regra de dias úteis. Virou achado de negócio (auditoria na aba Causas). Para listas novas, o achado aparece quando pelo menos 95% das datas batem: um erro de digitação não apaga a conclusão.
- Leitura tolerante de listas novas: BOM, separador ";", vírgula decimal e data dd/mm/aaaa são aceitos. Uma linha com erro (valor ilegível, tipo desconhecido, data impossível) é ignorada e listada no Resumo com o motivo; o arquivo só é recusado se faltar coluna obrigatória, se nenhuma linha for válida ou se mais da metade for inválida. Os dados da empresa passam inteiros (0 linhas ignoradas).
- Transportadora × UF fora da tabela: SLA e frete pela mediana da mesma transportadora (ou geral), em vez de zero. Zero fazia a transportadora parecer atrasada e o reenvio parecer barato. Esses pedidos ficam fora da auditoria de prazo.
- Feriados: nacionais de 2025 a 2027, com a Sexta-feira Santa calculada pela Páscoa (Carnaval e Corpus Christi são ponto facultativo). Nos dados atuais (agosto a outubro de 2026) só 07/09 e 12/10 contam, então nenhum número mudou.

## 9. Detecção de causas (técnica)

- Sem o volume total por máquina, turno ou transportadora, a participação de um tipo de exceção no grupo é comparada com a do resto da base: os outros tipos servem de medida de volume. Ex.: a IMP-02 tem quantidade parecida com as outras impressoras nos demais tipos de exceção, então não aparece só por produzir mais.
- Teste unilateral de duas proporções, correção de Bonferroni sobre todos os testes, excesso mínimo de 15 ocorrências e pelo menos 2 vezes acima do normal.
- População elegível por tipo: sem isso, "falha de personalização" apareceria como problema da Gocase, que é só a única marca personalizada.
- Leituras do mesmo problema (o SKU APC-1067 e o lote L2607-B) são fundidas, mantendo a de maior concentração (maior lift); as outras aparecem como "também visível em".

## 10. Arquitetura (técnicas)

- **TypeScript de ponta a ponta (Next.js):** um único núcleo de cálculo roda no servidor, no navegador e nos testes; deploy direto no Vercel.
- **Agente com ferramentas, saída estruturada e validação por esquema (zod):** o modelo nunca inventa número; consulta. Erro de formato volta para ele corrigir.
- **Decisão por grupo + investigação individual dos casos sensíveis:** cerca de 20 a 50 chamadas por dia em vez de 150 investigações completas, dentro da cota gratuita.
- **Plano gerado no build:** quem abre o link vê o trabalho do agente sem gastar cota; o build nunca quebra por causa da IA.
- **Agente no servidor:** o link é público. A primeira versão validava a conversa que o navegador mandava (prompt e ferramentas conhecidos), mas o texto do usuário e as respostas das ferramentas continuavam livres, então dava para usar a chave como chat. Agora o navegador manda só o id do pedido ou a chave do grupo e o servidor monta a conversa inteira. Custo: a IA ao vivo vale só para a lista original.
- **Limite de uso folgado, em memória:** 30 investigações e 60 grupos por IP a cada 10 minutos e teto global de 1.500 chamadas por dia, ajustáveis por variável de ambiente. Barra robôs sem atrapalhar uma banca na mesma rede; ao estourar, cai na política com aviso. A alternativa (Redis compartilhado) daria contagem exata, mas exigiria mais uma conta e configuração para um ganho pequeno aqui.
- **Troca automática de modelo:** se a cota de um modelo acaba, o cliente tenta o próximo da lista.

## 11. Dados cifrados no repositório e fora de `public/` (técnica, com motivação de negócio)

Os CSVs estavam em `public/dados/`: qualquer pessoa com o link baixava a base inteira pela URL, e o repositório público os expunha em texto puro. O desafio pede que os dados sejam tratados como reais, e dados reais não ficam assim.
- **A)** Só tirar de `public/` e servir por rota: resolve o download direto, mas o repositório continua expondo os dados.
- **B)** Repositório privado: fere a entrega, que exige repositório público.
- **C, escolhida)** CSVs cifrados no repositório (AES-256-GCM, chave derivada por scrypt), decifrados em memória no servidor com `DADOS_SENHA`, entregues ao navegador por `/api/dados` com `no-store` e `noindex`. Zero serviços extras: uma variável de ambiente no Vercel. O texto puro fica só na máquina de quem desenvolve, ignorado pelo git.
- **Limite assumido:** o navegador ainda recebe os dados, porque o núcleo de cálculo roda nele (é o que permite carregar outra lista e simular capacidade sem servidor). Quem usa a aplicação vê os pedidos; quem não usa não baixa nada, e nada é indexado. Mover todo o cálculo para o servidor fecharia isso ao custo de perder a análise de listas enviadas; não valeu a troca aqui.
- O histórico do git anterior a esta decisão ainda contém os CSVs em texto puro; limpá-lo exige reescrever o histórico e forçar o push, decisão de quem é dono do repositório.

## 12. Limite da IA medido em tokens, não só em chamadas (técnica)

O limite diário era de 1.500 chamadas e 30 investigações por IP a cada 10 minutos. A cota gratuita da Groq, porém, é limitada sobretudo por **tokens por dia** (100 a 200 mil por modelo), e uma investigação completa gasta 15 a 20 mil tokens: um único avaliador clicando poderia esgotar o dia em minutos. Agora: 8 investigações e 40 decisões de grupo por IP a cada 10 minutos, teto global de 400 chamadas e 400 mil tokens por dia, investigação com no máximo 6 passos e 4 consultas, timeout de 60 s por chamada. Os números cabem em "pedir um plano novo" algumas vezes por dia e sobram para investigações avulsas.

## 13. A mensagem ao cliente é conferida pelo código (negócio)

O prompt já pedia para não prometer reembolso nem citar números internos, mas nada garantia. Agora `problemasDaMensagem` recusa, antes de a decisão valer: link ou endereço de site, promessa de reembolso ou cancelamento sem a ação correspondente entre as decididas, e jargão interno de risco ("valor em jogo", "probabilidade", "alto valor"). O erro volta ao modelo para corrigir (uma vez no plano de grupo, dentro do limite de passos na investigação); se insistir, vale a política padrão. Vale tanto para a investigação quanto para o modelo de mensagem do grupo, antes de preencher os marcadores.

## 14. Interface como produto de operação, não como relatório (negócio)

A primeira interface era um documento longo com abas: densa, sem hierarquia, e escondia o agente. A nova casca tem barra lateral com a navegação, o estado do agente (ligado ou não, modelo, hora do plano) e os dados carregados; cada tela abre com o número que importa e as ações possíveis. O agente aparece como ator: badge "Decidido pelo agente" em cada grupo, cartão "O agente já preparou o dia" na abertura, atividade do dia em contadores e a trilha de investigação como linha do tempo em linguagem simples (com o JSON bruto disponível). Cores: azul da marca para ações e para o agente, verde/âmbar/vermelho só para estados, e a paleta categórica validada do gráfico mantida (azul, laranja, verde-água). Um cálculo do dia (`montarDia`) é feito uma vez e compartilhado por todas as telas.

## 15. Aprovar precisa ter um destino: exportação em lotes (negócio)

"Aprovar" só mudava o estado no navegador. Sem integração com transportadoras, CD, financeiro e atendimento, o trabalho do agente e as decisões da pessoa não chegavam a quem executa. Alternativas:
- **A)** Integrar com sistemas reais: fora do alcance do desafio, sem acesso a nenhum deles.
- **B)** Exportar sempre uma foto do dia inteiro: simples e seguro, mas quem recebe a planilha não sabe o que é novo desde a última vez e refaz o trabalho.
- **C, escolhida)** **Lotes incrementais com proteções.** Cada exportação vira um lote numerado e o próximo traz só o que foi aprovado ou liberado depois. O medo legítimo (um clique errado "queima" itens num lote errado) foi tratado por desenho, não por aviso: prévia do conteúdo antes de baixar; desfazer o último lote; baixar de novo qualquer lote, idêntico, porque é recalculado do registro; e exportar o dia inteiro a qualquer momento sem mexer nos lotes. O lote é só uma marca: nenhuma aprovação, foto ou envio é apagado.

O que cada destino recebe: uma aba por transportadora com o chamado em lote do agente na primeira linha (o texto que ele já escrevia agora é a mensagem que vai para a transportadora), reenvios e produção para logística e CD, reembolsos e cancelamentos para o financeiro, mensagens para o atendimento, chamados internos e recusas para auditoria. Formato XLSX gerado no navegador (`write-excel-file`, sem serviço externo) e CSV por aba. Os lotes ficam em estado próprio no navegador, ao lado do registro, para não mudar a forma do registro nem os módulos que o consomem.

## 16. Fechar o ciclo: ontem × hoje (negócio)

Uma priorização só vale se for verificável. Sem status de cancelamento nos dados (só aberta, em análise, aguardando cliente, aguardando transportadora), o que dá para medir é o que saiu da lista. A comparação entre a lista de um dia e a do seguinte mede: resolvidas, continuam (com o atraso médio antes e depois), novas por tipo, reincidência (novas ligadas a causas conhecidas), a tendência de cada causa e o **previsto × realizado**: a fração dos pedidos priorizados pela fila que de fato saiu, contra os deixados para depois e contra os que tiveram ação aprovada pela pessoa.
- A data de referência passou a ser inferida da própria lista (a mais recente entre abertura, pedido e entrega). Na lista do desafio dá 30/09/2026, a mesma dos parâmetros, então nenhum número mudou; numa lista de outro dia, a fila é calculada a partir daquele dia.
- Como não há uma segunda lista, existe uma **simulação determinística da lista de amanhã** (75% da fila do dia se resolve, 85% do que teve ação aprovada, 6% do resto; o restante envelhece um dia útil; entram 36 novas, 60% repetindo causas conhecidas). Ela é marcada como demonstração em todo lugar; com a lista real, a comparação é a mesma. As taxas são premissas de demonstração, não medições.

## 17. Briefing diário, placar e projeção mensal (negócio)

- **Briefing para a liderança:** uma chamada ao modelo por dia, no build, só com números já calculados; estrutura fixa (título, 2 a 4 parágrafos, 3 a 5 prioridades com área responsável), validada por esquema, sem links; se falhar, a mesma estrutura sai pela política. Responde em texto à pergunta "quais pedidos tratar hoje, e por quê".
- **Placar de confiança:** aprovações e recusas das recomendações, com as recusas por tipo e ação. É a métrica para ampliar a autonomia do agente com o tempo, e mostra onde ele erra.
- **Projeção mensal das causas:** o excesso observado em 60 dias levado a 30 dias, por causa e no total. A janela de 60 dias é a do enunciado e virou parâmetro (`janelaDias`).
- **Link direto para um pedido** (`#aba?pedido=...`), para chamados e mensagens internas.
