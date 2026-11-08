import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import logoCbb from './assets/logo-cbb-asfaltos.webp';
import { Teatro, type ModoCeu } from './cena/teatro';
import { ETAPAS, type Setor } from './dominio/etapas';
import { notaRejeitada } from './dominio/pedido';
import { PainelStore } from './dominio/store';
import type { Pedido } from './dominio/tipos';
import { Simulador } from './fonte/simulador';
import { CartaoPedido } from './ui/CartaoPedido';
import { Faixa } from './ui/Faixa';
import { FichaPedido } from './ui/FichaPedido';
import { hora } from './ui/formatos';

// Fonte de dados: hoje o simulador; na integração, troca-se só esta linha pela fonte da API.
const fonte = new Simulador();
const store = new PainelStore(fonte.agora);
fonte.conectar(store);
const teatro = new Teatro(store);
teatro.iniciar();
// apoio à inspeção em desenvolvimento (não vai para o build de produção)
if (import.meta.env.DEV) Object.assign(window, { __painel: { fonte, store, teatro } });

type Filtro = 'Todos' | Setor | 'Alertas';
const FILTROS: Filtro[] = ['Todos', 'Comercial', 'Logística', 'Fábrica', 'Expedição', 'Concluído', 'Alertas'];
const temAlerta = (p: Pedido) => !!ETAPAS[p.etapa].alerta || notaRejeitada(p);
const CEUS: { m: ModoCeu; r: string; t: string }[] = [
  { m: 'auto', r: '⟳ Auto', t: 'Iluminação pela hora do relógio' },
  { m: 'dia', r: '☀ Dia', t: 'Fixar dia' },
  { m: 'noite', r: '☾ Noite', t: 'Fixar noite' },
];

