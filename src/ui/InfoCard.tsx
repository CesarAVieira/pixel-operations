import type { EntityRef, MachineStatus } from '../types/world';
import type { Snapshot } from '../services/eventBus';
import { bus } from '../services/eventBus';
import { describeEntity } from '../services/entityInfo';
import { getWorldData } from '../data';
import { STATUS_LABELS } from '../game/art/palette';
import { Icons } from './icons';
import { OriginBadge, StatusPill } from './common';

interface Props {
  selected: EntityRef;
  snap: Snapshot | null;
  onClose: () => void;
  select: (ref: EntityRef) => void;
}

export function InfoCard({ selected, snap, onClose, select }: Props) {
  const info = describeEntity(selected, getWorldData(), snap);
  if (!info) return null;
  return (
    <aside className="info-card" aria-label="Informações do item selecionado">
      <header>
        <div>
          <h3>{info.title}</h3>
          <span className="sub">{info.subtitle}</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar">
          <Icons.close />
        </button>
      </header>
      <div className="row">
        <OriginBadge origin={info.origin} />
        {info.status && <StatusPill status={info.status} />}
      </div>
      {info.description && <p className="desc">{info.description}</p>}
      <dl className="kv">
        {info.fields.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {selected.kind === 'machine' && (
        <label className="sim">
          Simular status
          <select value={info.status} onChange={(e) => bus.emit('cmd:machineStatus', { id: selected.id, status: e.target.value as MachineStatus })}>
            {(Object.keys(STATUS_LABELS) as MachineStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      {info.related?.map((r) => (
        <div key={r.label} className="related">
          <h4>{r.label}</h4>
          <ul>
            {r.items.map((it) => (
              <li key={it.ref.id}>
                <button onClick={() => select(it.ref)}>{it.name}</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button className="btn small" onClick={() => bus.emit('cmd:focus', selected)}>
        <Icons.target /> Centralizar
      </button>
    </aside>
  );
}
