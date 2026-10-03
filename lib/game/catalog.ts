import type { BuildingDefinition, BuildingId, MissionDefinition, ResourceBundle, ResourceKey, TechId, TechnologyDefinition, UnitDefinition, UnitId } from './types';

export const RESOURCE_META: Record<ResourceKey, { label: string; short: string; mark: string; accent: string }> = {
  credits: { label: 'Кредиты', short: 'Деньги', mark: '₵', accent: 'gold' },
  oil: { label: 'Нефть', short: 'Топливо', mark: '◉', accent: 'oil' },
  metal: { label: 'Металл', short: 'Металл', mark: '▰', accent: 'metal' },
  energy: { label: 'Энергия', short: 'Энергия', mark: 'ϟ', accent: 'energy' },
  food: { label: 'Продовольствие', short: 'Пайки', mark: '✚', accent: 'food' },
};

export const RESOURCE_KEYS: ResourceKey[] = ['credits', 'oil', 'metal', 'energy', 'food'];

export const BUILDINGS: BuildingDefinition[] = [
  { id: 'hq', name: 'Командный центр', short: 'Штаб', category: 'КОМАНДОВАНИЕ', description: 'Сердце гарнизона. Уровень штаба задаёт предел развития остальных объектов.', effect: 'Управление сектором · +8% к лимиту гарнизона за уровень', symbol: '⌂', x: 49, y: 56, cost: { credits: 1200, metal: 620, oil: 180, energy: 160 }, baseSeconds: 9 },
  { id: 'barracks', name: 'Казармы «Бастион»', short: 'Казармы', category: 'ПЕХОТА', description: 'Учебный комплекс для стрелков, штурмовых групп и разведчиков.', effect: '+12 мест в очереди подготовки за уровень', symbol: '▥', x: 28, y: 49, cost: { credits: 760, metal: 420, food: 260, energy: 90 }, baseSeconds: 7 },
  { id: 'armor', name: 'Цех бронетехники', short: 'Бронецех', category: 'БРОНЕТЕХНИКА', description: 'Сборка и ремонт лёгких, средних и тяжёлых машин.', effect: '+6% к скорости выпуска техники за уровень', symbol: '▣', x: 70, y: 37, cost: { credits: 980, metal: 860, oil: 310, energy: 180 }, baseSeconds: 10 },
  { id: 'artillery', name: 'Артиллерийский завод', short: 'Арсенал', category: 'АРТИЛЛЕРИЯ', description: 'Орудийные платформы, гаубицы и реактивные комплексы.', effect: '+7% к огневой мощи артиллерии за уровень', symbol: '◉', x: 64, y: 68, cost: { credits: 860, metal: 900, oil: 240, energy: 180 }, baseSeconds: 10 },
  { id: 'airbase', name: 'Авиационный сектор', short: 'Авиабаза', category: 'АВИАЦИЯ', description: 'Взлётная полоса и ангары для тактической авиации.', effect: '+4 места в авиапарке за уровень', symbol: '✦', x: 85, y: 52, cost: { credits: 1100, metal: 680, oil: 550, energy: 230 }, baseSeconds: 12 },
  { id: 'warehouse', name: 'Склад снабжения', short: 'Склад', category: 'СНАБЖЕНИЕ', description: 'Защищённые хранилища для резервов и полевого оборудования.', effect: '+18% к вместимости и выдаче припасов за уровень', symbol: '▤', x: 16, y: 32, cost: { credits: 540, metal: 460, food: 180, energy: 80 }, baseSeconds: 6 },
  { id: 'refinery', name: 'Нефтехранилище', short: 'Нефтебаза', category: 'ЭКОНОМИКА', description: 'Переработка и накопление топлива для всей механизированной группировки.', effect: '+320 нефти в час за уровень', symbol: '⛽', x: 82, y: 23, cost: { credits: 740, metal: 520, oil: 120, energy: 110 }, baseSeconds: 8 },
  { id: 'research', name: 'Научный корпус', short: 'НИИ', category: 'ТЕХНОЛОГИИ', description: 'Лаборатории связи, материаловедения и тактического анализа.', effect: 'Открывает исследования более высокого уровня', symbol: '⌬', x: 37, y: 24, cost: { credits: 900, metal: 620, energy: 330 }, baseSeconds: 11 },
  { id: 'comms', name: 'Центр связи', short: 'Связь', category: 'РАЗВЕДКА', description: 'Радиоперехват, картография сектора и координация отрядов.', effect: '+10% к точности разведки за уровень', symbol: '⌁', x: 53, y: 19, cost: { credits: 650, metal: 320, energy: 300 }, baseSeconds: 7 },
  { id: 'defense', name: 'Периметр «Страж»', short: 'Оборона', category: 'ЗАЩИТА', description: 'Сеть бункеров, огневых точек и автоматических систем ПВО.', effect: '+90 к обороне базы за уровень', symbol: '⛨', x: 11, y: 64, cost: { credits: 920, metal: 780, oil: 230, energy: 220 }, baseSeconds: 10 },
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((item) => [item.id, item])) as Record<BuildingId, BuildingDefinition>;

