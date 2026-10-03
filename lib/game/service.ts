import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { BUILDING_BY_ID, BUILDINGS, MARKET_DEALS, MISSIONS, RESOURCE_KEYS, TECH_BY_ID, TECHNOLOGIES, UNIT_BY_ID, UNITS, emptyResources, getUpgradeCost, getUpgradeSeconds, hasResources, levelForXp, scaledCost } from './catalog';
import type { AllianceInfo, AllianceMessage, AttackDirection, BattleReport, BuildingId, GameSnapshot, GameState, InventoryItem, MarketTrade, NotificationItem, RankingEntry, ResourceBundle, ResourceKey, ScoutReport, TechId, UnitId, WorldNode } from './types';

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'GameError';
    this.status = status;
  }
}

const emptyBuildings = (): GameState['buildings'] => ({ hq: 1, barracks: 2, armor: 1, artillery: 1, airbase: 1, warehouse: 1, refinery: 1, research: 1, comms: 1, defense: 1 });
const emptyUnits = (): GameState['units'] => ({ rifle: 110, assault: 22, recon: 18, light_tank: 7, medium_tank: 0, heavy_tank: 0, howitzer: 2, rocket: 0, fighter: 1, strike: 0, bomber: 0 });
const emptyTech = (): GameState['technologies'] => ({ industry: 0, infantry: 0, armor: 0, aviation: 0, economy: 0, defense: 0, signals: 0 });

function initialInventory(): InventoryItem[] {
  return [
    { id: 'field_compass', name: 'Компас «Север»', category: 'Оборудование', rarity: 'Редкий', description: 'Полевой прибор навигации с люминесцентной шкалой.', bonus: '+5% к скорости разведки', equipped: true, icon: '⌖' },
    { id: 'steel_emblem', name: 'Знак гарнизона', category: 'Декор', rarity: 'Обычный', description: 'Эмблема первой смены командного центра.', bonus: 'Косметический предмет', equipped: false, icon: '✦' },
    { id: 'sealed_crate', name: 'Запечатанный контейнер', category: 'Особые', rarity: 'Эпический', description: 'Комплект оборудования времён северной кампании.', bonus: 'Редкая находка · Web3-совместимый предмет', equipped: false, icon: '▣' },
    { id: 'sector_patch', name: 'Нашивка сектора 09', category: 'Коллекционные', rarity: 'Легендарный', description: 'Коллекционная нашивка первого дозора.', bonus: 'Уникальная косметика командира', equipped: false, icon: '◈' },
  ];
}

function freshState(userId: string, username: string, now = Date.now()): GameState {
  return {
    schemaVersion: 1,
    userId,
    username,
    createdAt: now,
    updatedAt: now,
    lastTickAt: now,
    xp: 0,
    resources: { credits: 14200, oil: 6200, metal: 9300, energy: 3600, food: 8400 },
    productionRemainder: emptyResources(),
    buildings: emptyBuildings(),
    units: emptyUnits(),
    technologies: emptyTech(),
    buildingQueue: [],
    trainingQueue: [],
    researchJob: null,
    scoutMissions: [],
    scoutReports: [],
    battleReports: [],
    notifications: [
      { id: randomUUID(), kind: 'system', title: 'Канал командования открыт', body: 'Гарнизон сектора 09 готов к приказам. Рады видеть вас, командир.', createdAt: now, read: false },
      { id: randomUUID(), kind: 'system', title: 'Полевой резерв доступен', body: 'Заберите первую партию ресурсов в центре снабжения.', createdAt: now - 8000, read: false },
    ],
    inventory: initialInventory(),
    claimedMissions: [],
    dailyDay: new Date(now).toISOString().slice(0, 10),
    dailyScouts: 0,
    dailySupplies: 0,
    dailyClaims: [],
    territories: [],
    marketHistory: [],
    allianceId: null,
    avatar: username.slice(0, 2).toUpperCase(),
    bio: 'Командир сектора · на связи',
    stats: { wins: 0, losses: 0, unitsProduced: 0, scoutsSent: 0, missionsCompleted: 0, territoryCount: 0, armyPower: 0, rating: 1200, wealth: 0, totalBattles: 0, lastSupplyAt: 0 },
  };
}

function row<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

function rows<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

