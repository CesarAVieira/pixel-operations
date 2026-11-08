/**
 * Paleta de uniformes e status. Cores da marca CBB ainda NÃO foram fornecidas — o acento âmbar
 * é provisório (sinalização industrial/asfalto). Ver DECISOES-TECNICAS.
 */
import type { MachineStatus, Uniform } from '../../types/world';

export const ACCENT = '#f2b632';

export const STATUS_COLORS: Record<MachineStatus, string> = {
  PARADA: '#9ca3af',
  EM_FUNCIONAMENTO: '#22c55e',
  EM_MANUTENCAO: '#f59e0b',
  COM_PROBLEMA: '#ef4444',
};

export const STATUS_LABELS: Record<MachineStatus, string> = {
  PARADA: 'Parada',
  EM_FUNCIONAMENTO: 'Em funcionamento',
  EM_MANUTENCAO: 'Em manutenção',
  COM_PROBLEMA: 'Com problema',
};

export interface UniformPalette {
  helmet: string | null;
  shirt: string;
  vest: string | null;
  stripe: string;
  pants: string;
  boots: string;
}

export const UNIFORMS: Record<Uniform, UniformPalette> = {
  operacional: { helmet: '#f3f4f6', shirt: '#2f3b4c', vest: '#f08a24', stripe: '#eef0f2', pants: '#2b2f36', boots: '#1c1917' },
  manutencao: { helmet: '#facc15', shirt: '#33548a', vest: null, stripe: '#cbd5e1', pants: '#2c4670', boots: '#1c1917' },
  administrativo: { helmet: null, shirt: '#e8eef4', vest: null, stripe: '#e8eef4', pants: '#3b3f47', boots: '#262626' },
  seguranca: { helmet: null, shirt: '#28323f', vest: null, stripe: '#9ca3af', pants: '#111827', boots: '#0a0a0a' },
  motorista: { helmet: null, shirt: '#6b7f96', vest: null, stripe: '#9ca3af', pants: '#3b4f78', boots: '#262626' },
  visitante: { helmet: ACCENT, shirt: '#0f766e', vest: '#d9f99d', stripe: '#f8fafc', pants: '#334155', boots: '#1c1917' },
};