export function getUpgradeCost(id: BuildingId, currentLevel: number): Partial<ResourceBundle> {
  const base = BUILDING_BY_ID[id].cost;
  const scale = Math.pow(1.43, Math.max(0, currentLevel - 1));
  return Object.fromEntries(RESOURCE_KEYS.flatMap((key) => base[key] ? [[key, Math.ceil(base[key]! * scale)]] : [])) as Partial<ResourceBundle>;
}

export function getUpgradeSeconds(id: BuildingId, currentLevel: number): number {
  return Math.max(5, Math.round(BUILDING_BY_ID[id].baseSeconds * Math.pow(Math.max(1, currentLevel), 1.2)));
}

export const UNITS: UnitDefinition[] = [
  { id: 'rifle', name: 'Стрелковое отделение', branch: 'Пехота', description: 'Универсальная пехота. Надёжная основа гарнизона и штурмовых групп.', attack: 8, defense: 9, health: 100, speed: 3.1, cost: { credits: 22, food: 3, metal: 1 }, seconds: 1, building: 'barracks', buildingLevel: 1 },
  { id: 'assault', name: 'Штурмовая группа', branch: 'Пехота', description: 'Подготовленные бойцы для атаки укреплённых точек.', attack: 17, defense: 13, health: 150, speed: 3.5, cost: { credits: 48, food: 5, metal: 4 }, seconds: 2, building: 'barracks', buildingLevel: 2 },
  { id: 'recon', name: 'Разведчик «След»', branch: 'Пехота', description: 'Скрытное наблюдение и сбор данных о гарнизонах противника.', attack: 4, defense: 5, health: 75, speed: 6.8, cost: { credits: 58, oil: 3, food: 2, metal: 3 }, seconds: 2, building: 'barracks', buildingLevel: 1 },
  { id: 'light_tank', name: 'Лёгкий танк Т-7', branch: 'Бронетехника', description: 'Быстрая мобильная бронемашина поддержки.', attack: 62, defense: 46, health: 320, speed: 5.8, cost: { credits: 430, oil: 155, metal: 230, energy: 12 }, seconds: 5, building: 'armor', buildingLevel: 1 },
  { id: 'medium_tank', name: 'Средний танк Т-14', branch: 'Бронетехника', description: 'Сбалансированная машина для прорыва и удержания рубежей.', attack: 112, defense: 98, health: 580, speed: 4.4, cost: { credits: 850, oil: 320, metal: 510, energy: 22 }, seconds: 8, building: 'armor', buildingLevel: 2, requirement: 'armor' },
  { id: 'heavy_tank', name: 'Тяжёлый танк «Гранит»', branch: 'Бронетехника', description: 'Тяжёлая штурмовая платформа с усиленным бронированием.', attack: 190, defense: 185, health: 1050, speed: 2.8, cost: { credits: 1720, oil: 650, metal: 980, energy: 40 }, seconds: 13, building: 'armor', buildingLevel: 4, requirement: 'armor' },
  { id: 'howitzer', name: 'Самоходная гаубица', branch: 'Артиллерия', description: 'Точный дальний огонь по полевым укреплениям.', attack: 138, defense: 28, health: 250, speed: 2.1, cost: { credits: 760, oil: 135, metal: 480, energy: 24 }, seconds: 8, building: 'artillery', buildingLevel: 1 },
  { id: 'rocket', name: 'РСЗО «Град-9»', branch: 'Артиллерия', description: 'Реактивный залп большой мощности по скоплениям сил.', attack: 285, defense: 38, health: 310, speed: 2.5, cost: { credits: 1850, oil: 360, metal: 850, energy: 52 }, seconds: 14, building: 'artillery', buildingLevel: 3, requirement: 'industry' },
  { id: 'fighter', name: 'Истребитель «Сокол»', branch: 'Авиация', description: 'Перехватчик для контроля воздушного пространства.', attack: 158, defense: 95, health: 390, speed: 9.5, cost: { credits: 1420, oil: 440, metal: 390, energy: 30 }, seconds: 11, building: 'airbase', buildingLevel: 1 },
  { id: 'strike', name: 'Штурмовик «Клин»', branch: 'Авиация', description: 'Тактический самолёт непосредственной поддержки наземных сил.', attack: 218, defense: 82, health: 410, speed: 8.6, cost: { credits: 1740, oil: 520, metal: 450, energy: 34 }, seconds: 13, building: 'airbase', buildingLevel: 2, requirement: 'aviation' },
  { id: 'bomber', name: 'Бомбардировщик «Титан»', branch: 'Авиация', description: 'Тяжёлая авиация для ударов по промышленным объектам.', attack: 360, defense: 105, health: 680, speed: 6.6, cost: { credits: 2600, oil: 860, metal: 720, energy: 65 }, seconds: 18, building: 'airbase', buildingLevel: 4, requirement: 'aviation' },
];

