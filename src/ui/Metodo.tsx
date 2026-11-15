import { PARAMETROS } from "@/core";
import { Badge, Cabecalho } from "./componentes";

const REPO = process.env.NEXT_PUBLIC_REPO_URL;

export function Metodo() {
  const p = PARAMETROS;
  return (
    <div className="pagina">
      <Cabecalho sobre="Método" titulo="Como a fila é calculada e o que o agente faz" texto="As premissas estão aqui para serem contestadas. Os parâmetros vêm do negócio; as escolhas, do registro de decisões no repositório." />

      <div className="quem-faz">
        <section className="cartao">
          <Badge tom="agente" icone="agente">
            O agente de IA
          </Badge>
          <ul className="lista-marcada">
            <li>Decide a tratativa de cada grupo da fila do dia (mesmo tipo de exceção e mesma causa), com a justificativa em números.</li>
            <li>Escreve a mensagem ao cliente de cada pedido e um chamado único por lote para a área responsável.</li>
            <li>Investiga um a um os casos sensíveis (alto valor, várias exceções), consultando pedido, cliente, transportadora, causas e política antes de decidir.</li>
            <li>Escreve um plano de correção para cada causa de processo, endereçado à área responsável.</li>
          </ul>
        </section>
        <section className="cartao">
          <Badge tom="neutro">A pessoa</Badge>
          <ul className="lista-marcada">
            <li>Aprova ou recusa o que envolve dinheiro, por grupo, vendo a recomendação do agente e o motivo.</li>
            <li>Registra as fotos que os clientes mandam.</li>
            <li>Envia as mensagens prontas.</li>
          </ul>
          <p className="suave">
            A aprovação humana não reduz o agente a um encaminhador: ele faz a análise e prepara a decisão; a pessoa assina quando sai dinheiro, como um gestor
            que aprova o que o analista propôs.
          </p>
        </section>
      </div>

      <section className="cartao metodo-texto">
        <section>
          <h2>A IA propõe; o código decide</h2>
          <p>
            Toda ação do agente passa pela política antes de valer. Mensagens informativas, pedidos de foto e acionamento de transportadora são automáticos para
            todos. Toda ação que envolve dinheiro (reenvio, nova produção, substituto, reembolso e cancelamento) espera a aprovação de uma pessoa, de qualquer
            valor. Em avaria, vazamento e erro de personalização, o pedido de foto sai na hora e a solução só vai para aprovação depois da foto. A mensagem que
            anuncia ações com dinheiro só sai quando todas forem aprovadas; se alguma for recusada, ela não é enviada. Ação fora da política é bloqueada.
          </p>
          <p>
            A mensagem escrita pelo modelo também é conferida pelo código: não pode ter link, não pode prometer reembolso ou cancelamento que não esteja entre
            as ações e não pode citar números internos de risco. Se violar, o erro volta para o modelo corrigir; se insistir, vale a política padrão. Se a IA
            estiver fora do ar ou sem cota, o sistema usa a tratativa padrão da política e avisa: a operação nunca para.
          </p>
        </section>

        <section>
          <h2>O valor em jogo de cada exceção</h2>
          <p>
            Se o cliente cancelar, a empresa devolve o valor pago e perde parte das compras futuras dele. A recompra usa os parâmetros do negócio:{" "}
            {p.recompra.probabilidadeVip * 100}% para quem já gastou mais de R$ {p.recompra.limiarReceitaVip.toLocaleString("pt-BR")} e{" "}
            {p.recompra.probabilidadeDemais * 100}% para os demais, cortada pela metade quando a exceção é mal resolvida. Multiplicamos pela frequência de compra
            de cada cliente (com no mínimo {p.recompra.mesesMinimosHistorico} meses de histórico e no máximo {p.recompra.compraMaximaPorAno} compras por ano),
            pelo ticket médio e pela margem de {(1 - p.cmv) * 100}%. Quando o cliente tem mais de uma exceção aberta, as compras futuras dele são divididas entre
            elas: ele só pode ir embora uma vez. Em pagamento pendente não há reembolso: o que se perde é a margem da venda.
          </p>
        </section>

        <section>
          <h2>Por que a ordem é o custo de esperar</h2>
          <p>
            A chance de cancelar depende dos dias úteis de atraso em relação à data mostrada ao cliente: 4% até 2 dias, 10% até 5, 22% até 10 e 40% acima
            disso. Um pedido com 15 dias de atraso já está na faixa máxima e não piora esperando; um pedido com 2 dias sobe de faixa em faixa. Por isso a fila é
            ordenada pelo quanto a perda esperada de cada pedido cresce se ele for para o fim da fila. Empates são resolvidos pela perda esperada de hoje. Tratar
            primeiro os mais atrasados recupera só uma fração disso, como mostra a simulação.
          </p>
        </section>

        <section>
          <h2>Custo da IA sob controle</h2>
          <p>
            O agente decide por grupo (cerca de 20 chamadas por dia, não 150) e o plano do dia é gerado no build: quem abre o link vê o trabalho pronto sem
            gastar cota. As investigações ao vivo são limitadas por visitante e por um teto diário de chamadas e de tokens, porque a cota gratuita é medida em
            tokens. O navegador manda só o id do pedido; o servidor monta a conversa inteira, então o link público não vira um chat com a chave.
          </p>
        </section>

        <section>
          <h2>Premissas que você pode contestar</h2>
          <ul>
            <li>Tratar um pedido impede que o atraso dele continue crescendo, mas não desfaz o risco que o atraso já criou.</li>
            <li>Quem cancela conta como exceção mal resolvida; quem fica mantém o ritmo de compra histórico.</li>
            <li>Avaria, vazamento e item faltante contam atraso a partir da data prometida, porque o cliente ainda não tem o produto certo.</li>
            <li>O tempo de reenvio depois da tratativa não entra na conta: vale igual para todas as estratégias.</li>
            <li>As causas usam os outros tipos de exceção como medida de volume, já que não temos o total de pedidos por máquina ou transportadora.</li>
          </ul>
        </section>

        {REPO && (
          <p>
            Código, testes e o registro de decisões: <a href={REPO}>{REPO.replace("https://", "")}</a>
          </p>
        )}
      </section>
    </div>
  );
}
