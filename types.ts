
export enum RiskLevel {
  LOW = 'Baixo',
  MEDIUM = 'Médio',
  HIGH = 'Alto',
  UNKNOWN = 'Desconhecido'
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface BeachData {
  name: string;
  city: string;
  state: string;
  riskLevel: RiskLevel;
  mainWarning: string; // Ex: "Correnteza forte no canto direito"
  hazards: string[]; // Lista de perigos
  rockRisk: string; // Risco de pedras/escorregamento
  seaCharacteristics: string;
  depthDescription: string;
  childFriendly: boolean; // Novo campo: Indicado para crianças
  childFriendlyReason: string; // Novo campo: Motivo (ex: Mar calmo)
  lifeguardPresence: boolean;
  bestTime: string;
  accidentHistory: string; // Histórico de ocorrências
  distanceToCenter?: string; // Ex: "200m do ponto principal"
  coordinates?: {
    lat: number;
    lng: number;
  };
  sources?: GroundingSource[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string;
  timestamp?: Date;
  sources?: GroundingSource[];
}

export type Tab = 'home' | 'alerts' | 'info' | 'assistant';
