import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../services/eventBus';
import { Icons } from './icons';
import { fmtTime } from './common';

interface Props {
  log: LogEntry[];
  onSend: (text: string) => void;
}

const KIND_LABEL: Record<LogEntry['kind'], string> = {
  sistema: 'Sistema',
  veiculo: 'Frota',
  equipamento: 'Equipamento',
  usuario: 'Você',
  area: 'Área',
};

/** Canal local: eventos da simulação + mensagens digitadas (não são enviadas a lugar nenhum). */
export function ChatBar({ log, onSend }: Props) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const last = log[log.length - 1];

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [log, open]);

  return (
    <section className={`chat ${open ? 'open' : ''}`}>
      {open && (
        <div className="chat-log" ref={listRef}>
          {log.map((e) => (
            <p key={e.id} className={`msg msg-${e.kind}`}>
              <time>{fmtTime(e.time)}</time>
              <b>{e.author ?? KIND_LABEL[e.kind]}</b>
              <span>{e.text}</span>
            </p>
          ))}
        </div>
      )}
      <form
        className="chat-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSend(text.trim());
          setText('');
        }}
      >
        <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Recolher canal' : 'Expandir canal'}>
          <span className={open ? 'rot' : ''}>
            <Icons.chevron />
          </span>
        </button>
        {!open && last && (
          <span className="chat-last">
            <b>{last.author ?? KIND_LABEL[last.kind]}</b> {last.text}
          </span>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem no canal da planta (local, não é enviada)" aria-label="Mensagem" />
        <button className="btn small" type="submit">
          Enviar
        </button>
      </form>
    </section>
  );
}
