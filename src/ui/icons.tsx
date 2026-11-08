import type { ReactNode } from 'react';

const S = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icons = {
  inicio: () => (
    <S>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </S>
  ),
  mapa: () => (
    <S>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </S>
  ),
  areas: () => (
    <S>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="5" rx="1" />
      <rect x="13" y="10" width="8" height="11" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
    </S>
  ),
  funcionarios: () => (
    <S>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3 3 0 010 5.6M18 14.5c1.8.8 3 2.7 3 5" />
    </S>
  ),
  frota: () => (
    <S>
      <rect x="2" y="7" width="12" height="9" rx="1" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </S>
  ),
  equipamentos: () => (
    <S>
      <ellipse cx="9" cy="6" rx="5" ry="2" />
      <path d="M4 6v12c0 1.1 2.2 2 5 2s5-.9 5-2V6" />
      <path d="M14 12h4v8M18 12l3-3" />
    </S>
  ),
  producao: () => (
    <S>
      <path d="M4 6h6v4H4zM14 14h6v4h-6z" />
      <path d="M7 10v4a2 2 0 002 2h5" />
      <path d="M12 14l2 2-2 2" />
    </S>
  ),
  indicadores: () => (
    <S>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </S>
  ),
  info: () => (
    <S>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </S>
  ),
  plus: () => (
    <S>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  minus: () => (
    <S>
      <path d="M5 12h14" />
    </S>
  ),
  target: () => (
    <S>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </S>
  ),
  fit: () => (
    <S>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </S>
  ),
  close: () => (
    <S>
      <path d="M6 6l12 12M18 6L6 18" />
    </S>
  ),
  flow: () => (
    <S>
      <path d="M3 7h11l-3-3M21 17H10l3 3" />
    </S>
  ),
  chat: () => (
    <S>
      <path d="M4 5h16v11H9l-5 4z" />
    </S>
  ),
  chevron: () => (
    <S>
      <path d="M6 15l6-6 6 6" />
    </S>
  ),
};

export type IconName = keyof typeof Icons;
