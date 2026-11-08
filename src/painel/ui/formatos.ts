const DIA = 86_400_000;

export function haQuanto(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')}`;
}

export const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const dataCurta = (iso: string) => iso.split('-').reverse().join('/');
export const toneladas = (kg: number) => `${(kg / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;

export type Situacao = 'ok' | 'atencao' | 'vencido';
export function situacaoValidade(iso: string, agora: number): { situacao: Situacao; texto: string } {
  const dias = Math.floor((Date.parse(iso + 'T23:59:59') - agora) / DIA);
  if (dias < 0) return { situacao: 'vencido', texto: `Vencido há ${-dias} d` };
  if (dias <= 30) return { situacao: 'atencao', texto: `Vence em ${dias} d` };
  return { situacao: 'ok', texto: 'Válido' };
}
