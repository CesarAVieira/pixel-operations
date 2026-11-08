/**
 * Contrato de uma fonte de movimentações. Hoje: `Simulador`. Na integração: uma fonte que lê a API
 * da empresa (polling, SSE ou WebSocket) e entrega `Movimentacao` ao store — nada mais muda.
 *
 * Esboço da futura fonte da API (a confirmar com o contrato real):
 *
 *   class FonteApi implements FonteMovimentacoes {
 *     nome = 'API CBB'; simulada = false;
 *     agora = () => Date.now();
 *     conectar(store) {
 *       let cursor = '';
 *       const t = setInterval(async () => {
 *         const r = await fetch(`/api/movimentacoes?desde=${cursor}`).then((x) => x.json());
 *         store.aplicarVarios(r.itens.map(converterDaApi));
 *         cursor = r.cursor;
 *       }, 5000);
 *       return () => clearInterval(t);
 *     }
 *   }
 */
import type { PainelStore } from '../dominio/store';

export interface FonteMovimentacoes {
  readonly nome: string;
  readonly simulada: boolean;
  /** Relógio de referência (ms). Simulação: acelerado; API: Date.now. */
  agora(): number;
  /** Começa a entregar movimentações ao store; devolve a função de desligar. */
  conectar(store: PainelStore): () => void;
}
