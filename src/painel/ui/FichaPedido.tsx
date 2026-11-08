import { useEffect } from 'react';
import { ETAPAS } from '../dominio/etapas';
import { fracaoCarga, toleranciaKg } from '../dominio/pedido';
import { TIPOS_NOTA, type Pedido } from '../dominio/tipos';
import { dataCurta, haQuanto, hora, situacaoValidade, toneladas } from './formatos';

function Campo({ r, v, mono }: { r: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="campo">
      <span>{r}</span>
      <b className={mono ? 'mono' : ''}>{v}</b>
    </div>
  );
}

function Validade({ iso, agora }: { iso: string; agora: number }) {
  const s = situacaoValidade(iso, agora);
  return (
    <span className={`val val-${s.situacao}`}>
      {dataCurta(iso)} · {s.texto}
    </span>
  );
}

export function FichaPedido({ p, agora, onFechar }: { p: Pedido; agora: number; onFechar: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFechar]);

  const e = ETAPAS[p.etapa];
  const v = p.veiculo;
  const m = p.motorista;
  const docsAlerta = [...v.documentos.map((d) => d.validade), m.cnh.validade, m.mopp.validade].filter((d) => situacaoValidade(d, agora).situacao !== 'ok').length;

  return (
    <div className="ficha-fundo" onClick={onFechar}>
      <aside className="ficha" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label={`Ficha do pedido ${p.dados.numero}`}>
        <header>
          <div>
            <div className="f-num">{p.dados.numero}</div>
            <h2>{p.dados.cliente.nome}</h2>
            <div className="f-etapa">
              <span className={`setor s-${e.setor}`}>{e.setor}</span>
              <span className={e.alerta ? 'txt-alerta' : ''}>{e.rotulo}</span>
              <span className="mudo">· há {haQuanto(agora - p.etapaDesde)}</span>
            </div>
          </div>
          <button className="fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </header>

        <div className="f-corpo">
          <section>
            <h3>Pedido</h3>
            <div className="grade">
              <Campo r="Produto" v={p.dados.produto} />
              <Campo r="Quantidade" v={toneladas(p.dados.quantidadeKg)} />
              <Campo r="Destino" v={`${p.dados.destino.cidade}/${p.dados.destino.uf}`} />
              <Campo r="Temperatura de carga" v={p.dados.temperaturaC ? `${p.dados.temperaturaC} °C` : '—'} />
              <Campo r="Cliente (CNPJ)" v={p.dados.cliente.cnpj} mono />
              <Campo r="Chegada ao pátio" v={hora(p.chegadaEm)} />
              <Campo r="Carregado" v={`${toneladas(p.carregadoKg)} (${Math.round(Math.min(1, fracaoCarga(p)) * 100)}%)`} />
              <Campo r="Retornos à fábrica" v={p.retornos} />
            </div>
          </section>

          <section>
            <h3>Veículo</h3>
            <div className="grade">
              <Campo r="Placa do cavalo" v={<span className="placa grande">{v.placaCavalo}</span>} />
              <Campo r="Placa do reboque" v={<span className="placa grande">{v.placaReboque}</span>} />
              <Campo r="Modelo" v={v.modelo} />
              <Campo r="Composição" v={v.tipo} />
              <Campo r="Transportadora" v={v.transportadora} />
              <Campo r="Capacidade / tara" v={`${toneladas(v.capacidadeKg)} / ${toneladas(v.taraKg)}`} />
            </div>
          </section>

          <section>
            <h3>Motorista</h3>
            <div className="grade">
              <Campo r="Nome" v={m.nome} />
              <Campo r="CPF" v={m.cpf} mono />
              <Campo r="Telefone" v={m.telefone} />
              <Campo r={`CNH cat. ${m.cnh.categoria}`} v={<Validade iso={m.cnh.validade} agora={agora} />} />
              <Campo r="MOPP (produtos perigosos)" v={<Validade iso={m.mopp.validade} agora={agora} />} />
            </div>
          </section>

          <section>
            <h3>
              Documentos e certificados {docsAlerta > 0 && <span className="tag-alerta">{docsAlerta} com pendência</span>}
            </h3>
            <table className="tabela">
              <tbody>
                {v.documentos.map((d) => (
                  <tr key={d.sigla}>
                    <td>
                      <b>{d.sigla}</b>
                      <div className="mudo">{d.nome}</div>
                    </td>
                    <td className="mono">{d.numero}</td>
                    <td>
                      <Validade iso={d.validade} agora={agora} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3>Pesagens</h3>
            {p.pesagens.length === 0 ? (
              <p className="mudo">Ainda não pesado. Tolerância: ± {Math.round(toleranciaKg(p.dados.quantidadeKg))} kg.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Bruto</th>
                    <th>Líquido</th>
                    <th>Diferença</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {p.pesagens.map((q, i) => (
                    <tr key={i}>
                      <td>{hora(q.em)}</td>
                      <td>{toneladas(q.brutoKg)}</td>
                      <td>{toneladas(q.liquidoKg)}</td>
                      <td className={q.ok ? '' : 'txt-alerta'}>
                        {q.diferencaKg > 0 ? '+' : ''}
                        {Math.round(q.diferencaKg)} kg
                      </td>
                      <td>{q.ok ? <span className="val val-ok">OK</span> : <span className="val val-vencido">Divergente</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h3>Notas fiscais (eDocs)</h3>
            <div className="notas">
              {TIPOS_NOTA.map((t) => {
                const n = p.notas[t];
                return (
                  <div key={t} className={`nota st-${n.status.toLowerCase()}`}>
                    <div className="n-topo">
                      <b>{t}</b>
                      <span>{{ PENDENTE: 'Pendente', EMITINDO: 'Em emissão', AUTORIZADA: 'Autorizada', REJEITADA: 'Rejeitada' }[n.status]}</span>
                    </div>
                    {n.numero && <div className="mono">nº {n.numero}</div>}
                    {n.chave && <div className="mono chave" title={n.chave}>{n.chave.replace(/(\d{4})/g, '$1 ').trim()}</div>}
                    {n.motivo && n.status === 'REJEITADA' && <div className="txt-alerta">{n.motivo}</div>}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3>Linha do tempo</h3>
            <ol className="tempo">
              {[...p.historico].reverse().map((h, i) => (
                <li key={i} className={h.alerta ? 'alerta' : ''}>
                  <span>{hora(h.em)}</span>
                  {h.texto}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </aside>
    </div>
  );
}
