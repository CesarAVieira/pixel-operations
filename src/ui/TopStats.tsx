import { useState } from 'react';
import type { Snapshot } from '../services/eventBus';
import { bus } from '../services/eventBus';
import { useBusEvent } from '../hooks/useBus';
import { getWorldData } from '../data';

type DayMode = 'auto' | 'dia' | 'noite';

const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

/** Indicadores ao vivo da simulação + relógio do ciclo dia/noite. */
export function TopStats({ snap }: { snap: Snapshot | null }) {
  const [clock, setClock] = useState<{ hour: number; dark: number; mode: DayMode }>({ hour: 15.5, dark: 0, mode: 'auto' });
  useBusEvent('game:clock', setClock);
  const d = getWorldData();
  const vs = snap ? Object.entries(snap.vehicles) : [];
  const operating = vs.filter(([id, v]) => v.visible && v.inside && v.state !== 'ESTACIONADO' && !id.startsWith('AV-')).length;
  const loading = vs.filter(([, v]) => v.state === 'CARREGANDO').length;
  const working = snap ? Object.values(snap.employees).filter((e) => e.state === 'WORKING').length : 0;
  const alerts = d.machines.filter((m) => {
    const st = snap?.machines[m.id] ?? m.status;
    return st === 'COM_PROBLEMA' || st === 'EM_MANUTENCAO';
  }).length;
  const setMode = (m: DayMode) => bus.emit('cmd:daymode', m);
  return (
    <div className="topstats">
      <div className="kpi">
        <b>{operating}</b>
        <span>veículos em operação</span>
      </div>
      <div className={`kpi ${loading ? 'live' : ''}`}>
        <b>{loading}</b>
        <span>carregando agora</span>
      </div>
      <div className="kpi">
        <b>
          {working}
          <small>/{d.employees.length}</small>
        </b>
        <span>trabalhando</span>
      </div>
      <div className={`kpi ${alerts ? 'warn' : ''}`}>
        <b>{alerts}</b>
        <span>alertas</span>
      </div>
      <div className="clock" title="Ciclo dia/noite (simulado)">
        <b>{fmtHour(clock.hour)}</b>
        <div className="seg" role="group" aria-label="Iluminação">
          {(['dia', 'auto', 'noite'] as DayMode[]).map((m) => (
            <button key={m} className={clock.mode === m ? 'on' : ''} onClick={() => setMode(m)} title={m === 'auto' ? 'Ciclo automático' : m === 'dia' ? 'Dia' : 'Noite'}>
              {m === 'dia' ? '☀' : m === 'noite' ? '☾' : '⟳'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
