import { ETAPAS, PASSOS } from '../dominio/etapas';
import { fracaoCarga, notaRejeitada } from '../dominio/pedido';
import type { Pedido } from '../dominio/tipos';
import { haQuanto, toneladas } from './formatos';

export function CartaoPedido({ p, agora, onAbrir }: { p: Pedido; agora: number; onAbrir: () => void }) {
  const e = ETAPAS[p.etapa];
  const rejeitada = notaRejeitada(p);
  const alerta = e.alerta || rejeitada;
  let rotulo = e.rotulo;
  if (p.etapa === 'CARREGANDO') rotulo += ` · ${Math.round(Math.min(1, fracaoCarga(p)) * 100)}%`;
  if (rejeitada && p.etapa === 'EMITINDO_NOTAS') rotulo = 'Nota rejeitada · aguardando reemissão';

  return (
    <button className={'cartao' + (alerta ? ' alerta' : e.ok ? ' ok' : '')} onClick={onAbrir} title="Abrir ficha do carregamento">
      <div className="c-linha">
        <span className="c-num">{p.dados.numero}</span>
        <span className={`setor s-${e.setor}`}>{e.setor}</span>
      </div>
      <div className="c-cliente">{p.dados.cliente.nome}</div>
      <div className="c-meta">
        {p.dados.produto} · {toneladas(p.dados.quantidadeKg)} · {p.dados.destino.cidade}/{p.dados.destino.uf}
      </div>
      <div className="c-meta c-placas">
        <span className="placa">{p.veiculo.placaCavalo}</span>
        <span className="placa">{p.veiculo.placaReboque}</span>
        <span>{p.motorista.nome.split(' ')[0]}</span>
      </div>
      <div className="c-status">{rotulo}</div>
      <div className="c-passos" aria-label={`Passo ${e.passo + 1} de 4`}>
        {PASSOS.map((n, i) => (
          <i key={n} title={n} className={i < e.passo || e.ok ? 'feito' : i === e.passo ? 'atual' : ''} />
        ))}
      </div>
      <div className="c-rodape">
        <span>na etapa há {haQuanto(agora - p.etapaDesde)}</span>
        {p.retornos > 0 && <span className="tag-alerta">↺ {p.retornos} retorno</span>}
      </div>
    </button>
  );
}