export const UNIT_BY_ID = Object.fromEntries(UNITS.map((item) => [item.id, item])) as Record<UnitId, UnitDefinition>;

export const TECHNOLOGIES: TechnologyDefinition[] = [
  { id: 'industry', name: 'Серийная сборка', branch: 'Военная промышленность', description: 'Перенастройка производственных линий и стандартизация комплектующих.', effect: '+8% к атаке артиллерии и скорости производства', cost: { credits: 1450, metal: 860, energy: 360 }, seconds: 14 },
  { id: 'infantry', name: 'Тактические группы', branch: 'Пехота', description: 'Новая система подготовки отделений и полевой медицины.', effect: '+12% к атаке и защите пехоты', cost: { credits: 980, metal: 480, food: 260 }, seconds: 12 },
  { id: 'armor', name: 'Композитная броня', branch: 'Бронетехника', description: 'Многослойные панели и усовершенствованная система управления огнём.', effect: '+14% к атаке и защите бронетехники', cost: { credits: 1550, oil: 380, metal: 1000 }, seconds: 16 },
  { id: 'aviation', name: 'Воздушный контур', branch: 'Авиация', description: 'Координация эскадрилий и модернизированные системы наведения.', effect: '+15% к атаке авиации', cost: { credits: 1740, oil: 520, metal: 430, energy: 300 }, seconds: 18 },
  { id: 'economy', name: 'Логистика сектора', branch: 'Экономика', description: 'Оптимизация маршрутов, складов и распределения припасов.', effect: '+12% к добыче ресурсов', cost: { credits: 1180, metal: 520, energy: 430 }, seconds: 13 },
  { id: 'defense', name: 'Глубокая оборона', branch: 'Оборона', description: 'Резервные рубежи, ложные цели и усиление периметра.', effect: '+15% к обороне базы', cost: { credits: 1380, metal: 920, oil: 210 }, seconds: 15 },
  { id: 'signals', name: 'Радиоперехват', branch: 'Связь', description: 'Обработка сигнатур и безопасная сеть наблюдательных постов.', effect: '+20% к точности разведки', cost: { credits: 1260, energy: 580, metal: 390 }, seconds: 14 },
];

