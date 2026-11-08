import type { DataOrigin, MachineStatus } from '../types/world';
import { ORIGIN_LABEL } from '../services/entityInfo';
import { STATUS_COLORS, STATUS_LABELS } from '../game/art/palette';

export function OriginBadge({ origin }: { origin: DataOrigin }) {
  return <span className={`badge badge-${origin}`}>{ORIGIN_LABEL[origin]}</span>;
}

export function StatusPill({ status }: { status: MachineStatus }) {
  return (
    <span className="status-pill">
      <i style={{ background: STATUS_COLORS[status] }} className={status === 'COM_PROBLEMA' ? 'blink' : ''} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return <i className="dot" style={{ background: color }} />;
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
