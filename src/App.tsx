import { useEffect, useState } from 'react';
import type { EntityRef } from './types/world';
import { bus, type ViewMode } from './services/eventBus';
import { getWorldData } from './data';
import { useBusEvent, useLog, useSnapshot } from './hooks/useBus';
import { GameCanvas } from './components/GameCanvas';
import { Icons, type IconName } from './ui/icons';
import { PanelContent, SECTIONS, type Section } from './ui/panels';
import { InfoCard } from './ui/InfoCard';
import { ChatBar } from './ui/ChatBar';
import { TopStats } from './ui/TopStats';

export default function App() {
  const [section, setSection] = useState<Section | null>(null);
  const [mode, setModeState] = useState<ViewMode>('livre');
  const [selected, setSelected] = useState<EntityRef | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(2);
  const [visibleFlows, setVisibleFlowsState] = useState<string[]>(() => getWorldData().flows.filter((f) => !f.ambient).map((f) => f.id));
  const snap = useSnapshot();
  const { log, push } = useLog();

  useBusEvent('game:select', setSelected);
  useBusEvent('game:hover', (h) => setHover(h?.name ?? null));
  useBusEvent('game:zoom', setZoom);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    bus.emit('cmd:mode', m);
  };
  const setVisibleFlows = (ids: string[]) => {
    setVisibleFlowsState(ids);
    bus.emit('cmd:flows', ids);
  };
  const select = (ref: EntityRef) => {
    setSelected(ref);
    bus.emit('cmd:select', ref);
  };
  const clearSelection = () => {
    setSelected(null);
    bus.emit('cmd:select', null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>CBB ASFALTOS</h1>
            <span>Virtual · Filial Curitiba</span>
          </div>
        </div>
        <TopStats snap={snap} />
        <div className="modes" role="group" aria-label="Modo de visualização">
          <button className={mode === 'livre' ? 'on' : ''} onClick={() => setMode('livre')}>
            Modo livre
          </button>
          <button className={mode === 'operacional' ? 'on' : ''} onClick={() => setMode('operacional')}>
            <Icons.flow /> Visualizar fluxo
          </button>
        </div>
        <div className="top-right">
          <span className="badge badge-demonstrativo">Dados demonstrativos</span>
          <span className="online">
            <i /> 1 usuário conectado
          </span>
        </div>
      </header>

      <nav className="rail" aria-label="Menu principal">
        {SECTIONS.map((s) => {
          const Icon = Icons[s.icon as IconName];
          return (
            <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(section === s.id ? null : s.id)} title={s.label}>
              <Icon />
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="stage" onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}>
        <GameCanvas />

        {section && (
          <aside className="panel">
            <header>
              <h2>{SECTIONS.find((s) => s.id === section)!.label}</h2>
              <button className="icon-btn" onClick={() => setSection(null)} aria-label="Fechar painel">
                <Icons.close />
              </button>
            </header>
            <div className="panel-body">
              <PanelContent
                section={section}
                snap={snap}
                mode={mode}
                setMode={setMode}
                visibleFlows={visibleFlows}
                setVisibleFlows={setVisibleFlows}
                select={select}
              />
            </div>
          </aside>
        )}

        {selected && <InfoCard selected={selected} snap={snap} onClose={clearSelection} select={select} />}

        {mode === 'operacional' && (
          <div className="mode-banner">
            <Icons.flow /> Modo operacional — clique numa área para identificá-la
            <button onClick={() => setMode('livre')}>Sair</button>
          </div>
        )}

        <div className="map-controls" role="group" aria-label="Controles do mapa">
          <button onClick={() => bus.emit('cmd:zoom', 1)} title="Aproximar">
            <Icons.plus />
          </button>
          <span className="zoom">{zoom.toFixed(1)}×</span>
          <button onClick={() => bus.emit('cmd:zoom', -1)} title="Afastar">
            <Icons.minus />
          </button>
          <button onClick={() => bus.emit('cmd:center')} title="Centralizar a planta">
            <Icons.target />
          </button>
          <button onClick={() => bus.emit('cmd:fit')} title="Mapa completo">
            <Icons.fit />
          </button>
        </div>

        {hover && (
          <div className="tooltip" style={{ left: mouse.x + 14, top: mouse.y + 12 }}>
            {hover}
          </div>
        )}

        <ChatBar log={log} onSend={(text) => push({ text, kind: 'usuario', author: 'Você' })} />
      </main>
    </div>
  );
}
