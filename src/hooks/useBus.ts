import { useEffect, useRef, useState } from 'react';
import { bus, type BusEvents, type LogEntry, type Snapshot } from '../services/eventBus';

export function useBusEvent<K extends keyof BusEvents>(key: K, fn: (p: BusEvents[K]) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => bus.on(key, (p) => ref.current(p)), [key]);
}

export function useSnapshot(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useBusEvent('game:snapshot', setSnap);
  return snap;
}

const MAX_LOG = 120;

export function useLog() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const seq = useRef(0);
  const t0 = useRef(performance.now());
  const push = (e: Omit<LogEntry, 'id' | 'time'>) =>
    setLog((l) => [...l.slice(-MAX_LOG + 1), { ...e, id: ++seq.current, time: (performance.now() - t0.current) / 1000 }]);
  useBusEvent('game:log', push);
  return { log, push };
}
