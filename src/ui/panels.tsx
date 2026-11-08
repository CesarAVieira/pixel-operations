import { useMemo, useState } from 'react';
import type { EntityRef, MachineStatus } from '../types/world';
import type { Snapshot, ViewMode } from '../services/eventBus';
import { bus } from '../services/eventBus';
import { getWorldData } from '../data';
import { CHAR_STATE_LABEL, VEHICLE_STATE_LABEL } from '../services/entityInfo';
import { STATUS_COLORS, STATUS_LABELS } from '../game/art/palette';
import { Dot, OriginBadge, StatusPill } from './common';

export type Section = 'inicio' | 'mapa' | 'areas' | 'funcionarios' | 'frota' | 'equipamentos' | 'producao' | 'indicadores' | 'informacoes';

export const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Início', icon: 'inicio' },
  { id: 'mapa', label: 'Mapa', icon: 'mapa' },
  { id: 'areas', label: 'Áreas', icon: 'areas' },
  { id: 'funcionarios', label: 'Funcionários', icon: 'funcionarios' },
  { id: 'frota', label: 'Frota', icon: 'frota' },
  { id: 'equipamentos', label: 'Equipamentos', icon: 'equipamentos' },
  { id: 'producao', label: 'Produção', icon: 'producao' },
  { id: 'indicadores', label: 'Indicadores', icon: 'indicadores' },
  { id: 'informacoes', label: 'Informações', icon: 'info' },
];

interface PanelProps {
  section: Section;
  snap: Snapshot | null;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  visibleFlows: string[];
  setVisibleFlows: (ids: string[]) => void;
  select: (ref: EntityRef) => void;
}

const machineAlerts = (snap: Snapshot | null) => {
  const d = getWorldData();
  return d.machines.filter((m) => {
    const s = snap?.machines[m.id] ?? m.status;
    return s === 'COM_PROBLEMA' || s === 'EM_MANUTENCAO';
  });
};

export function PanelContent(p: PanelProps) {
  switch (p.section) {
    case 'inicio':
      return <Inicio {...p} />;
    case 'mapa':
      return <Mapa {...p} />;
    case 'areas':
      return <Areas {...p} />;
    case 'funcionarios':
      return <Funcionarios {...p} />;
    case 'frota':
      return <Frota {...p} />;
    case 'equipamentos':
      return <Equipamentos {...p} />;
    case 'producao':
      return <Producao {...p} />;
    case 'indicadores':
      return <Indicadores {...p} />;
    case 'informacoes':
      return <Informacoes />;
  }
}

