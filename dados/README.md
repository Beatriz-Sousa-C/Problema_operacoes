# Dados do desafio

Os três CSVs (`pedidos_excecao.csv`, `clientes.csv`, `transportadoras.csv`) **não são commitados em texto puro** nem servidos como arquivo estático. No repositório ficam só as versões cifradas (`*.csv.enc`, AES-256-GCM).

- Para desenvolver: coloque os CSVs originais nesta pasta (o git os ignora) **ou** defina `DADOS_SENHA` em `.env.local`; o servidor decifra os `.enc` sozinho.
- Para publicar: cadastre `DADOS_SENHA` no Vercel. Nada mais é preciso.
- Para atualizar os `.enc` depois de mudar um CSV: `npm run dados:cifrar`.

`gerado/plano.json` é o plano do agente criado no build (também ignorado pelo git).