export default function PainelApp() {
  const pedidos = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [agora, setAgora] = useState(fonte.agora());
  const [aberto, setAberto] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('Todos');
  const [busca, setBusca] = useState('');
  const [vel, setVel] = useState(1);
  const [pausado, setPausado] = useState(false);
  const [ceu, setCeu] = useState<ModoCeu>('auto');
  const [tv, setTv] = useState(false);
  const palco = useRef<HTMLDivElement>(null);
  const montado = useRef(false);

  useEffect(() => {
    if (!montado.current && palco.current) {
      montado.current = true;
      teatro.montar(palco.current);
    }
    const t = setInterval(() => setAgora(fonte.agora()), 1000);
    return () => clearInterval(t);
  }, []);

  // modo TV: tela cheia + rolagem automática quando há mais linhas que cabem
  useEffect(() => {
    if (!tv) return;
    let espera = 120;
    const t = setInterval(() => {
      const fim = document.documentElement.scrollHeight - window.innerHeight;
      if (fim <= 4) return;
      if (espera > 0) {
        espera--;
        return;
      }
      if (window.scrollY >= fim - 1) {
        espera = 120;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else window.scrollBy(0, 1);
    }, 40);
    const sair = () => !document.fullscreenElement && setTv(false);
    document.addEventListener('fullscreenchange', sair);
    return () => {
      clearInterval(t);
      document.removeEventListener('fullscreenchange', sair);
    };
  }, [tv]);

  const alternarTv = () => {
    if (!tv) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
      setTv(true);
    } else {
      if (document.fullscreenElement) void document.exitFullscreen();
      setTv(false);
    }
  };

  const contagem = useMemo(() => {
    const c = { preparo: 0, carregamento: 0, expedicao: 0, viagem: 0, alertas: 0 };
    for (const p of pedidos) {
      const e = ETAPAS[p.etapa];
      if (e.ok) c.viagem++;
      else c[e.coluna]++;
      if (temAlerta(p)) c.alertas++;
    }
    return c;
  }, [pedidos]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (filtro === 'Alertas' ? !temAlerta(p) : filtro !== 'Todos' && ETAPAS[p.etapa].setor !== filtro) return false;
      if (!q) return true;
      return [p.dados.numero, p.dados.cliente.nome, p.veiculo.placaCavalo, p.veiculo.placaReboque, p.motorista.nome, p.dados.destino.cidade].some((s) => s.toLowerCase().includes(q));
    });
  }, [pedidos, filtro, busca]);

  const selecionado = aberto ? pedidos.find((p) => p.id === aberto) : undefined;
  const fechar = useCallback(() => setAberto(null), []);

  const mudarVel = (v: number) => {
    setVel(v);
    fonte.velocidade = v;
    teatro.velocidade = v;
  };
  const alternarPausa = () => {
    const v = !pausado;
    setPausado(v);
    fonte.pausado = v;
    teatro.pausado = v;
  };
  const mudarCeu = (m: ModoCeu) => {
    setCeu(m);
    teatro.modoCeu = m;
  };

  return (
    <div className={'painel' + (tv ? ' tv' : '')}>
      <header className="topo">
        <div className="marca">
          <div className="logo">
            <img src={logoCbb} alt="CBB Asfaltos" />
          </div>
          <div className="marca-txt">
            <h1>Painel de Pedidos</h1>
            <div className="sub">Filial Curitiba · do pedido à nota autorizada</div>
          </div>
        </div>

        <div className="kpis">
          <Kpi rotulo="Preparando" valor={contagem.preparo} cor="var(--comercial)" />
          <Kpi rotulo="Carregando" valor={contagem.carregamento} cor="var(--fabrica)" />
          <Kpi rotulo="Expedição" valor={contagem.expedicao} cor="var(--expedicao)" />
          <Kpi rotulo="Em viagem" valor={contagem.viagem} cor="var(--concluido)" />
          <Kpi rotulo="Alertas" valor={contagem.alertas} cor="var(--alerta)" destaque={contagem.alertas > 0} />
        </div>

        <div className="relogio">
          <b>{hora(agora)}</b>
          <span>{fonte.simulada ? 'relógio da simulação' : 'hora local'}</span>
        </div>
      </header>

      <div className="barra">
        <div className="filtros" role="tablist">
          {FILTROS.map((f) => (
            <button key={f} className={'filtro' + (f === filtro ? ' ativo' : '') + (f === 'Alertas' ? ' f-alerta' : '')} onClick={() => setFiltro(f)} role="tab" aria-selected={f === filtro}>
              {f !== 'Todos' && f !== 'Alertas' && <i className={`ponto s-${f}`} />}
              {f}
            </button>
          ))}
        </div>
        <input className="busca" placeholder="Buscar pedido, cliente, placa, motorista…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="grupo" title="Iluminação do cenário">
          {CEUS.map((c) => (
            <button key={c.m} className={ceu === c.m ? 'ativo' : ''} onClick={() => mudarCeu(c.m)} title={c.t}>
              {c.r}
            </button>
          ))}
        </div>
        <button className="btn-tv" onClick={alternarTv} title="Tela cheia com rolagem automática">
          {tv ? '✕ Sair do modo TV' : '⛶ Modo TV'}
        </button>
        {fonte.simulada && (
          <div className="demo">
            <span className="selo">Demonstração · dados fictícios</span>
            <div className="grupo">
              <button onClick={alternarPausa}>{pausado ? '▶' : '❚❚'}</button>
              {[1, 2, 4].map((v) => (
                <button key={v} className={vel === v ? 'ativo' : ''} onClick={() => mudarVel(v)}>
                  {v}x
                </button>
              ))}
            </div>
            <button onClick={() => fonte.novoPedido()}>+ Pedido</button>
          </div>
        )}
      </div>

      <main className="quadro">
        <div className="palco" ref={palco} aria-hidden="true" />
        <div className="cabecalho">
          <div className="h-pedido">
            Pedido <span className="mudo">· fluxo ←</span>
          </div>
          <div className="h-cols">
            <Coluna n={3} titulo="Expedição" sub="Balança · NFe · CTe · MDFe" qtd={contagem.expedicao + contagem.viagem} cor="var(--expedicao)" />
            <Coluna n={2} titulo="Carregamento" sub="Fábrica · abastecimento do tanque" qtd={contagem.carregamento} cor="var(--fabrica)" />
            <Coluna n={1} titulo="Preparando o pedido" sub="Comercial · Logística" qtd={contagem.preparo} cor="var(--comercial)" />
          </div>
        </div>

        {visiveis.map((p) => (
          <div className="linha" key={p.id}>
            <CartaoPedido p={p} agora={agora} onAbrir={() => setAberto(p.id)} />
            <Faixa id={p.id} teatro={teatro} onAbrir={() => setAberto(p.id)} />
          </div>
        ))}
        {visiveis.length === 0 && <div className="vazio">{pedidos.length ? 'Nenhum pedido corresponde ao filtro.' : 'Nenhum pedido em andamento.'}</div>}
      </main>

      <footer className="rodape">
        <span>Clique no caminhão ou no cartão para abrir a ficha do carregamento.</span>
        <span className="mudo">Fonte: {fonte.nome}</span>
      </footer>

      {selecionado && <FichaPedido p={selecionado} agora={agora} onFechar={fechar} />}
    </div>
  );
}

function Kpi({ rotulo, valor, cor, destaque }: { rotulo: string; valor: number; cor: string; destaque?: boolean }) {
  return (
    <div className={'kpi' + (destaque ? ' destaque' : '')} style={{ '--cor': cor } as React.CSSProperties}>
      <span>{rotulo}</span>
      <b>{valor}</b>
    </div>
  );
}

function Coluna({ n, titulo, sub, qtd, cor }: { n: number; titulo: string; sub: string; qtd: number; cor: string }) {
  return (
    <div className="h-col" style={{ '--cor': cor } as React.CSSProperties}>
      <i className="h-n">{n}</i>
      <div>
        <b>{titulo}</b>
        <span>{sub}</span>
      </div>
      <em>{qtd}</em>
    </div>
  );
}