export const TECH_BY_ID = Object.fromEntries(TECHNOLOGIES.map((item) => [item.id, item])) as Record<TechId, TechnologyDefinition>;

export const MISSIONS: MissionDefinition[] = [
  { id: 'hq_2', name: 'Командный голос', description: 'Повысить уровень штаба до 2.', reward: { credits: 1400, metal: 620, oil: 250 }, xp: 90, category: 'Постоянная' },
  { id: 'train_100', name: 'Новый гарнизон', description: 'Произвести 100 подразделений.', reward: { credits: 1200, food: 900, metal: 400 }, xp: 80, category: 'Постоянная' },
  { id: 'research_1', name: 'Научный приоритет', description: 'Завершить первое исследование.', reward: { credits: 1000, energy: 700, metal: 350 }, xp: 100, category: 'Постоянная' },
  { id: 'scout_1', name: 'Глаза сектора', description: 'Успешно провести разведку чужого объекта.', reward: { credits: 650, oil: 400, food: 300 }, xp: 65, category: 'Ежедневная' },
  { id: 'victory_1', name: 'Первый рубеж', description: 'Одержать победу в бою и закрепиться на территории.', reward: { credits: 1800, metal: 700, oil: 650 }, xp: 180, category: 'Постоянная' },
  { id: 'supplies_1', name: 'Плановое снабжение', description: 'Забрать полевой резерв со склада.', reward: { credits: 520, food: 520, energy: 240 }, xp: 35, category: 'Ежедневная' },
];

export const MARKET_DEALS: { id: string; label: string; from: ResourceKey; to: ResourceKey; fromAmount: number; toAmount: number; note: string }[] = [
  { id: 'metal_oil', label: 'Топливный обмен', from: 'metal', to: 'oil', fromAmount: 1000, toAmount: 620, note: 'Северный НПЗ · до 8 пакетов за раз' },
  { id: 'oil_metal', label: 'Металлолом за горючее', from: 'oil', to: 'metal', fromAmount: 800, toAmount: 1000, note: 'Торговый конвой · до 8 пакетов за раз' },
  { id: 'credits_food', label: 'Полевой рацион', from: 'credits', to: 'food', fromAmount: 500, toAmount: 700, note: 'Склад снабжения · до 8 пакетов за раз' },
  { id: 'energy_credits', label: 'Энергосеть сектора', from: 'energy', to: 'credits', fromAmount: 300, toAmount: 850, note: 'Обратный выкуп · до 8 пакетов за раз' },
  { id: 'credits_metal', label: 'Промышленный контракт', from: 'credits', to: 'metal', fromAmount: 1000, toAmount: 460, note: 'Квота промышленного контура' },
];

export function emptyResources(): ResourceBundle {
  return { credits: 0, oil: 0, metal: 0, energy: 0, food: 0 };
}

export function scaledCost(cost: Partial<ResourceBundle>, amount: number): Partial<ResourceBundle> {
  return Object.fromEntries(Object.entries(cost).map(([key, value]) => [key, Math.ceil((value || 0) * amount)])) as Partial<ResourceBundle>;
}

export function hasResources(resources: ResourceBundle, cost: Partial<ResourceBundle>): boolean {
  return RESOURCE_KEYS.every((key) => (resources[key] || 0) >= (cost[key] || 0));
}

export function resourceLabel(key: ResourceKey): string {
  return RESOURCE_META[key].label;
}

export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 115)) + 1);
}

export function xpProgress(xp: number): { level: number; current: number; needed: number; percent: number } {
  const level = levelForXp(xp);
  const low = Math.pow(level - 1, 2) * 115;
  const high = Math.pow(level, 2) * 115;
  const needed = high - low;
  const current = Math.max(0, xp - low);
  return { level, current, needed, percent: Math.min(100, Math.round((current / needed) * 100)) };
}
