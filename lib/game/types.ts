export type ResourceKey = 'credits' | 'oil' | 'metal' | 'energy' | 'food';
export type ResourceBundle = Record<ResourceKey, number>;
export type BuildingId = 'hq' | 'barracks' | 'armor' | 'artillery' | 'airbase' | 'warehouse' | 'refinery' | 'research' | 'comms' | 'defense';
export type UnitId = 'rifle' | 'assault' | 'recon' | 'light_tank' | 'medium_tank' | 'heavy_tank' | 'howitzer' | 'rocket' | 'fighter' | 'strike' | 'bomber';
export type TechId = 'industry' | 'infantry' | 'armor' | 'aviation' | 'economy' | 'defense' | 'signals';
export type WorldNodeKind = 'own' | 'base' | 'neutral' | 'city' | 'resource' | 'alliance';
export type AttackDirection = 'frontal' | 'north' | 'flank';

export interface UserIdentity {
  id: string;
  username: string;
  email?: string;
  createdAt?: number;
}

export interface BuildingJob {
  id: string;
  building: BuildingId;
  fromLevel: number;
  toLevel: number;
  startedAt: number;
  finishAt: number;
}

export interface TrainingJob {
  id: string;
  unit: UnitId;
  count: number;
  startedAt: number;
  finishAt: number;
}

export interface ResearchJob {
  id: string;
  technology: TechId;
  startedAt: number;
  finishAt: number;
}

export interface ScoutMission {
  id: string;
  targetId: string;
  targetName: string;
  startedAt: number;
  finishAt: number;
}

export interface ScoutReport {
  id: string;
  targetId: string;
  targetName: string;
  createdAt: number;
  expiresAt: number;
  estimatedUnits: string;
  defenseEstimate: 'низкая' | 'умеренная' | 'высокая' | 'критическая';
  resourceEstimate: string;
  structures: string[];
  detail: string;
}

export interface BattleReport {
  id: string;
  targetId: string;
  targetName: string;
  outcome: 'victory' | 'defeat';
  attacker: string;
  defender: string;
  unit: UnitId;
  direction: AttackDirection;
  sent: number;
  attackerLosses: number;
  enemyDestroyed: number;
  defensePower: number;
  loot: Partial<ResourceBundle>;
  xp: number;
  ratingDelta: number;
  territoryCaptured: boolean;
  createdAt: number;
  summary: string;
}

export interface NotificationItem {
  id: string;
  kind: 'system' | 'battle' | 'building' | 'research' | 'army' | 'scout' | 'alliance' | 'market';
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'Оборудование' | 'Декор' | 'Особые' | 'Коллекционные';
  rarity: 'Обычный' | 'Редкий' | 'Эпический' | 'Легендарный';
  description: string;
  bonus: string;
  equipped: boolean;
  icon: string;
}

export interface GameStats {
  wins: number;
  losses: number;
  unitsProduced: number;
  scoutsSent: number;
  missionsCompleted: number;
  territoryCount: number;
  armyPower: number;
  rating: number;
  wealth: number;
  totalBattles: number;
  lastSupplyAt: number;
}

export interface MarketTrade {
  id: string;
  from: ResourceKey;
  to: ResourceKey;
  amount: number;
  received: number;
  createdAt: number;
}

export interface GameState {
  schemaVersion: number;
  userId: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  lastTickAt: number;
  xp: number;
  resources: ResourceBundle;
  productionRemainder: ResourceBundle;
  buildings: Record<BuildingId, number>;
  units: Record<UnitId, number>;
  technologies: Record<TechId, number>;
  buildingQueue: BuildingJob[];
  trainingQueue: TrainingJob[];
  researchJob: ResearchJob | null;
  scoutMissions: ScoutMission[];
  scoutReports: ScoutReport[];
  battleReports: BattleReport[];
  notifications: NotificationItem[];
  inventory: InventoryItem[];
  claimedMissions: string[];
  dailyDay: string;
  dailyScouts: number;
  dailySupplies: number;
  dailyClaims: string[];
  territories: string[];
  marketHistory: MarketTrade[];
  allianceId: string | null;
  avatar: string;
  bio: string;
  stats: GameStats;
}

export interface WorldNode {
  id: string;
  name: string;
  kind: WorldNodeKind;
  x: number;
  y: number;
  level: number;
  owner: string;
  ownerUserId: string | null;
  allianceTag: string | null;
  defensePower: number;
  resources: Partial<ResourceBundle>;
  isOwn: boolean;
  isCaptured: boolean;
  subtitle: string;
}

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  short: string;
  category: string;
  description: string;
  effect: string;
  symbol: string;
  x: number;
  y: number;
  cost: Partial<ResourceBundle>;
  baseSeconds: number;
}

export interface UnitDefinition {
  id: UnitId;
  name: string;
  branch: string;
  description: string;
  attack: number;
  defense: number;
  health: number;
  speed: number;
  cost: Partial<ResourceBundle>;
  seconds: number;
  building: BuildingId;
  buildingLevel: number;
  requirement?: TechId;
}

export interface TechnologyDefinition {
  id: TechId;
  name: string;
  branch: string;
  description: string;
  effect: string;
  cost: Partial<ResourceBundle>;
  seconds: number;
  prerequisite?: TechId;
}

export interface MissionDefinition {
  id: string;
  name: string;
  description: string;
  reward: Partial<ResourceBundle>;
  xp: number;
  category: 'Постоянная' | 'Ежедневная';
}

export interface RankingEntry {
  rank: number;
  username: string;
  level: number;
  rating: number;
  armyPower: number;
  territories: number;
  wins: number;
  wealth: number;
  alliance: string;
  isSelf?: boolean;
}

export interface AllianceInfo {
  id: string;
  name: string;
  tag: string;
  description: string;
  leader: string;
  memberCount: number;
  territories: number;
  rating: number;
  isMember: boolean;
  relation: string;
}

export interface AllianceMessage {
  id: string;
  username: string;
  role: string;
  message: string;
  createdAt: number;
}

export interface GameSnapshot {
  user: UserIdentity;
  game: GameState;
  world: WorldNode[];
  rankings: Record<string, RankingEntry[]>;
  alliances: AllianceInfo[];
  allianceMessages: AllianceMessage[];
  playerAlliance: AllianceInfo | null;
  serverTime: number;
}
