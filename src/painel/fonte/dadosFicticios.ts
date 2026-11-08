/**
 * Gerador de dados FICTÍCIOS (nomes, placas, documentos). Nada aqui corresponde a pessoas,
 * empresas ou veículos reais — serve apenas para demonstrar o painel até a API ser integrada.
 */
import type { DadosPedido, DocumentoVeiculo, Motorista, Veiculo } from '../dominio/tipos';

type Rng = () => number;
const pick = <T,>(r: Rng, a: readonly T[]) => a[Math.floor(r() * a.length)];
const dig = (r: Rng, n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join('');
const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const letra = (r: Rng) => LETRAS[Math.floor(r() * LETRAS.length)];

export const placaMercosul = (r: Rng) => `${letra(r)}${letra(r)}${letra(r)}${dig(r, 1)}${letra(r)}${dig(r, 2)}`;

const CLIENTES = [
  'Construtora Horizonte (fictícia)',
  'Pavimenta Sul Engenharia (fictícia)',
  'Via Araucária Obras (fictícia)',
  'Terraplenagem Campos Gerais (fictícia)',
  'Consórcio Rodovia Verde (fictício)',
  'Engemix Pavimentos (fictícia)',
  'Asfaltec Serviços Viários (fictícia)',
  'Construtora Serra do Mar (fictícia)',
];
const PRODUTOS = ['CAP 50/70', 'CAP 50/70', 'CAP 30/45', 'CAP Modificado 60/85-E', 'Emulsão RR-1C', 'Emulsão RL-1C'];
const DESTINOS: [string, string][] = [
  ['Ponta Grossa', 'PR'], ['Londrina', 'PR'], ['Maringá', 'PR'], ['Cascavel', 'PR'], ['Guarapuava', 'PR'],
  ['Paranaguá', 'PR'], ['Joinville', 'SC'], ['Blumenau', 'SC'], ['Lages', 'SC'], ['Chapecó', 'SC'],
];
const TRANSPORTADORAS = ['Transportes Serra Azul', 'Rodo Sul Logística', 'TransAsfalto Paraná', 'Expresso Araucária'];
const NOMES = ['João Pereira', 'Marcos Silveira', 'Ana Lúcia Prado', 'Carlos Rocha', 'Diego Martins', 'Rita Fagundes', 'Paulo Henrique Lima', 'Sérgio Tavares', 'Edson Moraes', 'Luciana Kowalski'];
const MODELOS: [string, string][] = [
  ['Scania R 450', '#d9483b'],
  ['Volvo FH 460', '#3c78c8'],
  ['Mercedes-Benz Actros 2651', '#2d6a73'],
  ['DAF XF 480', '#f2b632'],
  ['Iveco S-Way 480', '#3fa65a'],
  ['Volvo FH 540', '#f08a24'],
  ['Scania R 500', '#6b5bd6'],
];
const CAPACIDADES = [30000, 32000, 35000, 38000];

const DIA = 86_400_000;
const isoDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Validade relativa: maioria em dia, alguns vencendo em breve, raramente vencidos. */
function validade(r: Rng, agora: number) {
  const x = r();
  const dias = x < 0.06 ? -Math.floor(r() * 20) - 1 : x < 0.2 ? Math.floor(r() * 25) + 3 : Math.floor(r() * 500) + 40;
  return isoDia(agora + dias * DIA);
}

export function gerarCarga(r: Rng, seq: number, agora: number): { pedido: DadosPedido; veiculo: Veiculo; motorista: Motorista } {
  const [modelo, cor] = pick(r, MODELOS);
  const capacidadeKg = pick(r, CAPACIDADES);
  const quantidadeKg = Math.round((capacidadeKg * (0.8 + r() * 0.2)) / 500) * 500;
  const [cidade, uf] = pick(r, DESTINOS);
  const produto = pick(r, PRODUTOS);
  const documentos: DocumentoVeiculo[] = [
    { sigla: 'CRLV', nome: 'Licenciamento do veículo (CRLV-e)', numero: dig(r, 11), validade: validade(r, agora) },
    { sigla: 'CIV', nome: 'Certificado de Inspeção Veicular', numero: `CIV-${dig(r, 7)}`, validade: validade(r, agora) },
    { sigla: 'CIPP', nome: 'Certificado de Inspeção p/ Produtos Perigosos', numero: `CIPP-${dig(r, 7)}`, validade: validade(r, agora) },
    { sigla: 'RNTRC', nome: 'Registro ANTT do transportador', numero: dig(r, 9), validade: validade(r, agora) },
    { sigla: 'LAO', nome: 'Licença ambiental de transporte', numero: `LAO-${dig(r, 6)}`, validade: validade(r, agora) },
    { sigla: 'TAC', nome: 'Aferição do tacógrafo (Inmetro)', numero: dig(r, 8), validade: validade(r, agora) },
  ];
  // metade da frota é própria (pintura CBB), o resto são transportadoras terceiras
  const propria = r() < 0.5;
  return {
    pedido: {
      numero: `PV-${String(seq).padStart(6, '0')}`,
      cliente: { nome: pick(r, CLIENTES), cnpj: `00.${dig(r, 3)}.${dig(r, 3)}/0001-${dig(r, 2)}` },
      produto,
      quantidadeKg,
      destino: { cidade, uf },
      temperaturaC: produto.startsWith('Emulsão') ? 60 + Math.floor(r() * 15) : 150 + Math.floor(r() * 25),
    },
    veiculo: {
      placaCavalo: placaMercosul(r),
      placaReboque: placaMercosul(r),
      modelo: propria ? 'Mercedes-Benz Axor 2544' : modelo,
      tipo: 'Cavalo + semirreboque tanque térmico',
      transportadora: propria ? 'Frota própria CBB Asfaltos' : pick(r, TRANSPORTADORAS) + ' (fictícia)',
      capacidadeKg,
      taraKg: 14500 + Math.round(r() * 30) * 100,
      corCabine: propria ? '#eef0f2' : cor,
      frotaPropria: propria,
      documentos,
    },
    motorista: {
      nome: pick(r, NOMES),
      cpf: `***.${dig(r, 3)}.${dig(r, 3)}-**`,
      telefone: `(41) 9${dig(r, 4)}-${dig(r, 4)}`,
      cnh: { numero: dig(r, 11), categoria: 'E', validade: validade(r, agora) },
      mopp: { validade: validade(r, agora) },
    },
  };
}

export const chaveAcesso = (r: Rng) => dig(r, 44);
export const numeroNota = (r: Rng) => `${dig(r, 3)}.${dig(r, 3)}`;