function persistState(state: GameState): void {
  state.updatedAt = Date.now();
  db.prepare(`INSERT INTO game_states (user_id, state_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .run(state.userId, JSON.stringify(state), state.updatedAt);
}

export function readState(userId: string): GameState {
  const found = row<{ state_json: string }>('SELECT state_json FROM game_states WHERE user_id = ?', userId);
  if (found?.state_json) {
    try {
      const parsed = JSON.parse(found.state_json) as GameState;
      parsed.username = String(row<{ username: string }>('SELECT username FROM users WHERE id = ?', userId)?.username || parsed.username);
      return parsed;
    } catch {
      // A malformed prototype save is rebuilt rather than blocking login.
    }
  }
  const username = row<{ username: string }>('SELECT username FROM users WHERE id = ?', userId)?.username || 'Командир';
  const state = freshState(userId, username);
  persistState(state);
  ensurePlayerNode(userId, username);
  return state;
}

export function ensureGameForUser(userId: string, username: string): GameState {
  return db.transaction(() => {
    const found = row<{ state_json: string }>('SELECT state_json FROM game_states WHERE user_id = ?', userId);
    if (found?.state_json) {
      const state = JSON.parse(found.state_json) as GameState;
      if (state.username !== username) {
        state.username = username;
        persistState(state);
      }
      ensurePlayerNode(userId, username);
      return state;
    }
    const state = freshState(userId, username);
    persistState(state);
    ensurePlayerNode(userId, username);
    return state;
  })();
}

function playerNodeId(userId: string): string {
  return `base_${userId}`;
}

function stablePosition(userId: string): { x: number; y: number } {
  if (userId === 'demo') return { x: 50, y: 50 };
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const x = 8 + (Math.abs(hash) % 84);
  const y = 10 + (Math.abs((hash >> 8) * 17) % 80);
  return { x, y };
}

function ensurePlayerNode(userId: string, username: string): void {
  const id = playerNodeId(userId);
  const found = row('SELECT id FROM world_nodes WHERE id = ?', id);
  if (found) {
    db.prepare('UPDATE world_nodes SET owner = ? WHERE id = ?').run(username, id);
    return;
  }
  const point = stablePosition(userId);
  db.prepare(`INSERT INTO world_nodes
    (id, name, kind, x, y, level, owner, owner_user_id, alliance_tag, defense_power, resources_json, subtitle, is_npc)
    VALUES (?, ?, 'base', ?, ?, 1, ?, ?, NULL, 610, ?, ?, 0)`)
    .run(id, `${username} · база`, point.x, point.y, username, userId, JSON.stringify({ credits: 950, metal: 420, oil: 210 }), 'Игрок · домашний сектор');
}

function getUser(userId: string): { id: string; username: string; email: string | null; createdAt: number } {
  const user = row<{ id: string; username: string; email: string | null; created_at: number }>('SELECT id, username, email, created_at FROM users WHERE id = ?', userId);
  if (!user) throw new GameError('Аккаунт не найден. Обновите страницу или войдите снова.', 401);
  return { id: user.id, username: user.username, email: user.email, createdAt: user.created_at };
}

function addNotification(state: GameState, kind: NotificationItem['kind'], title: string, body: string, now = Date.now()): void {
  state.notifications.unshift({ id: randomUUID(), kind, title, body, createdAt: now, read: false });
  state.notifications = state.notifications.slice(0, 48);
}

function productionPerHour(state: GameState): ResourceBundle {
  const eco = 1 + (state.technologies.economy || 0) * 0.12;
  return {
    credits: Math.round((760 + state.buildings.hq * 110 + state.buildings.warehouse * 65) * eco),
    oil: Math.round((state.buildings.refinery * 290 + 50) * eco),
    metal: Math.round((270 + state.buildings.armor * 75 + state.buildings.artillery * 55 + state.buildings.warehouse * 25) * eco),
    energy: Math.round((165 + state.buildings.research * 70 + state.buildings.comms * 34) * eco),
    food: Math.round((380 + state.buildings.barracks * 58 + state.buildings.warehouse * 40) * eco),
  };
}

function estimateUnits(power: number): string {
  if (power < 420) return 'Малый дозор · до 40 бойцов';
  if (power < 720) return 'Смешанный гарнизон · 40–90 ед.';
  if (power < 1100) return 'Усиленная группа · 90–150 ед.';
  return 'Крупный гарнизон · 150+ ед.';
}

function settleState(userId: string, state: GameState, now = Date.now()): void {
  const dayKey = new Date(now).toISOString().slice(0, 10);
  if (state.dailyDay !== dayKey) {
    const wasInitialized = Boolean(state.dailyDay);
    state.dailyDay = dayKey;
    state.dailyScouts = 0;
    state.dailySupplies = 0;
    state.dailyClaims = [];
    if (wasInitialized) addNotification(state, 'system', 'Новый оперативный день', 'Ежедневные задания обновлены. Проверьте полевой план.', now);
  }
  const elapsed = Math.max(0, Math.min(12 * 60 * 60 * 1000, now - (state.lastTickAt || now)));
  const production = productionPerHour(state);
  state.productionRemainder ||= emptyResources();
  for (const key of RESOURCE_KEYS) {
    const accrued = production[key] * elapsed / 3_600_000 + (state.productionRemainder[key] || 0);
    const whole = Math.floor(accrued);
    state.resources[key] = Math.min(9_999_999, state.resources[key] + whole);
    state.productionRemainder[key] = state.resources[key] >= 9_999_999 ? 0 : accrued - whole;
  }
  state.lastTickAt = now;

  const completedBuilds = state.buildingQueue.filter((job) => job.finishAt <= now);
  if (completedBuilds.length) {
    state.buildingQueue = state.buildingQueue.filter((job) => job.finishAt > now);
    for (const job of completedBuilds) {
      state.buildings[job.building] = Math.max(state.buildings[job.building], job.toLevel);
      if (job.building === 'hq') db.prepare('UPDATE world_nodes SET level = ? WHERE id = ?').run(job.toLevel, playerNodeId(userId));
      const title = BUILDING_BY_ID[job.building].name;
      state.xp += 24 + job.toLevel * 8;
      addNotification(state, 'building', 'Строительство завершено', `${title} улучшен до ${job.toLevel} уровня.`, now);
    }
  }
  const completedTraining = state.trainingQueue.filter((job) => job.finishAt <= now);
  if (completedTraining.length) {
    state.trainingQueue = state.trainingQueue.filter((job) => job.finishAt > now);
    for (const job of completedTraining) {
      state.units[job.unit] += job.count;
      state.stats.unitsProduced += job.count;
      state.xp += Math.max(4, Math.ceil(job.count * 0.7));
      addNotification(state, 'army', 'Подготовка завершена', `${job.count} × ${UNIT_BY_ID[job.unit].name} заступили в гарнизон.`, now);
    }
  }
  if (state.researchJob && state.researchJob.finishAt <= now) {
    const tech = state.researchJob.technology;
    state.technologies[tech] = (state.technologies[tech] || 0) + 1;
    state.researchJob = null;
    state.xp += 80;
    addNotification(state, 'research', 'Исследование завершено', `Технология «${TECH_BY_ID[tech].name}» изучена.`, now);
  }

  const completedScouts = state.scoutMissions.filter((mission) => mission.finishAt <= now);
  if (completedScouts.length) {
    state.scoutMissions = state.scoutMissions.filter((mission) => mission.finishAt > now);
    for (const mission of completedScouts) {
      state.dailyScouts = (state.dailyScouts || 0) + 1;
      const target = row<{ defense_power: number; level: number; resources_json: string; name: string }>('SELECT defense_power, level, resources_json, name FROM world_nodes WHERE id = ?', mission.targetId);
      const defensePower = target?.defense_power || 300;
      const targetLevel = target?.level || 1;
      let targetResources: Partial<ResourceBundle> = {};
      try { targetResources = JSON.parse(target?.resources_json || '{}') as Partial<ResourceBundle>; } catch { targetResources = {}; }
      const total = Object.values(targetResources).reduce((sum, item) => sum + (item || 0), 0);
      const report: ScoutReport = {
        id: randomUUID(), targetId: mission.targetId, targetName: target?.name || mission.targetName,
        createdAt: now, expiresAt: now + 10 * 60_000, estimatedUnits: estimateUnits(defensePower),
        defenseEstimate: defensePower < 420 ? 'низкая' : defensePower < 750 ? 'умеренная' : defensePower < 1200 ? 'высокая' : 'критическая',
        resourceEstimate: total < 1200 ? 'Запасы скромные' : total < 3000 ? 'Запасы умеренные' : 'Крупные резервы обнаружены',
        structures: targetLevel >= 4 ? ['Укреплённый периметр', 'Тяжёлые ангары', 'Складской контур'] : targetLevel >= 2 ? ['Полевые укрепления', 'Склад снабжения'] : ['Наблюдательный пост'],
        detail: `Точность сигнала ${Math.min(96, 58 + state.buildings.comms * 5 + (state.technologies.signals || 0) * 12)}% · данные действительны 10 минут.`,
      };
      state.scoutReports.unshift(report);
      addNotification(state, 'scout', 'Разведка завершена', `Получен доклад по объекту «${report.targetName}».`, now);
    }
    state.scoutReports = state.scoutReports.slice(0, 12);
  }

  state.stats.armyPower = calculateArmyPower(state);
  state.stats.wealth = RESOURCE_KEYS.reduce((sum, key) => sum + state.resources[key], 0);
  ensurePlayerNode(userId, state.username);
}

export function calculateArmyPower(state: GameState): number {
  const units = UNITS.reduce((total, unit) => total + state.units[unit.id] * (unit.attack + unit.defense + Math.floor(unit.health / 10)), 0);
  const buildings = Object.values(state.buildings).reduce((sum, level) => sum + level * 115, 0);
  return Math.round(units + buildings + state.stats.territoryCount * 220);
}

function getWorld(userId: string, state: GameState): WorldNode[] {
  const nodeRows = rows<{ id: string; name: string; kind: string; x: number; y: number; level: number; owner: string; owner_user_id: string | null; alliance_tag: string | null; defense_power: number; resources_json: string; subtitle: string }>(`SELECT id, name, kind, x, y, level, owner, owner_user_id, alliance_tag, defense_power, resources_json, subtitle FROM world_nodes ORDER BY kind, name`);
  return nodeRows.map((item) => {
    let resources: Partial<ResourceBundle> = {};
    try { resources = JSON.parse(item.resources_json || '{}') as Partial<ResourceBundle>; } catch { resources = {}; }
    let defensePower = item.defense_power;
    let owner = item.owner;
    if (item.owner_user_id) {
      const remoteState = readState(item.owner_user_id);
      defensePower = calculateArmyPower(remoteState) + (remoteState.buildings.defense * 70);
      owner = remoteState.username;
    }
    const isOwn = item.owner_user_id === userId && item.id === playerNodeId(userId);
    const isCaptured = Boolean(item.owner_user_id && item.id !== playerNodeId(item.owner_user_id));
    return {
      id: item.id, name: item.name, kind: isOwn ? 'own' : (item.kind as WorldNode['kind']), x: item.x, y: item.y,
      level: item.level, owner, ownerUserId: item.owner_user_id, allianceTag: item.alliance_tag, defensePower,
      resources, isOwn, isCaptured, subtitle: item.subtitle,
    };
  });
}

function getPlayerAlliance(userId: string, state: GameState): AllianceInfo | null {
  const result = row<{ a: string; n: string; tag: string; description: string; leader_user_id: string | null; npc_members: number; territories: number; rating: number; role: string }>(`SELECT a.id AS a, a.name AS n, a.tag, a.description, a.leader_user_id, a.npc_members, a.territories, a.rating, m.role
    FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id WHERE m.user_id = ?`, userId);
  if (!result) return null;
  const actual = row<{ count: number }>('SELECT COUNT(*) AS count FROM alliance_members WHERE alliance_id = ?', result.a)?.count || 0;
  const leader = result.leader_user_id ? row<{ username: string }>('SELECT username FROM users WHERE id = ?', result.leader_user_id)?.username : 'Штаб союза';
  return { id: result.a, name: result.n, tag: result.tag, description: result.description, leader: leader || 'Штаб союза', memberCount: Number(result.npc_members) + Number(actual), territories: result.territories, rating: result.rating, isMember: true, relation: result.role };
}

function getAllianceInfo(userId: string, state: GameState): { alliances: AllianceInfo[]; messages: AllianceMessage[]; playerAlliance: AllianceInfo | null } {
  const membership = rows<{ alliance_id: string }>('SELECT alliance_id FROM alliance_members WHERE user_id = ?', userId).map((item) => item.alliance_id);
  const rels = rows<{ alliance_a: string; alliance_b: string; status: string }>('SELECT alliance_a, alliance_b, status FROM diplomatic_relations');
  const allianceRows = rows<{ id: string; name: string; tag: string; description: string; leader_user_id: string | null; npc_members: number; territories: number; rating: number }>('SELECT * FROM alliances ORDER BY rating DESC');
  const alliances = allianceRows.map((item) => {
    const actual = row<{ count: number }>('SELECT COUNT(*) AS count FROM alliance_members WHERE alliance_id = ?', item.id)?.count || 0;
    const leader = item.leader_user_id ? row<{ username: string }>('SELECT username FROM users WHERE id = ?', item.leader_user_id)?.username : 'Совет гарнизона';
    const relation = rels.find((relation) => (relation.alliance_a === state.allianceId && relation.alliance_b === item.id) || (relation.alliance_b === state.allianceId && relation.alliance_a === item.id));
    return { id: item.id, name: item.name, tag: item.tag, description: item.description, leader: leader || 'Совет гарнизона', memberCount: Number(item.npc_members) + Number(actual), territories: item.territories, rating: item.rating, isMember: membership.includes(item.id), relation: relation?.status || 'Нейтралитет' };
  });
  const playerAlliance = getPlayerAlliance(userId, state);
  const messages = playerAlliance ? rows<{ id: string; username: string; role: string; message: string; created_at: number }>(`SELECT id, username, role, message, created_at FROM alliance_messages WHERE alliance_id = ? ORDER BY created_at DESC LIMIT 30`, playerAlliance.id).reverse().map((item) => ({ id: item.id, username: item.username, role: item.role, message: item.message, createdAt: item.created_at })) : [];
  return { alliances, messages, playerAlliance };
}

function getRankings(userId: string, state: GameState): Record<string, RankingEntry[]> {
  const real = rows<{ user_id: string; username: string; state_json: string }>('SELECT s.user_id, u.username, s.state_json FROM game_states s JOIN users u ON u.id = s.user_id');
  const entries: RankingEntry[] = real.map((item) => {
    let other: GameState;
    try { other = JSON.parse(item.state_json) as GameState; } catch { other = freshState(item.user_id, item.username); }
    const power = calculateArmyPower(other);
    const wealth = RESOURCE_KEYS.reduce((sum, key) => sum + other.resources[key], 0);
    const member = row<{ tag: string }>('SELECT a.tag FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id WHERE m.user_id = ?', item.user_id)?.tag || '—';
    return { rank: 0, username: item.username, level: levelForXp(other.xp), rating: other.stats.rating, armyPower: power, territories: other.stats.territoryCount, wins: other.stats.wins, wealth, alliance: member, isSelf: item.user_id === userId };
  });
  const npcRows: RankingEntry[] = [
    { rank: 0, username: 'Варяг-13', level: 9, rating: 4920, armyPower: 7220, territories: 6, wins: 48, wealth: 28600, alliance: 'WLF' },
    { rank: 0, username: 'Мира Коваль', level: 8, rating: 4310, armyPower: 6400, territories: 5, wins: 41, wealth: 31400, alliance: 'СЕВ' },
    { rank: 0, username: 'Дозор-9', level: 7, rating: 3780, armyPower: 5910, territories: 4, wins: 37, wealth: 24700, alliance: 'ВОЛК' },
    { rank: 0, username: 'Седой', level: 7, rating: 3440, armyPower: 5590, territories: 4, wins: 34, wealth: 22500, alliance: 'ASH' },
    { rank: 0, username: 'Инженер Лис', level: 6, rating: 2960, armyPower: 4310, territories: 3, wins: 29, wealth: 19800, alliance: 'SRZ' },
  ];
  const all = [...entries, ...npcRows];
  const sorters: Record<string, (a: RankingEntry, b: RankingEntry) => number> = {
    overall: (a, b) => b.rating - a.rating,
    army: (a, b) => b.armyPower - a.armyPower,
    territories: (a, b) => b.territories - a.territories,
    victories: (a, b) => b.wins - a.wins,
    wealth: (a, b) => b.wealth - a.wealth,
  };
  return Object.fromEntries(Object.entries(sorters).map(([key, sorter]) => [key, all.slice().sort(sorter).map((item, index) => ({ ...item, rank: index + 1 }))]));
}

export function getGameSnapshot(userId: string): GameSnapshot {
  return db.transaction(() => {
    const user = getUser(userId);
    const state = readState(userId);
    settleState(userId, state);
    persistState(state);
    const alliance = getAllianceInfo(userId, state);
    return { user: { id: user.id, username: user.username, email: user.email || undefined, createdAt: user.createdAt }, game: state, world: getWorld(userId, state), rankings: getRankings(userId, state), alliances: alliance.alliances, allianceMessages: alliance.messages, playerAlliance: alliance.playerAlliance, serverTime: Date.now() };
  })();
}

function spend(resources: ResourceBundle, cost: Partial<ResourceBundle>): void {
  if (!hasResources(resources, cost)) {
    const missing = RESOURCE_KEYS.filter((key) => resources[key] < (cost[key] || 0));
    const names = missing.map((key) => ({ credits: 'кредитов', oil: 'нефти', metal: 'металла', energy: 'энергии', food: 'продовольствия' })[key]).join(', ');
    throw new GameError(`Недостаточно ресурсов: ${names}.`);
  }
  for (const key of RESOURCE_KEYS) resources[key] -= cost[key] || 0;
}

function safeId(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 100) : '';
}

function getNode(id: string): { id: string; name: string; kind: string; owner: string; owner_user_id: string | null; defense_power: number; level: number; resources_json: string; alliance_tag: string | null; x: number; y: number } {
  const target = row<{ id: string; name: string; kind: string; owner: string; owner_user_id: string | null; defense_power: number; level: number; resources_json: string; alliance_tag: string | null; x: number; y: number }>('SELECT id, name, kind, owner, owner_user_id, defense_power, level, resources_json, alliance_tag, x, y FROM world_nodes WHERE id = ?', id);
  if (!target) throw new GameError('Объект не найден в секторе.');
  return target;
}

function nodeResources(target: { resources_json: string }): Partial<ResourceBundle> {
  try { return JSON.parse(target.resources_json || '{}') as Partial<ResourceBundle>; } catch { return {}; }
}

function createMarketTrade(state: GameState, payload: Record<string, unknown>, now: number): void {
  const deal = MARKET_DEALS.find((item) => item.id === payload.dealId);
  if (!deal) throw new GameError('Этот контракт уже снят с рынка.');
  const lots = Math.max(1, Math.min(8, Math.floor(Number(payload.lots) || 1)));
  const cost = deal.fromAmount * lots;
  const received = deal.toAmount * lots;
  spend(state.resources, { [deal.from]: cost });
  state.resources[deal.to] += received;
  const trade: MarketTrade = { id: randomUUID(), from: deal.from, to: deal.to, amount: cost, received, createdAt: now };
  state.marketHistory.unshift(trade);
  state.marketHistory = state.marketHistory.slice(0, 30);
  db.prepare(`INSERT INTO market_trades (id, buyer_user_id, seller_name, resource_from, amount_from, resource_to, amount_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(trade.id, state.userId, 'Консорциум северных станций', deal.from, cost, deal.to, received, now);
  addNotification(state, 'market', 'Обмен выполнен', `${cost.toLocaleString('ru-RU')} ресурса «${deal.from}» обменяно на ${received.toLocaleString('ru-RU')} «${deal.to}».`, now);
}

function canClaimMission(state: GameState, id: string): boolean {
  switch (id) {
    case 'hq_2': return state.buildings.hq >= 2;
    case 'train_100': return state.stats.unitsProduced >= 100;
    case 'research_1': return Object.values(state.technologies).some((level) => level > 0);
    case 'scout_1': return (state.dailyScouts || 0) >= 1;
    case 'victory_1': return state.stats.wins >= 1;
    case 'supplies_1': return (state.dailySupplies || 0) >= 1;
    default: return false;
  }
}

function claimMission(state: GameState, id: string, now: number): void {
  const mission = MISSIONS.find((item) => item.id === id);
  if (!mission) throw new GameError('Задание не найдено.');
  const isDaily = mission.category === 'Ежедневная';
  const isClaimed = isDaily ? (state.dailyClaims || []).includes(id) : state.claimedMissions.includes(id);
  if (isClaimed) throw new GameError('Награда за это задание уже получена сегодня.');
  if (!canClaimMission(state, id)) throw new GameError('Задание ещё не выполнено.');
  for (const key of RESOURCE_KEYS) state.resources[key] += mission.reward[key] || 0;
  state.xp += mission.xp;
  state.stats.missionsCompleted += 1;
  if (isDaily) state.dailyClaims = Array.from(new Set([...(state.dailyClaims || []), id]));
  else state.claimedMissions.push(id);
  addNotification(state, 'system', 'Задание выполнено', `Получена награда: «${mission.name}» · +${mission.xp} опыта.`, now);
}

function pushBattleToDatabase(report: BattleReport, userId: string, defenderUserId: string | null): void {
  db.prepare(`INSERT INTO battle_reports (id, attacker_user_id, defender_user_id, target_id, outcome, report_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(report.id, userId, defenderUserId, report.targetId, report.outcome, JSON.stringify(report), report.createdAt);
}

function makeAttack(state: GameState, payload: Record<string, unknown>, now: number): BattleReport {
  const targetId = safeId(payload.targetId);
  const target = getNode(targetId);
  if (target.owner_user_id === state.userId) throw new GameError('Нельзя атаковать собственный объект.');
  const unitId = safeId(payload.unit) as UnitId;
  const unit = UNIT_BY_ID[unitId];
  if (!unit) throw new GameError('Укажите подразделение для выдвижения.');
  const count = Math.max(1, Math.min(500, Math.floor(Number(payload.count) || 0)));
  if (count < 1) throw new GameError('Укажите количество отправляемых войск.');
  if (state.units[unitId] < count) throw new GameError('В гарнизоне недостаточно выбранных подразделений.');

  let defenderState: GameState | null = null;
  if (target.owner_user_id) {
    defenderState = readState(target.owner_user_id);
    settleState(target.owner_user_id, defenderState, now);
  }
  const defensePower = defenderState ? calculateArmyPower(defenderState) + defenderState.buildings.defense * 70 : target.defense_power;
  const techBoost = unit.branch === 'Пехота' ? (state.technologies.infantry || 0) * 0.12
    : unit.branch === 'Бронетехника' ? (state.technologies.armor || 0) * 0.14
      : unit.branch === 'Авиация' ? (state.technologies.aviation || 0) * 0.15
        : unit.branch === 'Артиллерия' ? (state.technologies.industry || 0) * 0.08 : 0;
  const requestedDirection = safeId(payload.direction);
  const direction: AttackDirection = ['frontal', 'north', 'flank'].includes(requestedDirection) ? requestedDirection as AttackDirection : 'frontal';
  const maneuver = direction === 'flank' ? { power: 1.12, losses: 0.035 } : direction === 'north' ? { power: 0.96, losses: -0.025 } : { power: 1, losses: 0 };
  const attackPower = count * (unit.attack + unit.defense * 0.18) * (1 + techBoost) * maneuver.power;
  const combatFactor = 0.94 + (Math.random() * 0.13);
  const victory = attackPower * combatFactor >= defensePower * 0.88;
  const ratio = Math.max(0.05, Math.min(1.1, defensePower / Math.max(1, attackPower)));
  const lossRate = victory ? 0.065 + ratio * 0.12 + maneuver.losses : Math.min(0.78, 0.28 + (attackPower / Math.max(1, defensePower)) * 0.14 + maneuver.losses);
  const losses = Math.min(count, Math.max(victory ? 0 : 1, Math.round(count * lossRate)));
  state.units[unitId] -= losses;
  const enemyDestroyed = victory ? Math.max(1, Math.round((attackPower / Math.max(1, defensePower)) * 26)) : Math.max(0, Math.round((attackPower / Math.max(1, defensePower)) * 9));
  const territoryCaptured = victory && !target.owner_user_id;
  const loot: Partial<ResourceBundle> = {};
  if (victory) {
    const available = nodeResources(target);
    for (const key of RESOURCE_KEYS) {
      const amount = available[key] || 0;
      const taken = Math.min(amount, Math.round(amount * (target.kind === 'resource' ? 0.72 : 0.22)));
      if (taken > 0) {
        loot[key] = taken;
        state.resources[key] += taken;
        available[key] = amount - taken;
      }
    }
    if (Object.keys(loot).length === 0) {
      loot.credits = 260 + target.level * 80;
      loot.metal = 120 + target.level * 45;
      state.resources.credits += loot.credits;
      state.resources.metal += loot.metal;
    }
    if (territoryCaptured) {
      state.territories = Array.from(new Set([...state.territories, target.id]));
      state.stats.territoryCount = state.territories.length;
      db.prepare('UPDATE world_nodes SET owner = ?, owner_user_id = ?, resources_json = ?, subtitle = ? WHERE id = ?')
        .run(state.username, state.userId, JSON.stringify(available), `Захвачено · ${target.owner}`, target.id);
      db.prepare(`INSERT INTO territories (id, owner_user_id, alliance_id, name, kind, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET owner_user_id = excluded.owner_user_id, alliance_id = excluded.alliance_id, updated_at = excluded.updated_at`)
        .run(target.id, state.userId, state.allianceId, target.name, target.kind, now);
      state.xp += 75;
    } else {
      db.prepare('UPDATE world_nodes SET resources_json = ? WHERE id = ?').run(JSON.stringify(available), target.id);
    }
  }
  if (defenderState && target.owner_user_id && victory) {
    for (const defenderUnit of UNITS) {
      const defenderCount = defenderState.units[defenderUnit.id];
      if (defenderCount > 0) defenderState.units[defenderUnit.id] = Math.max(0, defenderCount - Math.ceil(defenderCount * 0.10));
    }
    const stolen = Math.min(defenderState.resources.credits, Math.round(defenderState.resources.credits * 0.035));
    defenderState.resources.credits -= stolen;
    state.resources.credits += stolen;
    if (stolen) loot.credits = (loot.credits || 0) + stolen;
    addNotification(defenderState, 'battle', 'База под атакой', `${state.username} провёл рейд на объект «${target.name}». Силы гарнизона понесли потери.`, now);
    persistState(defenderState);
    pushBattleToDatabase({ id: randomUUID(), targetId, targetName: target.name, outcome: 'defeat', attacker: state.username, defender: defenderState.username, unit: unitId, direction, sent: count, attackerLosses: 0, enemyDestroyed: losses, defensePower, loot: {}, xp: 0, ratingDelta: 0, territoryCaptured: false, createdAt: now, summary: 'Удар противника по вашему сектору.' }, state.userId, target.owner_user_id);
  }
  const xp = victory ? 45 + target.level * 14 : 16;
  state.xp += xp;
  const ratingDelta = victory ? 25 + target.level * 6 : -Math.min(15, 4 + target.level);
  state.stats.rating = Math.max(0, state.stats.rating + ratingDelta);
  state.stats.wins += victory ? 1 : 0;
  state.stats.losses += victory ? 0 : 1;
  state.stats.totalBattles += 1;
  const report: BattleReport = {
    id: randomUUID(), targetId, targetName: target.name, outcome: victory ? 'victory' : 'defeat', attacker: state.username,
    defender: target.owner, unit: unitId, direction, sent: count, attackerLosses: losses, enemyDestroyed, defensePower,
    loot, xp, ratingDelta, territoryCaptured, createdAt: now,
    summary: victory ? (territoryCaptured ? 'Оборона сломлена. Территория перешла под ваш контроль.' : 'Операция завершена успешно. Противник отступил.') : 'Противник удержал рубеж. Перегруппируйте силы и попробуйте снова.',
  };
  state.battleReports.unshift(report);
  state.battleReports = state.battleReports.slice(0, 30);
  addNotification(state, 'battle', victory ? 'Победа в секторе' : 'Бой завершён', `${target.name}: ${report.summary}`, now);
  pushBattleToDatabase(report, state.userId, target.owner_user_id);
  return report;
}

function requireAllianceMember(userId: string): { id: string; role: string } {
  const member = row<{ alliance_id: string; role: string }>('SELECT alliance_id, role FROM alliance_members WHERE user_id = ?', userId);
  if (!member) throw new GameError('Сначала вступите в альянс или создайте свой.');
  return { id: member.alliance_id, role: member.role };
}

function createAlliance(state: GameState, payload: Record<string, unknown>, now: number): void {
  if (row('SELECT alliance_id FROM alliance_members WHERE user_id = ?', state.userId)) throw new GameError('Вы уже состоите в альянсе.');
  const name = safeId(payload.name).trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 28) throw new GameError('Название альянса должно содержать 3–28 символов.');
  const tag = (name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Zа-яА-Я0-9]/g, '').slice(0, 4).toUpperCase() || 'NTH');
  if (row('SELECT id FROM alliances WHERE name = ? OR tag = ?', name, tag)) throw new GameError('Такое название или тег уже заняты. Выберите другое.');
  const id = `al_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const description = safeId(payload.description).trim().slice(0, 120) || 'Новый союз командиров северной дуги.';
  db.prepare('INSERT INTO alliances (id, name, tag, description, leader_user_id, npc_members, territories, rating, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, 1200, ?)')
    .run(id, name, tag, description, state.userId, now);
  db.prepare('INSERT INTO alliance_members (alliance_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(id, state.userId, 'Командир', now);
  state.allianceId = id;
  addNotification(state, 'alliance', 'Альянс создан', `Штаб союза «${name}» открыт.`, now);
}

function joinAlliance(state: GameState, payload: Record<string, unknown>, now: number): void {
  if (row('SELECT alliance_id FROM alliance_members WHERE user_id = ?', state.userId)) throw new GameError('Вы уже состоите в альянсе. Сначала покиньте текущий союз.');
  const allianceId = safeId(payload.allianceId);
  const alliance = row<{ id: string; name: string }>('SELECT id, name FROM alliances WHERE id = ?', allianceId);
  if (!alliance) throw new GameError('Альянс больше не существует.');
  db.prepare('INSERT INTO alliance_members (alliance_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(allianceId, state.userId, 'Боец', now);
  db.prepare('UPDATE alliances SET rating = rating + 75 WHERE id = ?').run(allianceId);
  state.allianceId = allianceId;
  addNotification(state, 'alliance', 'Вступление подтверждено', `Вы вступили в альянс «${alliance.name}».`, now);
}

function allianceAction(state: GameState, payload: Record<string, unknown>, now: number): void {
  const type = safeId(payload.allianceAction);
  if (type === 'create') return createAlliance(state, payload, now);
  if (type === 'join') return joinAlliance(state, payload, now);
  if (type === 'leave') {
    const member = requireAllianceMember(state.userId);
    if (member.role === 'Командир') {
      const remaining = row<{ user_id: string }>('SELECT user_id FROM alliance_members WHERE alliance_id = ? AND user_id != ? ORDER BY joined_at LIMIT 1', member.id, state.userId);
      if (remaining) {
        db.prepare('UPDATE alliance_members SET role = ? WHERE alliance_id = ? AND user_id = ?').run('Командир', member.id, remaining.user_id);
        db.prepare('UPDATE alliances SET leader_user_id = ? WHERE id = ?').run(remaining.user_id, member.id);
      } else {
        db.prepare('DELETE FROM alliances WHERE id = ?').run(member.id);
      }
    }
    db.prepare('DELETE FROM alliance_members WHERE alliance_id = ? AND user_id = ?').run(member.id, state.userId);
    state.allianceId = null;
    addNotification(state, 'alliance', 'Вы покинули альянс', 'Дипломатические каналы отключены.', now);
    return;
  }
  if (type === 'message') {
    const member = requireAllianceMember(state.userId);
    const message = safeId(payload.message).trim().replace(/\s+/g, ' ');
    if (!message || message.length > 240) throw new GameError('Сообщение должно содержать 1–240 символов.');
    db.prepare('INSERT INTO alliance_messages (id, alliance_id, user_id, username, role, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), member.id, state.userId, state.username, member.role, message, now);
    return;
  }
  if (type === 'diplomacy') {
    const member = requireAllianceMember(state.userId);
    if (member.role !== 'Командир' && member.role !== 'Дипломат') throw new GameError('Изменять дипломатию может командир или дипломат союза.');
    const other = safeId(payload.allianceId);
    const status = safeId(payload.status);
    if (other === member.id || !row('SELECT id FROM alliances WHERE id = ?', other)) throw new GameError('Выберите другой существующий альянс.');
    if (!['Мир', 'Союз', 'Нейтралитет', 'Война'].includes(status)) throw new GameError('Неизвестный дипломатический статус.');
    const [a, b] = [member.id, other].sort();
    db.prepare(`INSERT INTO diplomatic_relations (alliance_a, alliance_b, status, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(alliance_a, alliance_b) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`).run(a, b, status, now);
    addNotification(state, 'alliance', 'Дипломатия обновлена', `Статус отношений изменён на «${status}».`, now);
    return;
  }
  throw new GameError('Неизвестный приказ альянсу.');
}

export interface ActionRequest { action: string; [key: string]: unknown }

export function performGameAction(userId: string, request: ActionRequest): { snapshot: GameSnapshot; result?: BattleReport | { message: string } } {
  const now = Date.now();
  let result: BattleReport | { message: string } | undefined;
  db.transaction(() => {
    const state = readState(userId);
    settleState(userId, state, now);
    const action = request.action;
    if (action === 'collect') {
      if (state.stats.lastSupplyAt && now - state.stats.lastSupplyAt < 45_000) {
        const seconds = Math.ceil((45_000 - (now - state.stats.lastSupplyAt)) / 1000);
        throw new GameError(`Следующая выдача снабжения будет доступна через ${seconds} сек.`);
      }
      const packageCost: ResourceBundle = { credits: 520, oil: 160, metal: 280, energy: 190, food: 420 };
      for (const key of RESOURCE_KEYS) state.resources[key] += packageCost[key];
      state.stats.lastSupplyAt = now;
      state.dailySupplies = (state.dailySupplies || 0) + 1;
      addNotification(state, 'system', 'Поставка принята', 'Снабжение сектора пополнено полевым резервом.', now);
    } else if (action === 'upgrade') {
      const id = safeId(request.building) as BuildingId;
      const building = BUILDING_BY_ID[id];
      if (!building) throw new GameError('Неизвестное сооружение.');
      if (state.buildingQueue.length >= Math.min(3, 1 + Math.floor((state.buildings.hq - 1) / 2))) throw new GameError('Очередь строительства заполнена.');
      if (state.buildingQueue.some((job) => job.building === id)) throw new GameError('Это сооружение уже стоит в очереди.');
      const level = state.buildings[id];
      if (level >= 20) throw new GameError('Это сооружение уже достигло максимального уровня.');
      if (id !== 'hq' && level + 1 > state.buildings.hq + 1) throw new GameError(`Требуется штаб ${level} уровня.`);
      const cost = getUpgradeCost(id, level);
      spend(state.resources, cost);
      const start = Math.max(now, state.buildingQueue.at(-1)?.finishAt || now);
      const duration = getUpgradeSeconds(id, level) * 1000;
      state.buildingQueue.push({ id: randomUUID(), building: id, fromLevel: level, toLevel: level + 1, startedAt: start, finishAt: start + duration });
      addNotification(state, 'building', 'Заказ на строительство', `${building.name}: материалы зарезервированы, работы начаты.`, now);
    } else if (action === 'speedup') {
      const jobId = safeId(request.jobId);
      const job = state.buildingQueue.find((item) => item.id === jobId);
      if (job) {
        const fee = 220 + (job.toLevel * 120);
        spend(state.resources, { credits: fee });
        job.finishAt = now;
        settleState(userId, state, now);
      } else {
        const training = state.trainingQueue.find((item) => item.id === jobId);
        if (training) {
          const fee = 150 + training.count * 4;
          spend(state.resources, { credits: fee });
          training.finishAt = now;
          settleState(userId, state, now);
        } else if (state.researchJob?.id === jobId) {
          spend(state.resources, { credits: 420 });
          state.researchJob.finishAt = now;
          settleState(userId, state, now);
        } else throw new GameError('Задание уже завершено или не найдено.');
      }
    } else if (action === 'train') {
      const unitId = safeId(request.unit) as UnitId;
      const unit = UNIT_BY_ID[unitId];
      if (!unit) throw new GameError('Подразделение не найдено.');
      const count = Math.max(1, Math.min(100, Math.floor(Number(request.count) || 1)));
      if (state.buildings[unit.building] < unit.buildingLevel) throw new GameError(`Требуется ${BUILDING_BY_ID[unit.building].name} ${unit.buildingLevel} уровня.`);
      if (unit.requirement && state.technologies[unit.requirement] < 1) throw new GameError(`Требуется технология «${TECH_BY_ID[unit.requirement].name}».`);
      if (state.trainingQueue.length >= 4) throw new GameError('Очередь подготовки заполнена.');
      const cost = scaledCost(unit.cost, count);
      spend(state.resources, cost);
      const start = Math.max(now, state.trainingQueue.at(-1)?.finishAt || now);
      const duration = Math.min(70, Math.max(4, Math.ceil(unit.seconds * Math.sqrt(count) + count * 0.16))) * 1000;
      state.trainingQueue.push({ id: randomUUID(), unit: unitId, count, startedAt: start, finishAt: start + duration });
      addNotification(state, 'army', 'Подготовка началась', `${count} × ${unit.name} поставлены в очередь.`, now);
    } else if (action === 'research') {
      const id = safeId(request.technology) as TechId;
      const technology = TECH_BY_ID[id];
      if (!technology) throw new GameError('Технология не найдена.');
      const level = state.technologies[id];
      if (level >= 3) throw new GameError('Достигнут максимальный уровень этой технологии.');
      if (state.researchJob) throw new GameError('Исследовательский корпус занят другим проектом.');
      if (state.buildings.research < 1 + Math.floor(level / 2)) throw new GameError('Требуется улучшить научный корпус.');
      if (technology.prerequisite && state.technologies[technology.prerequisite] < 1) throw new GameError(`Сначала изучите «${TECH_BY_ID[technology.prerequisite].name}».`);
      const cost = scaledCost(technology.cost, Math.pow(1.45, level));
      spend(state.resources, cost);
      const duration = Math.round(technology.seconds * Math.pow(1.42, level)) * 1000;
      state.researchJob = { id: randomUUID(), technology: id, startedAt: now, finishAt: now + duration };
      addNotification(state, 'research', 'Исследование запущено', `Лаборатория начала проект «${technology.name}».`, now);
    } else if (action === 'scout') {
      const targetId = safeId(request.targetId);
      const target = getNode(targetId);
      if (target.owner_user_id === userId) throw new GameError('Разведка собственного объекта не требуется.');
      if (state.units.recon < 1) throw new GameError('Нужен хотя бы один разведчик в гарнизоне.');
      if (state.scoutMissions.length >= 3) throw new GameError('Все разведывательные группы уже в поле.');
      state.units.recon -= 1;
      state.stats.scoutsSent += 1;
      const compassEquipped = state.inventory.some((item) => item.id === 'field_compass' && item.equipped);
      const missionDuration = compassEquipped ? 6_650 : 7_000;
      const mission = { id: randomUUID(), targetId, targetName: target.name, startedAt: now, finishAt: now + missionDuration };
      state.scoutMissions.push(mission);
      addNotification(state, 'scout', 'Разведгруппа выдвинулась', `Наблюдатели направлены к объекту «${target.name}».`, now);
    } else if (action === 'attack') {
      result = makeAttack(state, request, now);
    } else if (action === 'trade') {
      createMarketTrade(state, request, now);
      result = { message: 'Обмен проведён по контракту рынка.' };
    } else if (action === 'claimMission') {
      claimMission(state, safeId(request.missionId), now);
      result = { message: 'Награда добавлена на счёт.' };
    } else if (action === 'alliance') {
      allianceAction(state, request, now);
    } else if (action === 'equip') {
      const item = state.inventory.find((entry) => entry.id === safeId(request.itemId));
      if (!item) throw new GameError('Предмет не найден в инвентаре.');
      item.equipped = !item.equipped;
      addNotification(state, 'system', item.equipped ? 'Предмет экипирован' : 'Предмет убран', item.name, now);
    } else if (action === 'markNotifications') {
      for (const notification of state.notifications) notification.read = true;
    } else if (action === 'profile') {
      const bio = typeof request.bio === 'string' ? request.bio.trim().slice(0, 90) : state.bio;
      state.bio = bio;
    } else {
      throw new GameError('Неизвестная команда сервера.');
    }
    persistState(state);
  })();
  return { snapshot: getGameSnapshot(userId), result };
}

export function getMissionProgress(state: GameState, id: string): { complete: boolean; claimed: boolean } {
  return { complete: canClaimMission(state, id), claimed: state.claimedMissions.includes(id) };
}

export function getCatalog() {
  return { buildings: BUILDINGS, units: UNITS, technologies: TECHNOLOGIES, missions: MISSIONS, marketDeals: MARKET_DEALS };
}