function Inicio({ snap, setMode, select }: PanelProps) {
  const d = getWorldData();
  const inside = snap ? Object.values(snap.vehicles).filter((v) => v.inside).length : 0;
  const alerts = machineAlerts(snap);
  return (
    <>
      <p className="lead">
        Representação virtual da unidade de <strong>Curitiba</strong>, reconstruída a partir da imagem aérea. Navegue pela planta, clique nos
        elementos e ative o fluxo operacional.
      </p>
      <div className="stat-grid">
        <Stat label="Veículos na planta" value={inside} />
        <Stat label="Funcionários" value={d.employees.length} note="fictícios" />
        <Stat label="Equipamentos" value={d.machines.length} />
        <Stat label="Alertas" value={alerts.length} tone={alerts.length ? 'warn' : undefined} />
      </div>
      <div className="btn-col">
        <button className="btn primary" onClick={() => setMode('operacional')}>
          Visualizar fluxo operacional
        </button>
        <button className="btn" onClick={() => bus.emit('cmd:fit')}>
          Ver planta completa
        </button>
      </div>
      {alerts.length > 0 && (
        <>
          <h4>Atenção</h4>
          <ul className="list">
            {alerts.map((m) => (
              <li key={m.id}>
                <button onClick={() => select({ kind: 'machine', id: m.id })}>
                  <span>{m.name}</span>
                  <StatusPill status={(snap?.machines[m.id] ?? m.status) as MachineStatus} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">Todos os números e nomes são demonstrativos.</p>
    </>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: number | string; note?: string; tone?: 'warn' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <b>{value}</b>
      <span>{label}</span>
      {note && <em>{note}</em>}
    </div>
  );
}

function Mapa({ select }: PanelProps) {
  const d = getWorldData();
  return (
    <>
      <h4>Navegação</h4>
      <dl className="kv">
        <dt>Mover câmera</dt>
        <dd>Clique e arraste, WASD ou setas</dd>
        <dt>Zoom</dt>
        <dd>Roda do mouse ou botões + / −</dd>
        <dt>Informações</dt>
        <dd>Clique em prédios, máquinas, veículos, pessoas ou no chão de uma área</dd>
      </dl>
      <h4>Legenda de setores</h4>
      <ul className="list">
        {d.zones.map((z) => (
          <li key={z.id}>
            <button onClick={() => select({ kind: 'zone', id: z.id })}>
              <span>
                <Dot color={z.color} /> {z.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">As cores dos setores seguem as marcações feitas sobre a imagem aérea.</p>
    </>
  );
}

function Areas({ select }: PanelProps) {
  const d = getWorldData();
  return (
    <ul className="list">
      {d.zones.map((z) => (
        <li key={z.id}>
          <button onClick={() => select({ kind: 'zone', id: z.id })}>
            <span>
              <Dot color={z.color} /> {z.name}
            </span>
            <OriginBadge origin={z.origin} />
          </button>
        </li>
      ))}
      <li className="sub">Edificações</li>
      {d.buildings.map((b) => (
        <li key={b.id}>
          <button onClick={() => select({ kind: 'building', id: b.id })}>
            <span>{b.name}</span>
            <OriginBadge origin={b.origin} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Funcionarios({ snap, select }: PanelProps) {
  const d = getWorldData();
  return (
    <>
      <p className="hint">Personagens fictícios, sem relação com funcionários reais.</p>
      <ul className="list">
        {d.employees.map((e) => {
          const live = snap?.employees[e.id];
          return (
            <li key={e.id}>
              <button onClick={() => select({ kind: 'employee', id: e.id })}>
                <span>
                  <strong>{e.name}</strong>
                  <small>{e.role}</small>
                </span>
                <span className="tag">{live ? CHAR_STATE_LABEL[live.state] : '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Frota({ snap, select }: PanelProps) {
  const d = getWorldData();
  const vs = d.vehicles.filter((v) => v.company !== 'Trânsito da avenida');
  const groups: [string, typeof vs][] = [
    ['Em operação', vs.filter((v) => snap && snap.vehicles[v.id]?.visible && snap.vehicles[v.id]?.state !== 'ESTACIONADO')],
    ['Estacionados', vs.filter((v) => !snap || snap.vehicles[v.id]?.state === 'ESTACIONADO')],
    ['Fora da planta', vs.filter((v) => snap && !snap.vehicles[v.id]?.visible)],
  ];
  return (
    <>
      {groups.map(([label, list]) => (
        <div key={label}>
          <h4>
            {label} <span className="count">{list.length}</span>
          </h4>
          <ul className="list">
            {list.map((v) => {
              const live = snap?.vehicles[v.id];
              return (
                <li key={v.id}>
                  <button onClick={() => select({ kind: 'vehicle', id: v.id })} disabled={!live?.visible}>
                    <span>
                      <strong>{v.plate}</strong>
                      <small>{live?.label ?? v.company}</small>
                    </span>
                    <span className="tag">{live ? VEHICLE_STATE_LABEL[live.state] : '—'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function Equipamentos({ snap, select }: PanelProps) {
  const d = getWorldData();
  const [filter, setFilter] = useState<MachineStatus | 'TODOS'>('TODOS');
  const list = d.machines.filter((m) => filter === 'TODOS' || (snap?.machines[m.id] ?? m.status) === filter);
  return (
    <>
      <div className="chips">
        {(['TODOS', 'EM_FUNCIONAMENTO', 'PARADA', 'EM_MANUTENCAO', 'COM_PROBLEMA'] as const).map((s) => (
          <button key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
            {s !== 'TODOS' && <Dot color={STATUS_COLORS[s]} />}
            {s === 'TODOS' ? 'Todos' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <ul className="list">
        {list.map((m) => (
          <li key={m.id}>
            <button onClick={() => select({ kind: 'machine', id: m.id })}>
              <span>
                <strong>{m.name}</strong>
                <small>{d.zones.find((z) => z.id === m.zoneId)?.name}</small>
              </span>
              <StatusPill status={snap?.machines[m.id] ?? m.status} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Producao({ mode, setMode, visibleFlows, setVisibleFlows, select }: PanelProps) {
  const d = getWorldData();
  const flows = d.flows.filter((f) => !f.ambient);
  const toggle = (id: string) => setVisibleFlows(visibleFlows.includes(id) ? visibleFlows.filter((x) => x !== id) : [...visibleFlows, id]);
  return (
    <>
      <button className={`btn ${mode === 'operacional' ? '' : 'primary'}`} onClick={() => setMode(mode === 'operacional' ? 'livre' : 'operacional')}>
        {mode === 'operacional' ? 'Voltar ao modo livre' : 'Visualizar fluxo no mapa'}
      </button>
      {flows.map((f) => (
        <div key={f.id} className="flow-card">
          <label className="flow-head">
            <input type="checkbox" checked={visibleFlows.includes(f.id)} onChange={() => toggle(f.id)} />
            <Dot color={f.color} />
            <strong>{f.name}</strong>
            <OriginBadge origin={f.origin} />
          </label>
          <ol className="steps">
            {f.stops.map((s) => (
              <li key={s.id}>
                <button onClick={() => s.zoneId && select({ kind: 'zone', id: s.zoneId })}>{s.label}</button>
              </li>
            ))}
          </ol>
          <p className="hint">{f.note}</p>
        </div>
      ))}
      <h4>Movimentação de produto</h4>
      {d.materials.map((m) => (
        <p key={m.id} className="hint">
          <Dot color="#d97706" /> {m.name} — {m.note}
        </p>
      ))}
    </>
  );
}

function Indicadores({ snap }: PanelProps) {
  const d = getWorldData();
  const byStatus = useMemo(() => {
    const out: Record<MachineStatus, number> = { EM_FUNCIONAMENTO: 0, PARADA: 0, EM_MANUTENCAO: 0, COM_PROBLEMA: 0 };
    for (const m of d.machines) out[(snap?.machines[m.id] ?? m.status) as MachineStatus]++;
    return out;
  }, [snap, d.machines]);
  const c = snap?.counters;
  const total = d.machines.length;
  return (
    <>
      <div className="notice">Indicadores da simulação desde que a página foi aberta. Não são dados reais.</div>
      <div className="stat-grid">
        <Stat label="Expedições concluídas" value={c?.expedicoes ?? 0} />
        <Stat label="Recebimentos" value={c?.recebimentos ?? 0} note="demonstrativo" />
        <Stat label="Abastecimentos diesel" value={c?.abastecimentos ?? 0} />
        <Stat label="Idas à manutenção" value={c?.manutencoes ?? 0} />
      </div>
      <h4>Equipamentos por status</h4>
      <div className="bars">
        {(Object.keys(byStatus) as MachineStatus[]).map((s) => (
          <div key={s} className="bar-row">
            <span>{STATUS_LABELS[s]}</span>
            <div className="bar">
              <i style={{ width: `${(byStatus[s] / total) * 100}%`, background: STATUS_COLORS[s] }} />
            </div>
            <b>{byStatus[s]}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function Informacoes() {
  return (
    <>
      <p className="lead">
        <strong>CBB Asfaltos Virtual</strong> é um protótipo de ferramenta visual corporativa: a planta industrial como ambiente navegável em pixel
        art isométrica.
      </p>
      <h4>Origem das informações</h4>
      <dl className="kv">
        <dt>
          <OriginBadge origin="informado" />
        </dt>
        <dd>Setores marcados sobre a imagem aérea</dd>
        <dt>
          <OriginBadge origin="aerea" />
        </dt>
        <dd>Visto na imagem aérea; uso a confirmar</dd>
        <dt>
          <OriginBadge origin="demonstrativo" />
        </dt>
        <dd>Ilustrativo — precisa de validação</dd>
      </dl>
      <h4>Privacidade</h4>
      <p className="hint">
        Nenhum dado interno da empresa é usado. Personagens, placas, capacidades e indicadores são fictícios. Não há conexão com sistemas
        corporativos.
      </p>
      <p className="hint">Versão 0.1.0 — MVP</p>
    </>
  );
}
