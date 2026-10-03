'use client';

import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, BarChart3, BatteryCharging, Bell, CheckCheck,
  Boxes, Building2, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, Clock3, Coins, Command,
  Crosshair, Factory, FileText, Filter, Flag, Fuel, Globe2, Hammer, HardHat, House, Info, LockKeyhole,
  LogOut, Map, MapPin, Menu, MessageSquare, Microscope, Minus, Package, Plane, Plus, RadioTower, Radar,
  RefreshCw, Search, Send, Shield, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Star, Swords, Target,
  Telescope, TrendingUp, Trophy, UserRound, Users, Wallet, Wheat, X, Zap, ZoomIn, ZoomOut, type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react';
import {
  BUILDING_BY_ID, BUILDINGS, MARKET_DEALS, MISSIONS, RESOURCE_KEYS, RESOURCE_META, TECH_BY_ID, TECHNOLOGIES,
  UNIT_BY_ID, UNITS, getUpgradeCost, getUpgradeSeconds, levelForXp, scaledCost, xpProgress,
} from '@/lib/game/catalog';
import type {
  AllianceInfo, AttackDirection, BattleReport, BuildingId, BuildingJob, GameSnapshot, GameState, InventoryItem, MissionDefinition,
  NotificationItem, RankingEntry, ResourceBundle, ResourceKey, ScoutReport, TechId, UnitId, WorldNode,
} from '@/lib/game/types';

type Section = 'base' | 'world' | 'army' | 'research' | 'market' | 'alliance' | 'inventory' | 'rankings' | 'missions' | 'profile';
type AuthMode = 'login' | 'register' | null;
type ToastState = { kind: 'loading' | 'success' | 'error' | 'info'; message: string } | null;

const NAV_ITEMS: { id: Section; label: string; icon: LucideIcon; code: string }[] = [
  { id: 'base', label: 'База', icon: House, code: '01' },
  { id: 'world', label: 'Карта мира', icon: Globe2, code: '02' },
  { id: 'army', label: 'Армия', icon: Swords, code: '03' },
  { id: 'research', label: 'Исследования', icon: Microscope, code: '04' },
  { id: 'market', label: 'Рынок', icon: ShoppingCart, code: '05' },
  { id: 'alliance', label: 'Альянс', icon: Users, code: '06' },
  { id: 'inventory', label: 'Инвентарь', icon: Package, code: '07' },
  { id: 'rankings', label: 'Рейтинги', icon: Trophy, code: '08' },
  { id: 'missions', label: 'Задания', icon: FileText, code: '09' },
  { id: 'profile', label: 'Командир', icon: UserRound, code: '10' },
];

const BUILDING_ICONS: Record<BuildingId, LucideIcon> = {
  hq: Command, barracks: HardHat, armor: Factory, artillery: Crosshair, airbase: Plane,
  warehouse: Boxes, refinery: Fuel, research: Microscope, comms: RadioTower, defense: ShieldCheck,
};
const RESOURCE_ICONS: Record<ResourceKey, LucideIcon> = {
  credits: CircleDollarSign, oil: Fuel, metal: Boxes, energy: Zap, food: Wheat,
};
const UNIT_ICONS: Record<UnitId, LucideIcon> = {
  rifle: Target, assault: Crosshair, recon: Telescope, light_tank: Shield, medium_tank: ShieldCheck, heavy_tank: HardHat,
  howitzer: Crosshair, rocket: Zap, fighter: Plane, strike: Plane, bomber: Plane,
};
const SECTION_TITLES: Record<Section, { title: string; eyebrow: string; subtitle: string }> = {
  base: { title: 'Главная база', eyebrow: 'Штаб · сектор 09', subtitle: 'Управляйте гарнизоном и держите северный рубеж.' },
  world: { title: 'Карта сектора', eyebrow: 'Тактическая сеть · N-04', subtitle: 'Разведывайте рубежи, ищите ресурсы и выбирайте следующую цель.' },
  army: { title: 'Гарнизон', eyebrow: 'Силы быстрого реагирования', subtitle: 'Формируйте соединения, обучайте бойцов и готовьте боевые группы.' },
  research: { title: 'Технологии', eyebrow: 'Научный корпус · уровень ' + '01', subtitle: 'Развивайте промышленность, армию, экономику и оборону.' },
  market: { title: 'Рынок снабжения', eyebrow: 'Северный консорциум · открытая биржа', subtitle: 'Обменивайте ресурсы по фиксированным контрактам без премиальной валюты.' },
  alliance: { title: 'Дипломатический корпус', eyebrow: 'Связь гарнизонов', subtitle: 'Создавайте союзы, договаривайтесь о мире и ведите внутренний канал.' },
  inventory: { title: 'Арсенал командира', eyebrow: 'Инвентарь · личные предметы', subtitle: 'Оборудование, памятные вещи и косметические коллекции.' },
  rankings: { title: 'Таблица командования', eyebrow: 'Рейтинг сектора · обновление онлайн', subtitle: 'Сравните мощь гарнизонов, влияние и контроль над территориями.' },
  missions: { title: 'Оперативные задачи', eyebrow: 'Полевые сводки · сезон 01', subtitle: 'Выполняйте поручения и получайте ресурсы, опыт и награды.' },
  profile: { title: 'Личное дело', eyebrow: 'Командир · личный архив', subtitle: 'Прогресс, достижения, учётная запись и состояние кошелька.' },
};

const CATEGORY_FILTERS = [
  { id: 'all', label: 'Все объекты' }, { id: 'base', label: 'Базы' }, { id: 'resource', label: 'Ресурсы' },
  { id: 'neutral', label: 'Нейтральные' }, { id: 'alliance', label: 'Альянсы' },
] as const;

type FilterKey = typeof CATEGORY_FILTERS[number]['id'];

function formatNumber(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (compact && Math.abs(value) >= 10_000) return `${(value / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} тыс`;
  return Math.round(value).toLocaleString('ru-RU');
}

function formatTimer(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder} сек`;
}

function timeAgo(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} ч назад` : `${Math.floor(hours / 24)} д назад`;
}

function resourceRate(state: GameState, key: ResourceKey): number {
  const economy = 1 + (state.technologies.economy || 0) * 0.12;
  if (key === 'credits') return Math.round((760 + state.buildings.hq * 110 + state.buildings.warehouse * 65) * economy);
  if (key === 'oil') return Math.round((state.buildings.refinery * 290 + 50) * economy);
  if (key === 'metal') return Math.round((270 + state.buildings.armor * 75 + state.buildings.artillery * 55 + state.buildings.warehouse * 25) * economy);
  if (key === 'energy') return Math.round((165 + state.buildings.research * 70 + state.buildings.comms * 34) * economy);
  return Math.round((380 + state.buildings.barracks * 58 + state.buildings.warehouse * 40) * economy);
}

function totalArmyPower(state: GameState): number {
  return UNITS.reduce((total, unit) => total + state.units[unit.id] * (unit.attack + unit.defense + Math.floor(unit.health / 10)), 0)
    + Object.values(state.buildings).reduce((sum, level) => sum + level * 115, 0) + state.stats.territoryCount * 220;
}

function tierClass(rarity: InventoryItem['rarity']): string {
  return `rarity-${rarity.toLowerCase()}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, credentials: 'same-origin', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Ошибка соединения (${response.status})`);
  return body as T;
}

function Chip({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'gold' | 'green' | 'red' | 'blue' }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

function SectionHeading({ section, right }: { section: Section; right?: ReactNode }) {
  const meta = SECTION_TITLES[section];
  return (
    <div className="section-heading">
      <div className="section-heading-copy">
        <div className="eyebrow"><span className="eyebrow-mark" />{meta.eyebrow}</div>
        <h1>{meta.title}</h1>
        <p>{meta.subtitle}</p>
      </div>
      {right && <div className="section-heading-actions">{right}</div>}
    </div>
  );
}

function ResourceCost({ cost, compact = false }: { cost: Partial<ResourceBundle>; compact?: boolean }) {
  return (
    <div className={`resource-cost ${compact ? 'resource-cost-compact' : ''}`}>
      {RESOURCE_KEYS.filter((key) => (cost[key] || 0) > 0).map((key) => {
        const Icon = RESOURCE_ICONS[key];
        return <span className={`cost-item cost-${key}`} key={key}><Icon size={13} /><b>{formatNumber(cost[key] || 0, true)}</b></span>;
      })}
    </div>
  );
}

function StatusBar({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null;
  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : toast.kind === 'loading' ? RefreshCw : Info;
  return (
    <div className={`status-toast toast-${toast.kind}`} role="status">
      <Icon size={17} className={toast.kind === 'loading' ? 'spin' : ''} />
      <span>{toast.message}</span>
      {toast.kind !== 'loading' && <button className="icon-button toast-close" aria-label="Закрыть" onClick={onClose}><X size={15} /></button>}
    </div>
  );
}

export default function GameApp() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('base');
  const [toast, setToast] = useState<ToastState>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [battleOpen, setBattleOpen] = useState<BattleReport | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingId>('hq');
  const [selectedTargetId, setSelectedTargetId] = useState('node_icewatch');
  const [mapFilter, setMapFilter] = useState<FilterKey>('all');
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const mapDrag = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const loadSnapshot = useCallback(async () => {
    const payload = await fetchJson<GameSnapshot>('/api/game');
    setSnapshot(payload);
    return payload;
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!me.ok) {
        await fetchJson('/api/auth/demo', { method: 'POST', body: JSON.stringify({}) });
      }
      setHasSession(true);
      await loadSnapshot();
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Нет связи с командным сервером.' });
    } finally {
      setLoading(false);
    }
  }, [loadSnapshot]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!hasSession) return;
    const timer = window.setInterval(() => { void loadSnapshot().catch(() => undefined); }, 4000);
    return () => window.clearInterval(timer);
  }, [hasSession, loadSnapshot]);
  useEffect(() => {
    if (!toast || toast.kind === 'loading') return;
    const timer = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 5200 : 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const execute = useCallback(async (action: string, payload: Record<string, unknown> = {}, successMessage?: string) => {
    setPending(action);
    setToast({ kind: 'loading', message: 'Приказ передан на командный сервер…' });
    try {
      const result = await fetchJson<{ snapshot: GameSnapshot; result?: BattleReport | { message: string } }>('/api/game/action', {
        method: 'POST', body: JSON.stringify({ action, ...payload }),
      });
      setSnapshot(result.snapshot);
      if (result.result && 'outcome' in result.result) setBattleOpen(result.result);
      const defaultMessage = result.result && 'message' in result.result ? result.result.message : 'Приказ выполнен. Данные синхронизированы.';
      setToast({ kind: 'success', message: successMessage || defaultMessage });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось выполнить приказ.';
      setToast({ kind: 'error', message });
      return null;
    } finally {
      setPending(null);
    }
  }, []);

  const login = async (mode: Exclude<AuthMode, null>, values: { login?: string; username?: string; email?: string; password: string }) => {
    setPending('auth');
    setToast({ kind: 'loading', message: 'Проверяем документы командира…' });
    try {
      if (mode === 'register') {
        await fetchJson('/api/auth/register', { method: 'POST', body: JSON.stringify(values) });
      } else {
        await fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify(values) });
      }
      setHasSession(true);
      setAuthMode(null);
      await loadSnapshot();
      setToast({ kind: 'success', message: mode === 'register' ? 'Аккаунт создан. Новая база развёрнута.' : 'Вход подтверждён. Гарнизон синхронизирован.' });
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Не удалось войти.' });
    } finally {
      setPending(null);
    }
  };

  const logout = async () => {
    try { await fetchJson('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* session still expires server-side */ }
    setHasSession(false);
    setAuthMode('login');
    setToast({ kind: 'info', message: 'Сессия завершена. Войдите снова или продолжите в демо-мире.' });
  };

  const unreadCount = snapshot?.game.notifications.filter((item) => !item.read).length || 0;
  const pageMeta = SECTION_TITLES[section];
  const missionDone = useCallback((id: string, game: GameState) => {
    if (id === 'hq_2') return game.buildings.hq >= 2;
    if (id === 'train_100') return game.stats.unitsProduced >= 100;
    if (id === 'research_1') return Object.values(game.technologies).some((level) => level > 0);
    if (id === 'scout_1') return (game.dailyScouts || 0) >= 1;
    if (id === 'victory_1') return game.stats.wins >= 1;
    if (id === 'supplies_1') return (game.dailySupplies || 0) >= 1;
    return false;
  }, []);

  if (loading) return <LoadingScreen />;
  if (!snapshot) {
    return <ConnectionScreen onRetry={bootstrap} toast={toast} onLogin={() => setAuthMode('login')} />;
  }

  const { game } = snapshot;
  const rank = xpProgress(game.xp);
  const currentTarget = snapshot.world.find((node) => node.id === selectedTargetId) || snapshot.world.find((node) => !node.isOwn) || snapshot.world[0];
  const recentActivities = game.notifications.slice(0, 5);
  const activeJobs = [
    ...game.buildingQueue.map((job) => ({ id: job.id, label: BUILDING_BY_ID[job.building].short, type: 'Строительство', finishAt: job.finishAt, startedAt: job.startedAt, Icon: Building2 })),
    ...game.trainingQueue.map((job) => ({ id: job.id, label: `${job.count} × ${UNIT_BY_ID[job.unit].name}`, type: 'Подготовка', finishAt: job.finishAt, startedAt: job.startedAt, Icon: Swords })),
    ...(game.researchJob ? [{ id: game.researchJob.id, label: TECH_BY_ID[game.researchJob.technology].name, type: 'Исследование', finishAt: game.researchJob.finishAt, startedAt: game.researchJob.startedAt, Icon: Microscope }] : []),
    ...game.scoutMissions.map((job) => ({ id: job.id, label: job.targetName, type: 'Разведка', finishAt: job.finishAt, startedAt: job.startedAt, Icon: Radar })),
  ].sort((a, b) => a.finishAt - b.finishAt);

  const mainContent = (() => {
    switch (section) {
      case 'base': return <BaseScreen snapshot={snapshot} now={now} selectedBuilding={selectedBuilding} setSelectedBuilding={setSelectedBuilding} execute={execute} pending={pending} onOpenWorld={() => setSection('world')} onShowJournal={() => setJournalOpen(true)} />;
      case 'world': return <WorldScreen snapshot={snapshot} now={now} selectedTarget={currentTarget} selectedTargetId={selectedTargetId} setSelectedTargetId={setSelectedTargetId} filter={mapFilter} setFilter={setMapFilter} zoom={mapZoom} setZoom={setMapZoom} pan={mapPan} setPan={setMapPan} drag={mapDrag} execute={execute} pending={pending} onOpenJournal={() => setJournalOpen(true)} />;
      case 'army': return <ArmyScreen snapshot={snapshot} now={now} execute={execute} pending={pending} onOpenWorld={() => setSection('world')} />;
      case 'research': return <ResearchScreen snapshot={snapshot} now={now} execute={execute} pending={pending} />;
      case 'market': return <MarketScreen snapshot={snapshot} execute={execute} pending={pending} />;
      case 'alliance': return <AllianceScreen snapshot={snapshot} execute={execute} pending={pending} />;
      case 'inventory': return <InventoryScreen snapshot={snapshot} execute={execute} pending={pending} />;
      case 'rankings': return <RankingsScreen snapshot={snapshot} />;
      case 'missions': return <MissionsScreen snapshot={snapshot} execute={execute} pending={pending} missionDone={missionDone} />;
      case 'profile': return <ProfileScreen snapshot={snapshot} execute={execute} pending={pending} onAuth={() => setAuthMode('register')} onLogout={logout} onWallet={() => setWalletOpen(true)} />;
    }
  })();

  return (
    <div className="game-shell">
      <header className="topbar">
        <button className="brand-lockup" onClick={() => setSection('base')} aria-label="NORTHLINE — база">
          <span className="brand-emblem"><span>Ｎ</span><i /></span>
          <span className="brand-copy"><b>NORTHLINE</b><small>FRONTIER COMMAND <em>09</em></small></span>
        </button>
        <div className="topbar-divider" />
        <div className="resource-strip" aria-label="Ресурсы базы">
          {RESOURCE_KEYS.map((key) => {
            const Icon = RESOURCE_ICONS[key];
            return (
              <div className={`top-resource resource-${key}`} key={key} title={`${RESOURCE_META[key].label} · +${formatNumber(resourceRate(game, key))} в час`}>
                <span className="resource-icon"><Icon size={15} /></span>
                <span className="resource-readout"><b>{formatNumber(game.resources[key], true)}</b><small>+{formatNumber(resourceRate(game, key), true)} / ч</small></span>
              </div>
            );
          })}
        </div>
        <div className="topbar-actions">
          <button className="wallet-button" onClick={() => setWalletOpen(true)}><Wallet size={15} /><span>CONNECT WALLET</span><i /></button>
          <button className="commander-chip" onClick={() => snapshot.user.id === 'demo' ? setAuthMode('register') : setSection('profile')} title="Учётная запись">
            <span className="commander-avatar">{(snapshot.user.username || 'К').slice(0, 2).toUpperCase()}</span>
            <span className="commander-chip-copy"><b>{snapshot.user.username}</b><small>КОМАНДИР · ур. {rank.level}</small></span>
            <ChevronDown size={14} />
          </button>
          <button className={`icon-button notification-trigger ${unreadCount ? 'has-notice' : ''}`} onClick={() => setNoticeOpen(true)} aria-label="Уведомления"><Bell size={17} />{unreadCount > 0 && <i>{Math.min(9, unreadCount)}</i>}</button>
        </div>
      </header>

      <div className="main-layout">
        <aside className="left-rail">
          <div className="rail-section-label">КОМАНДОВАНИЕ</div>
          <nav className="primary-nav" aria-label="Основная навигация">
            {NAV_ITEMS.map(({ id, label, icon: Icon, code }) => (
              <button key={id} className={`nav-item ${section === id ? 'nav-active' : ''}`} onClick={() => { setSection(id); setMoreMenuOpen(false); }}>
                <span className="nav-code">{code}</span><Icon size={18} /><span className="nav-label">{label}</span>
                {id === 'missions' && MISSIONS.some((mission) => !(mission.category === 'Ежедневная' ? (game.dailyClaims || []).includes(mission.id) : game.claimedMissions.includes(mission.id)) && missionDone(mission.id, game)) && <span className="nav-pip" />}
                {section === id && <span className="nav-active-edge" />}
              </button>
            ))}
          </nav>
          <div className="left-rail-bottom">
            <div className="rail-section-label">СЕКТОР</div>
            <div className="sector-status"><span className="signal-dot" /><div><b>N-04 / NORTHLINE</b><small>СЕРВЕР АКТИВЕН</small></div></div>
            <div className="left-footer"><span>CLIENT v0.9.4</span><span>UTC+0</span></div>
          </div>
        </aside>

        <main className="main-stage" key={section}>
          <SectionHeading section={section} right={section === 'base' ? <><button className="button button-quiet button-small" onClick={() => setJournalOpen(true)}><FileText size={14} /> Журнал боёв</button><button className="button button-brass button-small" disabled={pending === 'collect' || Boolean(game.stats.lastSupplyAt && now - game.stats.lastSupplyAt < 45_000)} onClick={() => execute('collect', {}, 'Полевой резерв доставлен на базу.')}><Package size={14} /> Снабжение</button></> : section === 'world' ? <button className="button button-quiet button-small" onClick={() => setJournalOpen(true)}><FileText size={14} /> Журнал боёв</button> : undefined} />
          {mainContent}
        </main>

        <aside className="right-rail">
          <CommanderPanel snapshot={snapshot} rank={rank} onClick={() => setSection('profile')} />
          <div className="intel-section">
            <div className="rail-heading"><span>ОЧЕРЕДЬ ОПЕРАЦИЙ</span><span className="tiny-count">{activeJobs.length.toString().padStart(2, '0')}</span></div>
            {activeJobs.length ? <div className="queue-list">{activeJobs.slice(0, 4).map((job) => <QueueItem key={job.id} job={job} now={now} />)}</div> : <div className="empty-queue"><Clock3 size={16} /><span>Нет активных операций</span><small>Запустите строительство, подготовку или исследование.</small></div>}
          </div>
          <div className="intel-section mission-briefing">
            <div className="rail-heading"><span>ТЕКУЩЕЕ ПОРУЧЕНИЕ</span><span className="mini-code">OP-01</span></div>
            <div className="briefing-title">Первый рубеж</div>
            <p>Разведайте объект на карте и подготовьте силы к вылазке.</p>
            <div className="briefing-progress"><i style={{ width: `${Math.min(100, (Number(game.stats.scoutsSent > 0) * 45) + (game.stats.wins > 0 ? 55 : 0))}%` }} /></div>
            <div className="briefing-foot"><span>{game.stats.scoutsSent > 0 ? 'РАЗВЕДКА ЕСТЬ' : 'ОЖИДАЕТ РАЗВЕДКИ'}</span><button onClick={() => setSection('missions')}>ОТКРЫТЬ <ChevronRight size={12} /></button></div>
          </div>
          <div className="intel-section activity-section">
            <div className="rail-heading"><span>СИГНАЛЫ СЕКТОРА</span><button className="text-button" onClick={() => setNoticeOpen(true)}>ВСЕ</button></div>
            {recentActivities.slice(0, 4).map((item) => <ActivityRow key={item.id} item={item} now={now} />)}
          </div>
          <div className="right-rail-footer"><span className="small-shield"><Shield size={14} /></span><span>СЕАНС ЗАЩИЩЁН</span><b>●</b></div>
        </aside>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Мобильная навигация">
        {NAV_ITEMS.slice(0, 4).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'mobile-active' : ''} onClick={() => setSection(id)}><Icon size={19} /><small>{label}</small></button>)}
        <button className={moreMenuOpen ? 'mobile-active' : ''} onClick={() => setMoreMenuOpen(!moreMenuOpen)}><Menu size={19} /><small>Ещё</small></button>
      </nav>
      {moreMenuOpen && <div className="mobile-more-menu">{NAV_ITEMS.slice(4).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setMoreMenuOpen(false); }}><Icon size={16} />{label}<ChevronRight size={14} /></button>)}</div>}

      <StatusBar toast={toast} onClose={() => setToast(null)} />
      {noticeOpen && <NotificationsModal notifications={game.notifications} now={now} onClose={() => setNoticeOpen(false)} onRead={() => execute('markNotifications', {}, 'Все уведомления отмечены прочитанными.')} />}
      {authMode && <AuthModal mode={authMode} pending={pending === 'auth'} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} onSubmit={login} onDemo={async () => {
        setPending('auth');
        try { await fetchJson('/api/auth/demo', { method: 'POST', body: JSON.stringify({}) }); setHasSession(true); setAuthMode(null); await loadSnapshot(); setToast({ kind: 'success', message: 'Демо-сессия командира восстановлена.' }); }
        catch (error) { setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Не удалось открыть демо.' }); }
        finally { setPending(null); }
      }} />}
      {walletOpen && <WalletModal onClose={() => setWalletOpen(false)} />}
      {battleOpen && <BattleModal report={battleOpen} now={now} onClose={() => setBattleOpen(null)} />}
      {journalOpen && <BattleJournal reports={game.battleReports} now={now} onClose={() => setJournalOpen(false)} onOpenReport={(report) => { setJournalOpen(false); setBattleOpen(report); }} />}
      <div className={`sound-state ${soundEnabled ? 'sound-on' : ''}`}><button title="Звуковые эффекты скоро появятся" onClick={() => { setSoundEnabled(!soundEnabled); setToast({ kind: 'info', message: soundEnabled ? 'Звуковая индикация отключена.' : 'Звуковой канал подготовлен. В этой версии аудио отключено.' }); }}><Activity size={13} /></button></div>
    </div>
  );
}

function LoadingScreen() {
  return <div className="boot-screen"><div className="boot-grid" /><div className="boot-mark"><div className="boot-emblem">N</div><span>NORTHLINE // SECTOR 09</span><div className="boot-loader"><i /></div><small>ПОДКЛЮЧЕНИЕ К КОМАНДНОМУ СЕРВЕРУ</small></div></div>;
}

function ConnectionScreen({ onRetry, onLogin, toast }: { onRetry: () => void; onLogin: () => void; toast: ToastState }) {
  return <div className="connection-screen"><Shield size={42} /><span className="eyebrow">NORTHLINE · ОШИБКА СВЯЗИ</span><h1>Сектор временно недоступен</h1><p>{toast?.message || 'Не удалось связаться с командным сервером.'}</p><div><button className="button button-brass" onClick={onRetry}><RefreshCw size={15} /> Повторить подключение</button><button className="button button-quiet" onClick={onLogin}>Войти в аккаунт</button></div></div>;
}

function CommanderPanel({ snapshot, rank, onClick }: { snapshot: GameSnapshot; rank: ReturnType<typeof xpProgress>; onClick: () => void }) {
  const power = totalArmyPower(snapshot.game);
  const winRate = snapshot.game.stats.totalBattles ? Math.round(snapshot.game.stats.wins / snapshot.game.stats.totalBattles * 100) : 0;
  return (
    <button className="commander-panel" onClick={onClick}>
      <div className="commander-panel-head"><span>КОМАНДИР СЕКТОРА</span><ArrowUpRight size={14} /></div>
      <div className="commander-profile-row"><div className="profile-insignia">{snapshot.game.avatar || snapshot.user.username.slice(0, 2).toUpperCase()}<i /></div><div><b>{snapshot.user.username}</b><small>{snapshot.game.bio || 'Командир северной дуги'}</small></div></div>
      <div className="commander-level-line"><span>УРОВЕНЬ {rank.level}</span><span>{formatNumber(snapshot.game.xp)} XP</span></div>
      <div className="xp-track"><i style={{ width: `${rank.percent}%` }} /></div>
      <div className="commander-metrics"><span><Swords size={13} /><b>{formatNumber(power, true)}</b><small>МОЩЬ</small></span><span><Trophy size={13} /><b>{snapshot.game.stats.wins}</b><small>ПОБЕДЫ</small></span><span><Flag size={13} /><b>{snapshot.game.stats.territoryCount}</b><small>ЗЕМЛИ</small></span></div>
      <div className="commander-bottom"><span>РЕЙТИНГ <b>{formatNumber(snapshot.game.stats.rating)}</b></span><span>ВИНРЕЙТ <b>{winRate}%</b></span></div>
    </button>
  );
}

function QueueItem({ job, now }: { job: { id: string; label: string; type: string; finishAt: number; startedAt: number; Icon: LucideIcon }; now: number }) {
  const remaining = Math.max(0, job.finishAt - now);
  const duration = Math.max(1, job.finishAt - job.startedAt);
  const pct = Math.max(2, Math.min(100, (1 - remaining / duration) * 100));
  return <div className="queue-item"><span className="queue-icon"><job.Icon size={14} /></span><div className="queue-copy"><div><small>{job.type}</small><b>{job.label}</b></div><span>{remaining <= 0 ? 'ГОТОВО' : formatTimer(remaining)}</span><div className="queue-track"><i style={{ width: `${pct}%` }} /></div></div></div>;
}

function ActivityRow({ item, now }: { item: NotificationItem; now: number }) {
  const icon = item.kind === 'battle' ? <Swords size={13} /> : item.kind === 'building' ? <Hammer size={13} /> : item.kind === 'research' ? <Microscope size={13} /> : item.kind === 'scout' ? <Radar size={13} /> : <Activity size={13} />;
  return <div className={`activity-row ${item.read ? '' : 'activity-unread'}`}><span className="activity-icon">{icon}</span><div><b>{item.title}</b><small>{item.body}</small><em>{timeAgo(item.createdAt, now)}</em></div></div>;
}

function BaseScreen({ snapshot, now, selectedBuilding, setSelectedBuilding, execute, pending, onOpenWorld, onShowJournal }: {
  snapshot: GameSnapshot; now: number; selectedBuilding: BuildingId; setSelectedBuilding: (id: BuildingId) => void;
  execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null;
  onOpenWorld: () => void; onShowJournal: () => void;
}) {
  const { game } = snapshot;
  const selected = BUILDING_BY_ID[selectedBuilding];
  const level = game.buildings[selectedBuilding];
  const job = game.buildingQueue.find((item) => item.building === selectedBuilding);
  const cost = getUpgradeCost(selectedBuilding, level);
  const atCap = level >= 20;
  const canUpgrade = !atCap && (selectedBuilding === 'hq' || level + 1 <= game.buildings.hq + 1);
  const queueCap = Math.min(3, 1 + Math.floor((game.buildings.hq - 1) / 2));
  const queueFree = game.buildingQueue.length < queueCap && !game.buildingQueue.some((item) => item.building === selectedBuilding);
  const levelProgress = Math.min(100, Math.max(0, 100 - (game.stats.territoryCount * -2)));
  const canSupply = !game.stats.lastSupplyAt || now - game.stats.lastSupplyAt >= 45_000;
  const incomeRows = RESOURCE_KEYS.map((key) => ({ key, value: resourceRate(game, key) }));
  return (
    <div className="base-screen screen-enter">
      <div className="base-overview-bar">
        <div className="base-location"><span className="location-pip" /><div><b>СЕВЕРНЫЙ РУБЕЖ / N-04</b><small>СОБСТВЕННЫЙ СЕКТОР · КОНТРОЛЬ СТАБИЛЕН</small></div></div>
        <div className="base-live-stats"><span><span>ГАРНИЗОН</span><b>{formatNumber(Object.values(game.units).reduce((sum, item) => sum + item, 0))}</b></span><i /><span><span>ТЕРРИТОРИИ</span><b>{game.stats.territoryCount}</b></span><i /><span><span>УСЛОВИЯ</span><b className="safe-state"><span /> СПОКОЙНО</b></span></div>
        <button className="overview-refresh" onClick={onOpenWorld}><Globe2 size={14} /> МИРОВАЯ КАРТА <ArrowRight size={14} /></button>
      </div>

      <div className="base-stage">
        <div className="base-map-art" />
        <div className="base-map-grid" />
        <div className="base-stage-shade" />
        <div className="stage-crosshair stage-crosshair-a" /><div className="stage-crosshair stage-crosshair-b" />
        <div className="stage-coordinate stage-coordinate-left">N 55° 42′ 18.09″<br />E 37° 36′ 10.41″</div>
        <div className="stage-coordinate stage-coordinate-right">NORTHLINE / N-04<br />TACTICAL VIEW · 1:18 000</div>
        <div className="base-stage-top"><span className="stage-label"><span /> ОПЕРАТИВНАЯ БАЗА</span><span className="stage-status"><span /> ONLINE · 09:41:22 UTC</span></div>
        <div className="base-buildings-layer">
          {BUILDINGS.map((building) => {
            const Icon = BUILDING_ICONS[building.id];
            const isActive = building.id === selectedBuilding;
            const inQueue = game.buildingQueue.some((item) => item.building === building.id);
            return (
              <button key={building.id} onClick={() => setSelectedBuilding(building.id)} className={`building-marker marker-${building.id} ${isActive ? 'building-marker-active' : ''} ${inQueue ? 'building-marker-working' : ''}`} style={{ left: `${building.x}%`, top: `${building.y}%` }}>
                <span className="building-pictogram"><Icon size={17} strokeWidth={1.75} /><i /></span>
                <span className="building-tag"><b>{building.short}</b><small>УР. {game.buildings[building.id]}</small></span>
                {inQueue && <span className="building-working-pip"><RefreshCw size={9} /></span>}
              </button>
            );
          })}
        </div>
        <div className="stage-center-seal"><span>09</span><small>СЕКТОР</small></div>
        <div className="stage-caption"><span>РЕЖИМ НАБЛЮДЕНИЯ</span><i /> ВАШ ГАРНИЗОН</div>
      </div>

      <div className="base-lower-grid">
        <section className="panel building-detail-panel">
          <div className="panel-topline"><span>ОБЪЕКТ / {selected.category}</span><span className="panel-coord">{String(Math.floor(selected.x * 8.2)).padStart(3, '0')}.{String(Math.floor(selected.y * 6.1)).padStart(2, '0')} — N04</span></div>
          <div className="building-detail-content">
            <div className="building-emblem"><span><ReactIconForBuilding id={selectedBuilding} /></span><small>LEVEL {String(level).padStart(2, '0')}</small></div>
            <div className="building-copy">
              <div className="building-title-line"><div><h2>{selected.name}</h2><p>{selected.description}</p></div><Chip tone={job ? 'gold' : 'green'}>{job ? 'В РАБОТЕ' : 'АКТИВЕН'}</Chip></div>
              <div className="building-feature"><Sparkles size={14} /><span>{selected.effect}</span></div>
              <div className="building-stats-row">
                <div><small>ТЕКУЩИЙ УРОВЕНЬ</small><b>{String(level).padStart(2, '0')} <em>/ 20</em></b></div>
                <div><small>СЛЕДУЮЩИЙ УРОВЕНЬ</small><b>{atCap ? 'МАКС. УРОВЕНЬ' : job ? `УР. ${job.toLevel} · ${formatTimer(job.finishAt - now)}` : `${String(level + 1).padStart(2, '0')} · ${formatTimer(getUpgradeSeconds(selectedBuilding, level) * 1000)}`}</b></div>
                <div><small>СОСТОЯНИЕ</small><b className="good-value">{job ? 'МОДЕРНИЗАЦИЯ' : 'БОЕГОТОВ'}</b></div>
              </div>
              <div className="building-upgrade-row">
                <div className="upgrade-cost-wrap"><span className="micro-label">СТОИМОСТЬ УЛУЧШЕНИЯ</span><ResourceCost cost={cost} compact /></div>
                <div className="upgrade-action-wrap">
                  {job ? <button className="button button-brass" disabled={pending === 'speedup'} onClick={() => execute('speedup', { jobId: job.id }, `${selected.name}: модернизация завершена.`)}><Zap size={15} /> Ускорить · {formatNumber(220 + job.toLevel * 120)}</button>
                    : <button className="button button-brass" disabled={!canUpgrade || !queueFree || pending === 'upgrade'} onClick={() => execute('upgrade', { building: selectedBuilding }, `${selected.name}: улучшение поставлено в очередь.`)}><ArrowUpRight size={15} /> {atCap ? 'Максимальный уровень' : `Улучшить до ур. ${level + 1}`}</button>}
                  {!job && !atCap && !canUpgrade && <small className="requirement-note"><LockKeyhole size={12} /> Требуется штаб {level} уровня</small>}
                  {!job && atCap && <small className="requirement-note"><CheckCircle2 size={12} /> Максимальный уровень достигнут</small>}
                  {!job && canUpgrade && !queueFree && <small className="requirement-note"><Clock3 size={12} /> Очередь строительства занята</small>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel base-economy-panel">
          <div className="panel-topline"><span>РИТМ БАЗЫ</span><span className="pulse-label"><i /> ДОБЫЧА</span></div>
          <div className="economy-mini-grid">{incomeRows.map(({ key, value }) => {
            const Icon = RESOURCE_ICONS[key];
            return <div className={`economy-mini economy-${key}`} key={key}><span><Icon size={14} />{RESOURCE_META[key].short}</span><b>+{formatNumber(value, true)}<small>/ч</small></b></div>;
          })}</div>
          <div className="economy-footer"><span>ХРАНИЛИЩЕ <b>РАБОТАЕТ</b></span><button className="text-button" onClick={onShowJournal}>БОЕВОЙ ЖУРНАЛ <ChevronRight size={12} /></button></div>
        </section>
      </div>

      <div className="base-footer-callout"><span className="callout-icon"><Info size={15} /></span><p><b>Совет штаба</b> — отправьте разведчиков к ближайшей заставе. Доклад покажет примерную мощь гарнизона и поможет выбрать состав ударной группы.</p><button onClick={onOpenWorld}>К КАРТЕ <ArrowRight size={14} /></button></div>
      <div className="base-supply-mobile"><button className="button button-brass" disabled={!canSupply || pending === 'collect'} onClick={() => execute('collect', {}, 'Полевой резерв доставлен на базу.')}><Package size={14} /> Забрать снабжение</button></div>
    </div>
  );
}

function ReactIconForBuilding({ id }: { id: BuildingId }) {
  const Icon = BUILDING_ICONS[id];
  return <Icon size={23} strokeWidth={1.65} />;
}

function WorldScreen({ snapshot, now, selectedTarget, selectedTargetId, setSelectedTargetId, filter, setFilter, zoom, setZoom, pan, setPan, drag, execute, pending, onOpenJournal }: {
  snapshot: GameSnapshot; now: number; selectedTarget: WorldNode; selectedTargetId: string; setSelectedTargetId: (id: string) => void;
  filter: FilterKey; setFilter: (filter: FilterKey) => void; zoom: number; setZoom: (zoom: number) => void; pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void; drag: React.MutableRefObject<{ x: number; y: number; active: boolean } | null>;
  execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null; onOpenJournal: () => void;
}) {
  const [attackUnit, setAttackUnit] = useState<UnitId>('rifle');
  const [attackCount, setAttackCount] = useState(64);
  const [attackDirection, setAttackDirection] = useState<AttackDirection>('frontal');
  const { game } = snapshot;
  const visible = snapshot.world.filter((node) => {
    if (node.isOwn) return true;
    if (filter === 'all') return true;
    if (filter === 'base') return node.kind === 'base';
    return node.kind === filter;
  });
  const report = game.scoutReports.find((item) => item.targetId === selectedTarget.id && item.expiresAt > now);
  const ownNode = selectedTarget.isOwn;
  const canAttack = !ownNode && selectedTarget.ownerUserId !== game.userId;
  const unitDefinition = UNIT_BY_ID[attackUnit];
  const maxCount = game.units[attackUnit];
  const suitableCount = Math.min(Math.max(1, attackCount), maxCount);
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.map-node, .map-control, .map-filter-row')) return;
    drag.current = { x: event.clientX, y: event.clientY, active: true };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current?.active) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
    setPan({ x: Math.max(-220, Math.min(220, pan.x + dx)), y: Math.max(-170, Math.min(170, pan.y + dy)) });
  };
  const handlePointerUp = () => { if (drag.current) drag.current.active = false; };
  const zoomIn = () => setZoom(Math.min(1.55, Number((zoom + 0.1).toFixed(2))));
  const zoomOut = () => setZoom(Math.max(0.8, Number((zoom - 0.1).toFixed(2))));
  const selectedMarkerColor = selectedTarget.kind === 'resource' ? 'amber' : selectedTarget.kind === 'own' ? 'green' : selectedTarget.kind === 'alliance' ? 'blue' : selectedTarget.kind === 'neutral' ? 'neutral' : 'red';
  return (
    <div className="world-screen screen-enter">
      <div className="world-toolbar">
        <div className="map-sector-code"><Map size={16} /><span>СЕКТОР N-04 <b>·</b> КООРДИНАТЫ 55°42′ / 37°36′</span></div>
        <div className="map-toolbar-right"><span className="live-map"><i /> ЖИВАЯ КАРТА</span><button className="button button-quiet button-small" onClick={onOpenJournal}><FileText size={14} /> Журнал</button></div>
      </div>
      <div className="world-map-layout">
        <div className="world-map-panel">
          <div className="map-filter-row">
            <div className="map-filters"><Filter size={13} />{CATEGORY_FILTERS.map((item) => <button key={item.id} className={filter === item.id ? 'filter-active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
            <div className="map-scale"><span>МАСШТАБ</span><b>{Math.round(zoom * 100)}%</b></div>
          </div>
          <div className="world-map-viewport" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
            <div className="world-map-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
              <svg className="map-terrain" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
                <defs><linearGradient id="mapTone" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#232d2a" /><stop offset=".58" stopColor="#182221" /><stop offset="1" stopColor="#202b29" /></linearGradient><pattern id="mapGrid" width="70" height="70" patternUnits="userSpaceOnUse"><path d="M 70 0 L 0 0 0 70" fill="none" stroke="#96aa91" strokeOpacity=".10" strokeWidth=".7" /></pattern></defs>
                <rect width="1000" height="620" fill="url(#mapTone)" /><rect width="1000" height="620" fill="url(#mapGrid)" />
                <path d="M0 150 C135 106 148 209 251 185 S376 85 498 131 619 191 747 128 892 105 1000 81M0 180 C135 135 151 235 253 211S379 112 500 158 621 218 750 155 895 131 1000 110M0 213 C139 167 153 266 258 243S384 145 506 188 625 252 754 189 899 166 1000 143" fill="none" stroke="#9eae91" strokeOpacity=".17" strokeWidth="1.2" />
                <path d="M14 475 C101 421 191 448 241 381S329 297 437 337 559 424 638 379 791 277 873 305 938 378 1012 345M0 508 C100 450 189 482 243 414S330 328 441 369 561 456 643 411 793 310 877 337 947 410 1010 377M0 544 C98 486 192 517 248 449S338 364 448 404 568 492 651 445 800 344 886 370 954 440 1014 411" fill="none" stroke="#a4ac8d" strokeOpacity=".15" strokeWidth="1.1" />
                <path d="M72 0 C112 113 197 180 270 213S359 277 362 345 318 469 356 620M103 0 C143 115 228 188 298 222S389 288 390 354 345 475 385 620" fill="none" stroke="#b59c70" strokeOpacity=".14" strokeWidth="1.4" />
                <path d="M0 300 C118 291 186 330 271 306S419 258 491 286 642 363 726 331 898 250 1000 287" fill="none" stroke="#c6a56b" strokeOpacity=".35" strokeDasharray="7 7" strokeWidth="2" />
                <path d="M242 198 C315 249 366 256 438 291S557 342 624 302 747 222 844 260" fill="none" stroke="#c9c3aa" strokeOpacity=".22" strokeWidth="3" />
                <path d="M458 0 C473 115 510 180 551 259S624 408 612 620" fill="none" stroke="#6a9290" strokeOpacity=".17" strokeWidth="2" />
                <ellipse cx="538" cy="328" rx="95" ry="57" fill="#b28d4b" fillOpacity=".06" stroke="#b6975a" strokeOpacity=".28" strokeDasharray="3 6" />
                <text x="76" y="365" fill="#b7bb9b" fillOpacity=".34" fontSize="13" letterSpacing="4">КЕДРОВАЯ ДУГА</text><text x="683" y="525" fill="#b7bb9b" fillOpacity=".30" fontSize="12" letterSpacing="4">ВОСТОЧНЫЙ РУДНИК</text><text x="653" y="176" fill="#b7bb9b" fillOpacity=".28" fontSize="12" letterSpacing="3">СЕВЕРНЫЙ КАНАЛ</text>
              </svg>
              <div className="map-radar-sweep" />
              {visible.map((node) => {
                const selected = selectedTargetId === node.id;
                const icon = node.isOwn ? <House size={15} /> : node.kind === 'resource' ? <CircleDollarSign size={14} /> : node.kind === 'city' ? <Building2 size={15} /> : node.kind === 'alliance' ? <ShieldCheck size={15} /> : node.kind === 'neutral' ? <Radar size={15} /> : <Crosshair size={15} />;
                return <button key={node.id} className={`map-node map-node-${node.kind} ${selected ? 'map-node-selected' : ''} ${node.isCaptured ? 'map-node-captured' : ''}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onPointerDown={(event) => event.stopPropagation()} onClick={() => setSelectedTargetId(node.id)} title={`${node.name} · ${node.owner}`}><span className="map-node-ring" /><span className="map-node-icon">{icon}</span><span className="map-node-label">{node.name}</span>{node.allianceTag && <i className="map-node-tag">{node.allianceTag}</i>}</button>;
              })}
              <span className="map-compass"><i>N</i><ArrowUpRight size={14} /></span>
            </div>
            <div className="map-coordinate-line"><span>56°N</span><span>55°N</span><span>54°N</span></div>
            <div className="map-control"><button onClick={zoomIn} aria-label="Увеличить карту"><ZoomIn size={17} /></button><button onClick={zoomOut} aria-label="Уменьшить карту"><ZoomOut size={17} /></button><i /><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Сбросить масштаб"><RefreshCw size={14} /></button></div>
            <div className="map-legend"><span><i className="legend-own" /> СВОЯ БАЗА</span><span><i className="legend-hostile" /> ОБЪЕКТ</span><span><i className="legend-resource" /> РЕСУРС</span></div>
          </div>
          <div className="world-map-footer"><span>ОБЪЕКТОВ В СЕТИ <b>{visible.length.toString().padStart(2, '0')}</b></span><span>ПОСЛЕДНИЙ СИГНАЛ <b>СЕЙЧАС</b></span><span>ПЕРЕТАЩИТЕ КАРТУ ДЛЯ ПЕРЕМЕЩЕНИЯ</span></div>
        </div>

        <div className="world-intel-column">
          <section className="panel target-panel">
            <div className="panel-topline"><span>ДОСЬЕ ОБЪЕКТА</span><span className={`signal-tag signal-${selectedMarkerColor}`}><i />{selectedTarget.kind === 'own' ? 'СВОЙ' : selectedTarget.isCaptured ? 'ЗАХВАЧЕН' : 'СИГНАЛ'}</span></div>
            <div className={`target-hero target-hero-${selectedMarkerColor}`}><div className="target-hero-icon">{selectedTarget.kind === 'resource' ? <CircleDollarSign size={21} /> : selectedTarget.kind === 'city' ? <Building2 size={21} /> : selectedTarget.kind === 'alliance' ? <ShieldCheck size={21} /> : selectedTarget.isOwn ? <House size={21} /> : <Crosshair size={21} />}</div><div><h2>{selectedTarget.name}</h2><p>{selectedTarget.subtitle}</p></div></div>
            <div className="target-data-grid"><div><small>ВЛАДЕЛЕЦ</small><b>{selectedTarget.owner}</b></div><div><small>УРОВЕНЬ</small><b>{String(selectedTarget.level).padStart(2, '0')}</b></div><div><small>АЛЬЯНС</small><b>{selectedTarget.allianceTag || '—'}</b></div><div><small>ОБОРОНА</small><b>{ownNode ? 'СЕКРЕТНО' : report ? report.defenseEstimate.toUpperCase() : 'НЕИЗВЕСТНО'}</b></div></div>
            {report ? <div className="scout-report-box"><div className="report-box-head"><Radar size={14} /><b>РАЗВЕДДАННЫЕ</b><span>АКТУАЛЬНО · {formatTimer(report.expiresAt - now)}</span></div><p>{report.estimatedUnits}<br />{report.resourceEstimate} · {report.structures.join(' / ')}</p><small>{report.detail}</small></div> : !ownNode ? <div className="target-unscouted"><Telescope size={16} /><span>Радиомолчание. Точный состав гарнизона неизвестен.</span></div> : <div className="target-unscouted"><ShieldCheck size={16} /><span>Штаб вашей базы защищён внутренним протоколом.</span></div>}
            <div className="target-action-block">
              <button className="button button-quiet button-full" disabled={selectedTarget.ownerUserId === game.userId || !game.units.recon || pending === 'scout'} onClick={() => execute('scout', { targetId: selectedTarget.id }, `Разведгруппа направлена к объекту «${selectedTarget.name}».`)}><Radar size={15} /> Провести разведку <span className="action-tail">1 разведчик · 7 сек</span></button>
              <div className="attack-select-row"><label><span>УДАРНАЯ ГРУППА</span><select value={attackUnit} onChange={(event) => { const id = event.target.value as UnitId; setAttackUnit(id); setAttackCount(Math.min(id === 'rifle' ? 64 : 10, snapshot.game.units[id] || 1)); }}>{UNITS.filter((unit) => game.units[unit.id] > 0).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {game.units[unit.id]}</option>)}</select></label><label className="attack-count-field"><span>ЧИСЛО</span><div><button onClick={() => setAttackCount(Math.max(1, attackCount - 1))}><Minus size={12} /></button><input value={attackCount} inputMode="numeric" onChange={(event) => setAttackCount(Math.max(1, Math.min(maxCount || 1, Number(event.target.value) || 1)))} /><button onClick={() => setAttackCount(Math.min(maxCount || 1, attackCount + 1))}><Plus size={12} /></button></div></label></div>
              <label className="attack-direction-field"><span>НАПРАВЛЕНИЕ УДАРА</span><select value={attackDirection} onChange={(event) => setAttackDirection(event.target.value as AttackDirection)}><option value="frontal">Прямой прорыв · сбалансированно</option><option value="north">Северный обход · меньше потерь, −4% атаки</option><option value="flank">Фланговый удар · +12% атаки, риск выше</option></select></label>
              <button className="button button-danger button-full" disabled={!canAttack || !maxCount || pending === 'attack'} onClick={() => execute('attack', { targetId: selectedTarget.id, unit: attackUnit, count: suitableCount, direction: attackDirection }, `Ударная группа выдвинулась к объекту «${selectedTarget.name}».`)}><Swords size={16} /> Начать атаку <ArrowRight size={14} /></button>
              {selectedTarget.ownerUserId && !selectedTarget.isOwn && <small className="pvp-note">PvP-рейд · исходный прогресс защитника сохраняется</small>}
            </div>
          </section>
          <section className="panel map-intel-brief"><div className="panel-topline"><span>СВОДКА СЕКТОРА</span><Activity size={14} /></div><div className="brief-line"><span>ЦЕЛЬ</span><b>{selectedTarget.kind === 'resource' ? 'РЕСУРСНЫЙ УЗЕЛ' : selectedTarget.kind === 'base' ? 'ВОЕННАЯ БАЗА' : selectedTarget.kind === 'city' ? 'ГОРОД' : 'ОБЪЕКТ'}</b></div><div className="brief-line"><span>ОТКРЫТЫХ РУБЕЖЕЙ</span><b>{snapshot.world.filter((node) => !node.isOwn && !node.isCaptured).length}</b></div><div className="brief-line"><span>ВАШИ ТЕРРИТОРИИ</span><b>{game.stats.territoryCount}</b></div></section>
        </div>
      </div>
    </div>
  );
}

function ArmyScreen({ snapshot, now, execute, pending, onOpenWorld }: { snapshot: GameSnapshot; now: number; execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null; onOpenWorld: () => void }) {
  const [selectedUnit, setSelectedUnit] = useState<UnitId>('rifle');
  const [count, setCount] = useState(20);
  const game = snapshot.game;
  const selected = UNIT_BY_ID[selectedUnit];
  const countSafe = Math.max(1, Math.min(100, count));
  const costs = scaledCost(selected.cost, countSafe);
  const locked = game.buildings[selected.building] < selected.buildingLevel || (selected.requirement ? game.technologies[selected.requirement] < 1 : false);
  const unaffordable = RESOURCE_KEYS.some((key) => game.resources[key] < (costs[key] || 0));
  const total = Object.values(game.units).reduce((sum, value) => sum + value, 0);
  const queued = game.trainingQueue.reduce((sum, job) => sum + job.count, 0);
  const currentJobs = game.trainingQueue.slice().sort((a, b) => a.finishAt - b.finishAt);
  const affordabilityLimit = Math.min(100, ...RESOURCE_KEYS.filter((key) => (selected.cost[key] || 0) > 0).map((key) => Math.floor(game.resources[key] / (selected.cost[key] || 1))));
  const Icon = UNIT_ICONS[selectedUnit];
  return (
    <div className="army-screen screen-enter">
      <div className="army-banner">
        <div className="army-banner-copy"><span className="eyebrow"><span className="eyebrow-mark" /> ШТАБНАЯ СВОДКА · СОЕДИНЕНИЕ 09</span><h2>Готовность сил <em>не имеет потолка.</em></h2><p>Соберите отряд под задачу: быстрый налёт, оборона узла или тяжёлый прорыв.</p><button className="button button-brass button-small" onClick={onOpenWorld}><MapPin size={14} /> Выбрать цель на карте</button></div>
        <div className="army-banner-insignia"><div><span>09</span><small>FIELD<br />FORCE</small></div><i /></div>
        <div className="army-banner-bottom"><span><Swords size={13} /> МОЩЬ ГАРНИЗОНА <b>{formatNumber(totalArmyPower(game), true)}</b></span><span>ПОДРАЗДЕЛЕНИЙ <b>{formatNumber(total)}</b></span><span>В ОЧЕРЕДИ <b>{formatNumber(queued)}</b></span></div>
      </div>

      <div className="army-layout">
        <div className="army-roster-column">
          <div className="section-mini-heading"><div><span className="eyebrow">КАТАЛОГ СОЕДИНЕНИЙ</span><h2>Подразделения <em>гарнизона</em></h2></div><span className="unit-total-badge">{UNITS.length} ТИПОВ</span></div>
          {['Пехота', 'Бронетехника', 'Артиллерия', 'Авиация'].map((branch) => (
            <div className="unit-branch" key={branch}>
              <div className="branch-heading"><span>{branch}</span><i />{UNITS.filter((unit) => unit.branch === branch).length} КЛАССА</div>
              <div className="unit-card-grid">{UNITS.filter((unit) => unit.branch === branch).map((unit) => {
                const UnitIcon = UNIT_ICONS[unit.id];
                const isLocked = game.buildings[unit.building] < unit.buildingLevel || (unit.requirement ? game.technologies[unit.requirement] < 1 : false);
                return <button key={unit.id} className={`unit-card ${selectedUnit === unit.id ? 'unit-card-selected' : ''} ${isLocked ? 'unit-card-locked' : ''}`} onClick={() => { setSelectedUnit(unit.id); setCount(Math.min(20, Math.max(1, game.units[unit.id] || 20))); }}>
                  <span className="unit-card-art"><UnitIcon size={21} /><i>{String(unit.attack).padStart(2, '0')}</i></span><span className="unit-card-info"><small>{unit.branch.toUpperCase()}</small><b>{unit.name}</b><em>АТК {unit.attack} <i /> ЗАЩ {unit.defense}</em></span><span className="unit-card-count"><b>{formatNumber(game.units[unit.id])}</b><small>В ГАРНИЗОНЕ</small></span>
                  {isLocked && <span className="unit-lock"><LockKeyhole size={11} /> ЗАКРЫТО</span>}
                </button>;
              })}</div>
            </div>
          ))}
          {currentJobs.length > 0 && <div className="panel training-queue-panel"><div className="panel-topline"><span>ПОДГОТОВКА В РАБОТЕ</span><span className="tiny-count">{currentJobs.length.toString().padStart(2, '0')}</span></div>{currentJobs.map((job) => {
            const remaining = job.finishAt - now;
            return <div className="training-job-row" key={job.id}><span className="queue-icon"><Swords size={15} /></span><div><b>{job.count} × {UNIT_BY_ID[job.unit].name}</b><small>Гарнизон · {remaining <= 0 ? 'готово к построению' : formatTimer(remaining)}</small></div><button className="button button-quiet button-micro" disabled={pending === 'speedup'} onClick={() => execute('speedup', { jobId: job.id }, 'Подготовка завершена ускоренно.')}><Zap size={12} /> Ускорить</button></div>;
          })}</div>}
        </div>

        <aside className="panel production-panel">
          <div className="panel-topline"><span>ЗАКАЗ В ПРОИЗВОДСТВО</span><span className="micro-code">ARMY / 04</span></div>
          <div className="production-unit-hero"><div className="production-unit-icon"><Icon size={27} /></div><span>{selected.branch.toUpperCase()}</span><h2>{selected.name}</h2><p>{selected.description}</p></div>
          <div className="unit-combat-stats"><div><small>АТАКА</small><b>{selected.attack}</b></div><div><small>ЗАЩИТА</small><b>{selected.defense}</b></div><div><small>ЗДОРОВЬЕ</small><b>{selected.health}</b></div><div><small>СКОРОСТЬ</small><b>{selected.speed.toFixed(1)}<em> км/ч</em></b></div></div>
          <div className="production-held"><span>СЕЙЧАС В ГАРНИЗОНЕ</span><b>{formatNumber(game.units[selectedUnit])} <small>ЕД.</small></b></div>
          <div className="quantity-select"><span>КОЛИЧЕСТВО</span><div><button onClick={() => setCount(Math.max(1, countSafe - 5))}><Minus size={14} /></button><input value={countSafe} inputMode="numeric" onChange={(event) => setCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /><button onClick={() => setCount(Math.min(100, countSafe + 5))}><Plus size={14} /></button><button className="max-quantity" onClick={() => setCount(Math.max(1, affordabilityLimit))}>MAX</button></div></div>
          <div className="production-cost"><span>СТОИМОСТЬ ПАКЕТА</span><ResourceCost cost={costs} compact /></div>
          <div className="production-time"><span><Clock3 size={13} /> ВРЕМЯ ПОДГОТОВКИ</span><b>{formatTimer(Math.min(70, Math.max(4, Math.ceil(selected.seconds * Math.sqrt(countSafe) + countSafe * 0.16))) * 1000)}</b></div>
          {locked && <div className="unlock-message"><LockKeyhole size={14} /><span>Требуется {BUILDING_BY_ID[selected.building].name} {selected.buildingLevel} уровня{selected.requirement ? ` и технология «${TECH_BY_ID[selected.requirement].name}»` : ''}.</span></div>}
          {unaffordable && !locked && <div className="unlock-message"><AlertTriangle size={14} /><span>Не хватает ресурсов для выбранного количества.</span></div>}
          <button className="button button-brass button-full production-button" disabled={locked || unaffordable || pending === 'train'} onClick={() => execute('train', { unit: selectedUnit, count: countSafe }, `${countSafe} × ${selected.name}: заказ принят.`)}><Factory size={15} /> Запустить производство <ArrowRight size={14} /></button>
          <div className="production-footer"><ShieldCheck size={13} /> РАСХОД РЕСУРСОВ СПИСЫВАЕТСЯ СРАЗУ</div>
        </aside>
      </div>
    </div>
  );
}

function ResearchScreen({ snapshot, now, execute, pending }: { snapshot: GameSnapshot; now: number; execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null }) {
  const game = snapshot.game;
  const active = game.researchJob;
  const groupNames = ['Военная промышленность', 'Пехота', 'Бронетехника', 'Авиация', 'Экономика', 'Оборона', 'Связь'];
  const researchLevel = Object.values(game.technologies).reduce((sum, level) => sum + level, 0);
  return (
    <div className="research-screen screen-enter">
      <div className="research-banner">
        <div><span className="eyebrow"><span className="eyebrow-mark" /> ПРИОРИТЕТЫ РАЗВИТИЯ</span><h2>Завтра начинается <em>в лаборатории.</em></h2><p>Каждое исследование меняет подход к войне. Выберите направление, которое нужно вашему сектору сейчас.</p></div>
        <div className="research-banner-stat"><span><Microscope size={18} /> ИЗУЧЕНО ТЕХНОЛОГИЙ</span><b>{String(researchLevel).padStart(2, '0')}<small> / 21</small></b><div className="research-stat-track"><i style={{ width: `${Math.min(100, researchLevel / 21 * 100)}%` }} /></div></div>
      </div>
      {active && <div className="active-research-bar"><span className="active-research-icon"><Microscope size={18} /></span><div><small>В РАБОТЕ · НАУЧНЫЙ КОРПУС</small><b>{TECH_BY_ID[active.technology].name} · уровень {game.technologies[active.technology] + 1}</b></div><div className="active-research-time"><Clock3 size={14} />{formatTimer(active.finishAt - now)}</div><button className="button button-quiet button-small" disabled={pending === 'speedup'} onClick={() => execute('speedup', { jobId: active.id }, 'Исследование завершено ускоренно.')}><Zap size={13} /> Ускорить</button></div>}
      <div className="tech-tree-grid">
        {groupNames.map((branch, index) => {
          const tech = TECHNOLOGIES[index];
          const level = game.technologies[tech.id];
          const isActive = active?.technology === tech.id;
          const locked = Boolean(tech.prerequisite && game.technologies[tech.prerequisite] < 1) || level >= 3;
          const cost = scaledCost(tech.cost, Math.pow(1.45, level));
          const unavailable = RESOURCE_KEYS.some((key) => game.resources[key] < (cost[key] || 0));
          const icon = index === 0 ? <Factory size={19} /> : index === 1 ? <Target size={19} /> : index === 2 ? <Shield size={19} /> : index === 3 ? <Plane size={19} /> : index === 4 ? <TrendingUp size={19} /> : index === 5 ? <ShieldCheck size={19} /> : <RadioTower size={19} />;
          return <article className={`panel tech-card ${isActive ? 'tech-card-active' : ''} ${level > 0 ? 'tech-card-studied' : ''}`} key={tech.id}>
            <div className="tech-card-top"><span className={`tech-icon tech-color-${index}`}>{icon}</span><span className="tech-branch">{branch.toUpperCase()}</span><span className="tech-level">{level >= 3 ? 'MAX' : `УР. ${level}/${3}`}</span></div>
            <h3>{tech.name}</h3><p>{tech.description}</p><div className="tech-effect"><Sparkles size={13} /><span>{tech.effect}</span></div>
            <div className="tech-card-footer"><div><small>СТОИМОСТЬ · {Math.ceil(tech.seconds * Math.pow(1.42, level))} СЕК</small><ResourceCost cost={cost} compact /></div><button className={`button ${isActive ? 'button-working' : 'button-quiet'} button-small`} disabled={locked || unavailable || Boolean(active) || pending === 'research'} onClick={() => execute('research', { technology: tech.id }, `Исследование «${tech.name}» начато.`)}>{isActive ? <><RefreshCw size={13} className="spin" /> В работе</> : level >= 3 ? <><Check size={14} /> Завершено</> : locked ? <><LockKeyhole size={13} /> Закрыто</> : <><Microscope size={13} /> Изучить</>}</button></div>
            {locked && level < 3 && <small className="tech-lock-note"><LockKeyhole size={11} /> Требование: {tech.prerequisite ? TECH_BY_ID[tech.prerequisite].name : 'доступно'}</small>}
          </article>;
        })}
      </div>
      <div className="research-footnote"><Info size={14} /><span>Изученные технологии действуют на весь аккаунт и улучшают соответствующие войска и добычу ресурсов. Исследования сохраняются на сервере.</span></div>
    </div>
  );
}

function MarketScreen({ snapshot, execute, pending }: { snapshot: GameSnapshot; execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null }) {
  const [selectedDeal, setSelectedDeal] = useState(MARKET_DEALS[0].id);
  const [lots, setLots] = useState(1);
  const [view, setView] = useState<'contracts' | 'history'>('contracts');
  const deal = MARKET_DEALS.find((item) => item.id === selectedDeal) || MARKET_DEALS[0];
  const enough = snapshot.game.resources[deal.from] >= deal.fromAmount * lots;
  return (
    <div className="market-screen screen-enter">
      <div className="market-intro-banner"><div><span className="eyebrow"><span className="eyebrow-mark" /> ТОРГОВЫЙ УЗЕЛ · ПРИЁМ ЗАЯВОК ОТКРЫТ</span><h2>Ресурсы должны <em>двигаться.</em></h2><p>Фиксированные контракты консорциума — простой старт рынка. Обмен проходит мгновенно, комиссии скрыты в котировке.</p></div><div className="market-seal"><ShoppingBag size={26} /><span>NSC</span><small>TRADE / 04</small></div></div>
      <div className="market-tabs"><button className={view === 'contracts' ? 'tab-active' : ''} onClick={() => setView('contracts')}><ArrowRight size={14} /> КОНТРАКТЫ КОНСОРЦИУМА</button><button className={view === 'history' ? 'tab-active' : ''} onClick={() => setView('history')}><Clock3 size={14} /> ИСТОРИЯ ОБМЕНОВ <span>{snapshot.game.marketHistory.length}</span></button></div>
      {view === 'contracts' ? <div className="market-layout">
        <div className="contract-list">{MARKET_DEALS.map((item, index) => {
          const FromIcon = RESOURCE_ICONS[item.from]; const ToIcon = RESOURCE_ICONS[item.to];
          return <button className={`contract-row ${selectedDeal === item.id ? 'contract-row-active' : ''}`} onClick={() => { setSelectedDeal(item.id); setLots(1); }} key={item.id}><span className={`contract-glyph contract-glyph-${item.from}`}><FromIcon size={16} /></span><span className="contract-copy"><b>{item.label}</b><small>{item.note}</small></span><span className="contract-rate"><b>{formatNumber(item.fromAmount)}</b><ArrowRight size={13} /><b>{formatNumber(item.toAmount)}</b></span><span className="contract-resources"><i>{RESOURCE_META[item.from].mark}</i><ArrowRight size={12} /><i>{RESOURCE_META[item.to].mark}</i></span><span className="contract-index">0{index + 1}</span></button>;
        })}</div>
        <section className="panel market-exchange-panel"><div className="panel-topline"><span>ПОДТВЕРЖДЕНИЕ ОБМЕНА</span><span className="live-map"><i /> КОТИРОВКА</span></div><div className="exchange-heading"><span>КОНТРАКТ</span><h2>{deal.label}</h2><p>{deal.note}</p></div><div className="exchange-flow"><div className={`exchange-resource exchange-${deal.from}`}><span>ОТДАЁТЕ</span><div><i>{RESOURCE_META[deal.from].mark}</i><b>{formatNumber(deal.fromAmount * lots, true)}</b></div><small>{RESOURCE_META[deal.from].label}</small></div><div className="exchange-arrow"><ArrowRight size={19} /><small>1: {deal.toAmount / deal.fromAmount}</small></div><div className={`exchange-resource exchange-${deal.to}`}><span>ПОЛУЧАЕТЕ</span><div><i>{RESOURCE_META[deal.to].mark}</i><b>{formatNumber(deal.toAmount * lots, true)}</b></div><small>{RESOURCE_META[deal.to].label}</small></div></div><div className="market-lot-row"><span>КОЛИЧЕСТВО ПАКЕТОВ</span><div><button onClick={() => setLots(Math.max(1, lots - 1))}><Minus size={13} /></button><input value={lots} inputMode="numeric" onChange={(event) => setLots(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /><button onClick={() => setLots(Math.min(8, lots + 1))}><Plus size={13} /></button></div><small>ЛИМИТ 8</small></div>{!enough && <div className="market-insufficient"><AlertTriangle size={13} /> На складе недостаточно {RESOURCE_META[deal.from].label.toLowerCase()}.</div>}<button className="button button-brass button-full exchange-submit" disabled={!enough || pending === 'trade'} onClick={() => execute('trade', { dealId: deal.id, lots }, 'Контракт исполнен. Ресурсы перемещены.')}><ArrowDownLeft size={15} /> Провести обмен <ArrowRight size={14} /></button><div className="exchange-protection"><ShieldCheck size={13} /> Мгновенный обмен · комиссия учтена в курсе</div></section>
      </div> : <div className="panel market-history-panel"><div className="panel-topline"><span>ЛИЧНЫЙ ЖУРНАЛ СДЕЛОК</span><span className="tiny-count">{snapshot.game.marketHistory.length.toString().padStart(2, '0')}</span></div>{snapshot.game.marketHistory.length === 0 ? <EmptyState icon={<ShoppingCart size={22} />} title="Сделок пока нет" text="Проведите первый обмен через контракты консорциума." /> : <div className="market-history-list">{snapshot.game.marketHistory.map((trade) => <div className="market-history-row" key={trade.id}><span className="history-trade-icon"><ArrowRight size={15} /></span><div><b>{formatNumber(trade.amount)} {RESOURCE_META[trade.from].label} <ArrowRight size={12} /> {formatNumber(trade.received)} {RESOURCE_META[trade.to].label}</b><small>{new Date(trade.createdAt).toLocaleString('ru-RU')}</small></div><Chip tone="green">ИСПОЛНЕНО</Chip></div>)}</div>}</div>}
      <div className="market-note"><Info size={14} /><span>Рынок использует фиксированные NPC-контракты. Архитектура уже хранит сделки в серверной базе, а торговля между игроками может быть подключена без изменения интерфейса.</span></div>
    </div>
  );
}

function AllianceScreen({ snapshot, execute, pending }: { snapshot: GameSnapshot; execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null }) {
  const [allianceName, setAllianceName] = useState('Северный дозор');
  const [message, setMessage] = useState('');
  const [targetAlliance, setTargetAlliance] = useState('');
  const [diplomacyStatus, setDiplomacyStatus] = useState('Мир');
  const alliance = snapshot.playerAlliance;
  const messages = snapshot.allianceMessages;
  const diplomacyTargets = snapshot.alliances.filter((item) => item.id !== alliance?.id);
  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    void execute('alliance', { allianceAction: 'message', message: message.trim() }, 'Сообщение передано по внутреннему каналу.');
    setMessage('');
  };
  return (
    <div className="alliance-screen screen-enter">
      {alliance ? <>
        <div className="alliance-hero"><div className="alliance-hero-emblem"><span>{alliance.tag.slice(0, 2)}</span><i /></div><div className="alliance-hero-copy"><span className="eyebrow"><span className="eyebrow-mark" /> АКТИВНЫЙ СОЮЗ · [{alliance.tag}]</span><h2>{alliance.name}</h2><p>{alliance.description}</p></div><div className="alliance-hero-stats"><div><small>УЧАСТНИКИ</small><b>{formatNumber(alliance.memberCount)}</b></div><div><small>РЕЙТИНГ</small><b>{formatNumber(alliance.rating, true)}</b></div><div><small>ТЕРРИТОРИИ</small><b>{alliance.territories}</b></div></div></div>
        <div className="alliance-workspace">
          <section className="panel alliance-chat-panel"><div className="panel-topline"><span>ВНУТРЕННИЙ КАНАЛ</span><span className="live-map"><i /> ЗАЩИЩЁННАЯ ЛИНИЯ</span></div><div className="alliance-chat-head"><MessageSquare size={16} /><div><b>Чат командования</b><small>{alliance.memberCount} участников · общий канал</small></div><span className="chat-online">● LIVE</span></div><div className="chat-messages">{messages.length ? messages.map((item) => <div className="chat-message" key={item.id}><span className="chat-avatar">{item.username.slice(0, 1).toUpperCase()}</span><div><div className="chat-message-meta"><b>{item.username}</b><Chip tone={item.role === 'Командир' ? 'gold' : 'muted'}>{item.role}</Chip><time>{new Date(item.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{item.message}</p></div></div>) : <EmptyState icon={<MessageSquare size={20} />} title="Канал ждёт первого приказа" text="Станьте первым, кто передаст сообщение союзу." />}</div><form className="chat-input-row" onSubmit={sendMessage}><input value={message} maxLength={240} onChange={(event) => setMessage(event.target.value)} placeholder="Передать сообщение альянсу…" /><button className="button button-brass button-small" disabled={!message.trim() || pending === 'alliance'}><Send size={14} /> Отправить</button></form></section>
          <div className="alliance-side-column"><section className="panel alliance-diplomacy"><div className="panel-topline"><span>ДИПЛОМАТИЯ</span><span className="mini-code">N-04 / PACT</span></div><p>Выберите статус отношений с другим союзом.</p><label className="form-field"><span>ЦЕЛЬ ДИПЛОМАТИИ</span><select value={targetAlliance} onChange={(event) => setTargetAlliance(event.target.value)}><option value="">Выберите альянс…</option>{diplomacyTargets.map((item) => <option key={item.id} value={item.id}>[{item.tag}] {item.name}</option>)}</select></label><label className="form-field"><span>НОВЫЙ СТАТУС</span><select value={diplomacyStatus} onChange={(event) => setDiplomacyStatus(event.target.value)}>{['Мир', 'Союз', 'Нейтралитет', 'Война'].map((status) => <option key={status}>{status}</option>)}</select></label><button className="button button-quiet button-full" disabled={!targetAlliance || alliance.relation !== 'Командир' || pending === 'alliance'} onClick={() => execute('alliance', { allianceAction: 'diplomacy', allianceId: targetAlliance, status: diplomacyStatus }, `Дипломатический статус изменён: ${diplomacyStatus}.`)}><Flag size={14} /> Объявить статус</button>{alliance.relation !== 'Командир' && <small className="role-note">Право дипломатии доступно командиру союза.</small>}<div className="relation-legend"><span><i className="relation-peace" /> МИР</span><span><i className="relation-allied" /> СОЮЗ</span><span><i className="relation-war" /> ВОЙНА</span></div></section><section className="panel alliance-roster"><div className="panel-topline"><span>ВАША РОЛЬ</span><UserRound size={14} /></div><div className="alliance-member-item"><span className="member-avatar">{snapshot.user.username.slice(0, 1).toUpperCase()}</span><div><b>{snapshot.user.username}</b><small>Вы · {alliance.relation}</small></div><BadgeCheck size={16} /></div><div className="alliance-roster-foot"><span><Users size={13} /> Участников онлайн</span><b>24</b></div><button className="button button-danger-outline button-full" onClick={() => execute('alliance', { allianceAction: 'leave' }, 'Вы покинули дипломатический корпус.')} disabled={pending === 'alliance'}>Покинуть альянс</button></section></div>
        </div>
      </> : <>
        <div className="alliance-intro-banner"><span className="alliance-intro-icon"><Users size={23} /></span><div><span className="eyebrow"><span className="eyebrow-mark" /> ДИПЛОМАТИЯ · СОЮЗЫ СЕКТОРА</span><h2>В одиночку далеко <em>не уйти.</em></h2><p>Найдите союзников, чтобы удерживать территории и вместе отвечать на угрозы.</p></div></div>
        <div className="alliance-directory"><section className="alliance-directory-main"><div className="directory-head"><div><span className="eyebrow">ОТКРЫТЫЕ СОЮЗЫ</span><h2>Альянсы <em>сектора</em></h2></div><span>{snapshot.alliances.length} АКТИВНЫХ</span></div><div className="alliance-list">{snapshot.alliances.map((item) => <AllianceListRow key={item.id} alliance={item} pending={pending === 'alliance'} onJoin={() => execute('alliance', { allianceAction: 'join', allianceId: item.id }, `Вы вступили в альянс «${item.name}».`)} />)}</div></section><aside className="panel alliance-create-panel"><div className="panel-topline"><span>НОВОЕ ОБЪЕДИНЕНИЕ</span><Plus size={14} /></div><div className="create-alliance-art"><div><Shield size={24} /><i /></div><span>НАЧНИТЕ СВОЙ СОЮЗ</span></div><p>Создайте альянс, назначьте теги и формируйте собственную дипломатическую сеть.</p><label className="form-field"><span>НАЗВАНИЕ АЛЬЯНСА</span><input maxLength={28} value={allianceName} onChange={(event) => setAllianceName(event.target.value)} /></label><button className="button button-brass button-full" disabled={allianceName.trim().length < 3 || pending === 'alliance'} onClick={() => execute('alliance', { allianceAction: 'create', name: allianceName }, `Альянс «${allianceName}» создан.`)}><Plus size={14} /> Создать альянс</button><small className="alliance-create-note">Создание бесплатно · дипломатия доступна командиру</small></aside></div>
      </>}
      <div className="alliance-footnote"><Info size={14} /><span>Альянсы, участники, чат и дипломатические отношения сохраняются на сервере и общие для всех игровых аккаунтов.</span></div>
    </div>
  );
}

function AllianceListRow({ alliance, pending, onJoin }: { alliance: AllianceInfo; pending: boolean; onJoin: () => void }) {
  return <div className="alliance-list-row"><div className="alliance-list-badge">{alliance.tag.slice(0, 2)}</div><div className="alliance-list-copy"><b>{alliance.name} <small>[{alliance.tag}]</small></b><p>{alliance.description}</p><div><span><Users size={12} /> {formatNumber(alliance.memberCount)} бойцов</span><span><Flag size={12} /> {alliance.territories} территорий</span><span><Trophy size={12} /> {formatNumber(alliance.rating, true)}</span></div></div><div className="alliance-list-action">{alliance.isMember ? <Chip tone="green">ВАШ СОЮЗ</Chip> : <button className="button button-quiet button-small" disabled={pending} onClick={onJoin}><Plus size={13} /> Вступить</button>}<small>ЛИДЕР · {alliance.leader}</small></div></div>;
}

function InventoryScreen({ snapshot, execute, pending }: { snapshot: GameSnapshot; execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null }) {
  const [filter, setFilter] = useState('Все');
  const categories = ['Все', 'Оборудование', 'Декор', 'Особые', 'Коллекционные'];
  const items = snapshot.game.inventory.filter((item) => filter === 'Все' || item.category === filter);
  const rarityCount = snapshot.game.inventory.filter((item) => item.rarity === 'Редкий' || item.rarity === 'Эпический' || item.rarity === 'Легендарный').length;
  return (
    <div className="inventory-screen screen-enter"><div className="inventory-banner"><div><span className="eyebrow"><span className="eyebrow-mark" /> ЛИЧНОЕ ХРАНИЛИЩЕ · СОБСТВЕННОСТЬ КОМАНДИРА</span><h2>История вещей — <em>история побед.</em></h2><p>Косметика и коллекции не дают боевого преимущества. Игровой прогресс не зависит от Web3-покупок.</p></div><div className="inventory-count"><b>{String(snapshot.game.inventory.length).padStart(2, '0')}</b><span>ПРЕДМЕТА</span><small>{rarityCount} редких находки</small></div></div>
      <div className="inventory-toolbar"><div className="inventory-filters">{categories.map((category) => <button key={category} className={filter === category ? 'filter-active' : ''} onClick={() => setFilter(category)}>{category}</button>)}</div><span><ShieldCheck size={13} /> {snapshot.game.inventory.filter((item) => item.equipped).length} ЭКИПИРОВАНО</span></div>
      {items.length === 0 ? <EmptyState icon={<Package size={22} />} title="В этой категории пусто" text="Новые предметы будут появляться по мере выполнения операций." /> : <div className="inventory-grid">{items.map((item) => <InventoryCard key={item.id} item={item} onEquip={() => execute('equip', { itemId: item.id }, item.equipped ? 'Предмет убран из экипировки.' : 'Предмет экипирован.')} pending={pending === 'equip'} />)}</div>}
      <div className="inventory-web3-note"><span><Wallet size={17} /></span><div><b>Предметы готовы к будущему Web3-слою</b><p>В прототипе все предметы хранятся в серверном инвентаре. Подключение кошелька будет опциональным, коллекционные предметы останутся косметическими.</p></div><Chip tone="gold">EVM-READY</Chip></div>
    </div>
  );
}

function InventoryCard({ item, onEquip, pending }: { item: InventoryItem; onEquip: () => void; pending: boolean }) {
  return <article className={`panel inventory-card ${tierClass(item.rarity)}`}><div className="inventory-art"><span>{item.icon}</span><div className="inventory-card-corner">N-09</div><i /></div><div className="inventory-card-copy"><div className="inventory-card-top"><Chip tone={item.rarity === 'Легендарный' || item.rarity === 'Эпический' ? 'gold' : item.rarity === 'Редкий' ? 'blue' : 'muted'}>{item.rarity}</Chip><small>{item.category}</small></div><h3>{item.name}</h3><p>{item.description}</p><div className="inventory-bonus"><Sparkles size={12} />{item.bonus}</div><button className={`button ${item.equipped ? 'button-working' : 'button-quiet'} button-small button-full`} disabled={pending} onClick={onEquip}>{item.equipped ? <><Check size={14} /> Экипировано · убрать</> : <>Экипировать <ArrowRight size={13} /></>}</button></div></article>;
}

function RankingsScreen({ snapshot }: { snapshot: GameSnapshot }) {
  const [rankingType, setRankingType] = useState<'overall' | 'army' | 'territories' | 'victories' | 'wealth'>('overall');
  const tabs: { id: typeof rankingType; label: string; Icon: LucideIcon }[] = [
    { id: 'overall', label: 'Общая мощь', Icon: BarChart3 }, { id: 'army', label: 'Военная мощь', Icon: Swords },
    { id: 'territories', label: 'Территории', Icon: Flag }, { id: 'victories', label: 'Победы', Icon: Trophy }, { id: 'wealth', label: 'Богатство', Icon: Coins },
  ];
  const entries = snapshot.rankings[rankingType] || [];
  const allianceRanks = snapshot.alliances.slice().sort((a, b) => b.rating - a.rating);
  return (
    <div className="rankings-screen screen-enter"><div className="ranking-hero"><div><span className="eyebrow"><span className="eyebrow-mark" /> РЕЕСТР КОМАНДУЮЩИХ · СЕКТОР N-04</span><h2>Кто удержит <em>рубеж?</em></h2><p>Рейтинг складывается из реального состояния аккаунтов и обновляется вместе с игровыми действиями.</p></div><div className="ranking-hero-number"><Trophy size={18} /><span>ВАША ПОЗИЦИЯ</span><b>#{entries.find((item) => item.isSelf)?.rank || '—'}</b></div></div>
      <div className="ranking-tabs">{tabs.map(({ id, label, Icon }) => <button className={rankingType === id ? 'ranking-tab-active' : ''} key={id} onClick={() => setRankingType(id)}><Icon size={15} />{label}</button>)}</div>
      <div className="ranking-layout"><section className="panel rankings-table-panel"><div className="ranking-table-top"><div><span className="eyebrow">ТАБЛИЦА ЛИДЕРОВ</span><h2>{tabs.find((item) => item.id === rankingType)?.label}</h2></div><span className="tiny-count">{entries.length.toString().padStart(2, '0')} КОМАНДИРОВ</span></div><div className="ranking-table-scroll"><table className="rank-table"><thead><tr><th>МЕСТО</th><th>КОМАНДИР</th><th>УР.</th><th>{rankingType === 'army' ? 'МОЩЬ' : rankingType === 'territories' ? 'ТЕРРИТОРИИ' : rankingType === 'victories' ? 'ПОБЕДЫ' : rankingType === 'wealth' ? 'РЕСУРСЫ' : 'РЕЙТИНГ'}</th><th>АЛЬЯНС</th></tr></thead><tbody>{entries.map((entry) => <RankingRow entry={entry} type={rankingType} key={`${entry.username}-${entry.rank}`} />)}</tbody></table></div><div className="ranking-table-foot"><span><span className="signal-dot" /> ДАННЫЕ СИНХРОНИЗИРОВАНЫ</span><span>СЕЗОН 01 · СЕКТОР N-04</span></div></section><aside className="ranking-side"><section className="panel ranking-alliance-panel"><div className="panel-topline"><span>СИЛА АЛЬЯНСОВ</span><ShieldCheck size={14} /></div>{allianceRanks.slice(0, 4).map((alliance, index) => <div className="alliance-rank-row" key={alliance.id}><span className={`rank-number rank-number-${index + 1}`}>0{index + 1}</span><div className="alliance-rank-emblem">{alliance.tag.slice(0, 2)}</div><div><b>{alliance.name}</b><small>[{alliance.tag}] · {alliance.memberCount} бойцов</small></div><strong>{formatNumber(alliance.rating, true)}</strong></div>)}</section><section className="ranking-tip"><Sparkles size={15} /><div><b>Полевой совет</b><p>Захват территорий и победы повышают рейтинг командира. Союз ускоряет накопление влияния.</p></div></section></aside></div>
    </div>
  );
}

function RankingRow({ entry, type }: { entry: RankingEntry; type: 'overall' | 'army' | 'territories' | 'victories' | 'wealth' }) {
  const value = type === 'army' ? formatNumber(entry.armyPower, true) : type === 'territories' ? formatNumber(entry.territories) : type === 'victories' ? formatNumber(entry.wins) : type === 'wealth' ? formatNumber(entry.wealth, true) : formatNumber(entry.rating);
  return <tr className={`${entry.isSelf ? 'self-rank-row' : ''} ${entry.rank <= 3 ? `podium-row podium-${entry.rank}` : ''}`}><td><span className={`rank-badge rank-${entry.rank <= 3 ? entry.rank : 'other'}`}>{entry.rank <= 3 ? <Trophy size={13} /> : String(entry.rank).padStart(2, '0')}</span></td><td><span className="rank-player-avatar">{entry.username.slice(0, 1).toUpperCase()}</span><span className="rank-player-name"><b>{entry.username}</b>{entry.isSelf && <small>ВАШ ПРОФИЛЬ</small>}</span></td><td><span className="rank-level">{String(entry.level).padStart(2, '0')}</span></td><td><b className="rank-value">{value}</b></td><td>{entry.alliance === '—' ? <span className="empty-alliance">—</span> : <span className="rank-alliance-tag">{entry.alliance}</span>}</td></tr>;
}

function MissionsScreen({ snapshot, execute, pending, missionDone }: { snapshot: GameSnapshot; execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null; missionDone: (id: string, game: GameState) => boolean }) {
  const game = snapshot.game;
  const finished = MISSIONS.filter((item) => item.category === 'Ежедневная' ? (game.dailyClaims || []).includes(item.id) : game.claimedMissions.includes(item.id)).length;
  return (
    <div className="missions-screen screen-enter"><div className="missions-banner"><div><span className="eyebrow"><span className="eyebrow-mark" /> ПОЛЕВОЕ ДЕЛО · ПРИКАЗЫ КОМАНДОВАНИЯ</span><h2>Каждый день — <em>новая задача.</em></h2><p>Оперативные цели помогают освоиться в секторе и дают дополнительные запасы для развития.</p></div><div className="missions-banner-progress"><div className="mission-circular-progress" style={{ background: `conic-gradient(var(--brass) ${finished / MISSIONS.length * 360}deg, rgba(255,255,255,.09) 0)` }}><span>{String(finished).padStart(2, '0')}<small>/{MISSIONS.length}</small></span></div><span>ЗАВЕРШЕНО<br /><b>ПОРУЧЕНИЙ</b></span></div></div>
      <div className="mission-section-heading"><div><span className="eyebrow">АКТИВНЫЕ ЗАДАНИЯ</span><h2>Оперативный <em>план</em></h2></div><span className="mission-refresh-label"><RefreshCw size={12} /> ОБНОВЛЕНО С СЕРВЕРОМ</span></div>
      <div className="missions-list">{MISSIONS.map((mission, index) => {
        const complete = missionDone(mission.id, game);
        const claimed = mission.category === 'Ежедневная' ? (game.dailyClaims || []).includes(mission.id) : game.claimedMissions.includes(mission.id);
        const percent = claimed ? 100 : complete ? 100 : missionProgressPercent(mission.id, game);
        return <MissionCard key={mission.id} mission={mission} index={index} progress={percent} complete={complete} claimed={claimed} pending={pending === 'claimMission'} onClaim={() => execute('claimMission', { missionId: mission.id }, `Награда «${mission.name}» получена.`)} />;
      })}</div>
      <div className="mission-footnote"><Info size={14} /><span>Награда за каждое задание выдаётся один раз. Прогресс хранится на сервере, даже если закрыть браузер.</span></div>
    </div>
  );
}

function missionProgressPercent(id: string, game: GameState): number {
  if (id === 'hq_2') return game.buildings.hq >= 2 ? 100 : 38;
  if (id === 'train_100') return Math.min(100, Math.floor(game.stats.unitsProduced));
  if (id === 'research_1') return Object.values(game.technologies).some((level) => level > 0) ? 100 : 0;
  if (id === 'scout_1') return (game.dailyScouts || 0) > 0 ? 100 : 0;
  if (id === 'victory_1') return game.stats.wins > 0 ? 100 : 0;
  return (game.dailySupplies || 0) > 0 ? 100 : 0;
}

function MissionCard({ mission, index, progress, complete, claimed, pending, onClaim }: { mission: MissionDefinition; index: number; progress: number; complete: boolean; claimed: boolean; pending: boolean; onClaim: () => void }) {
  const icon = index === 0 ? <Building2 size={17} /> : index === 1 ? <Swords size={17} /> : index === 2 ? <Microscope size={17} /> : index === 3 ? <Radar size={17} /> : index === 4 ? <Flag size={17} /> : <Package size={17} />;
  return <article className={`panel mission-card ${complete ? 'mission-ready' : ''} ${claimed ? 'mission-claimed' : ''}`}><div className="mission-index">{icon}<small>OP-{String(index + 1).padStart(2, '0')}</small></div><div className="mission-description"><div className="mission-title-row"><h3>{mission.name}</h3><Chip tone={mission.category === 'Постоянная' ? 'blue' : 'gold'}>{mission.category}</Chip></div><p>{mission.description}</p><div className="mission-progress-track"><i style={{ width: `${progress}%` }} /></div><small>{claimed ? 'НАГРАДА ПОЛУЧЕНА' : complete ? 'ВЫПОЛНЕНО · ЗАБЕРИТЕ НАГРАДУ' : `ПРОГРЕСС · ${progress}%`}</small></div><div className="mission-reward"><span>НАГРАДА</span><ResourceCost cost={mission.reward} compact /><small><Sparkles size={11} /> +{mission.xp} XP</small></div><button className={`button ${claimed ? 'button-working' : complete ? 'button-brass' : 'button-quiet'} button-small mission-claim-button`} disabled={!complete || claimed || pending} onClick={onClaim}>{claimed ? <><Check size={14} /> Получено</> : complete ? <>Забрать <ArrowRight size={13} /></> : <><LockKeyhole size={13} /> В процессе</>}</button></article>;
}

function ProfileScreen({ snapshot, execute, pending, onAuth, onLogout, onWallet }: { snapshot: GameSnapshot; execute: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<unknown>; pending: string | null; onAuth: () => void; onLogout: () => void; onWallet: () => void }) {
  const [bio, setBio] = useState(snapshot.game.bio);
  const [editing, setEditing] = useState(false);
  const rank = xpProgress(snapshot.game.xp);
  const { game } = snapshot;
  const power = totalArmyPower(game);
  const achievements = [
    { name: 'Первый приказ', text: 'База приняла командование', unlocked: true, icon: <Command size={15} /> },
    { name: 'Разведчик', text: 'Первый доклад получен', unlocked: game.stats.scoutsSent > 0, icon: <Radar size={15} /> },
    { name: 'Победитель', text: 'Первая успешная операция', unlocked: game.stats.wins > 0, icon: <Trophy size={15} /> },
    { name: 'Землевладелец', text: 'Под контроль взята территория', unlocked: game.stats.territoryCount > 0, icon: <Flag size={15} /> },
  ];
  return (
    <div className="profile-screen screen-enter"><div className="profile-hero"><div className="profile-large-avatar">{game.avatar || snapshot.user.username.slice(0, 2).toUpperCase()}<span>✦</span></div><div className="profile-hero-copy"><span className="eyebrow"><span className="eyebrow-mark" /> ЛИЧНОЕ ДЕЛО · КАРТОТЕКА КОМАНДИРОВ</span><h2>{snapshot.user.username}</h2><p>{game.bio || 'Командир северной дуги'}</p><div><Chip tone="gold">КОМАНДИР · УР. {rank.level}</Chip><Chip tone="green">СЕКТОР АКТИВЕН</Chip>{snapshot.playerAlliance && <Chip tone="blue">[{snapshot.playerAlliance.tag}] {snapshot.playerAlliance.name}</Chip>}</div></div><div className="profile-hero-rating"><small>РЕЙТИНГ</small><b>{formatNumber(game.stats.rating)}</b><span><TrendingUp size={13} /> КОМАНДНЫЙ ВЕС</span></div></div>
      <div className="profile-content-grid"><div className="profile-main-column"><section className="panel profile-stats-panel"><div className="panel-topline"><span>СВОДКА КАРЬЕРЫ</span><span className="mini-code">PERSONNEL / 09</span></div><div className="profile-stats-grid"><div><span><Swords size={14} /> АРМИЯ</span><b>{formatNumber(power, true)}</b><small>БОЕВАЯ МОЩЬ</small></div><div><span><Trophy size={14} /> ПОБЕДЫ</span><b>{formatNumber(game.stats.wins)}</b><small>{game.stats.losses} ПОРАЖЕНИЙ</small></div><div><span><Flag size={14} /> ТЕРРИТОРИИ</span><b>{game.stats.territoryCount}</b><small>ПОД КОНТРОЛЕМ</small></div><div><span><Activity size={14} /> БОИ</span><b>{game.stats.totalBattles}</b><small>В СЕКТОРЕ</small></div></div></section><section className="panel achievements-panel"><div className="panel-topline"><span>ЗНАКИ ОТЛИЧИЯ</span><span className="tiny-count">{achievements.filter((item) => item.unlocked).length.toString().padStart(2, '0')} / {achievements.length}</span></div><div className="achievement-list">{achievements.map((item) => <div className={`achievement-row ${item.unlocked ? 'achievement-unlocked' : ''}`} key={item.name}><span>{item.icon}</span><div><b>{item.name}</b><small>{item.text}</small></div>{item.unlocked ? <BadgeCheck size={15} /> : <LockKeyhole size={14} />}</div>)}</div></section><section className="panel profile-bio-panel"><div className="panel-topline"><span>ЗАПИСЬ В ЛИЧНОМ ДЕЛЕ</span><button className="text-button" onClick={() => setEditing(!editing)}>{editing ? 'ОТМЕНА' : 'ИЗМЕНИТЬ'}</button></div>{editing ? <div className="bio-edit-row"><input maxLength={90} value={bio} onChange={(event) => setBio(event.target.value)} /><button className="button button-brass button-small" disabled={pending === 'profile'} onClick={async () => { await execute('profile', { bio }, 'Запись командира обновлена.'); setEditing(false); }}><Check size={13} /> Сохранить</button></div> : <p className="profile-bio-text">«{game.bio || 'Командир северной дуги'}»</p>}</section></div>
        <aside className="profile-side-column"><section className="panel account-panel"><div className="panel-topline"><span>УЧЁТНАЯ ЗАПИСЬ</span><LockKeyhole size={14} /></div><div className="account-record"><span>НИКНЕЙМ</span><b>{snapshot.user.username}</b></div><div className="account-record"><span>EMAIL</span><b>{snapshot.user.email || 'Демо-профиль'}</b></div><div className="account-record"><span>ПРОГРЕСС</span><b>{snapshot.user.id === 'demo' ? 'ГОСТЕВОЙ СЕАНС' : 'СОХРАНЯЕТСЯ НА СЕРВЕРЕ'}</b></div>{snapshot.user.id === 'demo' ? <button className="button button-brass button-full" onClick={onAuth}><UserRound size={14} /> Создать аккаунт · привязать базу</button> : <button className="button button-quiet button-full" onClick={onLogout}><LogOut size={14} /> Выйти из аккаунта</button>}<small className="account-note">Пароли хранятся в виде scrypt-хэша. Кошелёк для игры не требуется.</small></section><section className="panel wallet-panel"><div className="panel-topline"><span>WEB3 · НЕОБЯЗАТЕЛЬНО</span><Wallet size={14} /></div><div className="wallet-panel-copy"><div><Wallet size={20} /></div><b>Предметы — ваши правила</b><p>Кошелёк можно подключить позже для редкой косметики. Боевые ресурсы и прогресс остаются игровыми.</p></div><button className="button button-quiet button-full" onClick={onWallet}><Wallet size={14} /> CONNECT WALLET</button><small className="wallet-ready-tag"><span /> EVM ADAPTER READY · DISABLED IN PROTOTYPE</small></section></aside></div>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><b>{title}</b><p>{text}</p></div>;
}

function AuthModal({ mode, pending, onModeChange, onClose, onSubmit, onDemo }: {
  mode: Exclude<AuthMode, null>; pending: boolean; onModeChange: (mode: AuthMode) => void; onClose: () => void;
  onSubmit: (mode: Exclude<AuthMode, null>, values: { login?: string; username?: string; email?: string; password: string }) => void;
  onDemo: () => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(mode, mode === 'register' ? { username, email, password } : { login: loginValue, password });
  };
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="auth-modal modal-panel"><button className="modal-close icon-button" aria-label="Закрыть" onClick={onClose}><X size={18} /></button><div className="auth-emblem"><span>N</span><i /></div><span className="eyebrow"><span className="eyebrow-mark" /> NORTHLINE · ACCOUNT SYSTEM</span><h2>{mode === 'register' ? 'Оставьте след.' : 'С возвращением.'}</h2><p>{mode === 'register' ? 'Создайте командирский профиль. Ваша база будет привязана к серверной учётной записи.' : 'Введите данные учётной записи, чтобы продолжить командование.'}</p><div className="auth-tabs"><button className={mode === 'login' ? 'auth-tab-active' : ''} onClick={() => onModeChange('login')}>ВОЙТИ</button><button className={mode === 'register' ? 'auth-tab-active' : ''} onClick={() => onModeChange('register')}>СОЗДАТЬ АККАУНТ</button></div><form onSubmit={submit} className="auth-form">{mode === 'register' ? <><label className="form-field"><span>ПОЗЫВНОЙ КОМАНДИРА</span><input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Например, Север-09" minLength={3} maxLength={20} required /></label><label className="form-field"><span>EMAIL</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label></> : <label className="form-field"><span>EMAIL ИЛИ ПОЗЫВНОЙ</span><input autoFocus autoComplete="username" value={loginValue} onChange={(event) => setLoginValue(event.target.value)} placeholder="Командир-09" required /></label>}<label className="form-field password-field"><span>ПАРОЛЬ · НЕ МЕНЕЕ 8 СИМВОЛОВ</span><div><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" minLength={8} required /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'СКРЫТЬ' : 'ПОКАЗАТЬ'}</button></div></label><button className="button button-brass button-full auth-submit" disabled={pending}><LockKeyhole size={15} />{pending ? 'ПОДТВЕРЖДАЕМ…' : mode === 'register' ? 'СОЗДАТЬ УЧЁТНУЮ ЗАПИСЬ' : 'ВХОД В КОМАНДОВАНИЕ'}<ArrowRight size={14} /></button></form><div className="auth-divider"><span /> ИЛИ <span /></div><button className="button button-quiet button-full demo-login-button" onClick={onDemo} disabled={pending}><Command size={14} /> Продолжить в демо-мире без регистрации</button><small className="auth-privacy"><ShieldCheck size={12} /> Аккаунт не требует кошелька или оплаты. Пароль хранится в серверной базе в виде криптографического хэша.</small></div></div>;
}

function WalletModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="wallet-modal modal-panel"><button className="modal-close icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button><div className="wallet-modal-glyph"><Wallet size={27} /><i /></div><span className="eyebrow"><span className="eyebrow-mark" /> OPTIONAL · EVM-COMPATIBLE</span><h2>Ваш прогресс — <em>в безопасности.</em></h2><p>Обычная игра и все базовые механики работают без криптокошелька. В прототипе транзакции не включены: здесь нет токенов, покупок или pay-to-win.</p><div className="wallet-steps"><div><span>01</span><b>Обычный аккаунт</b><small>Email, никнейм и пароль хранятся отдельно от Web3.</small></div><div><span>02</span><b>Будущая интеграция</b><small>EVM-адаптер будет отвечать только за предметы и косметику.</small></div><div><span>03</span><b>Свободный выбор</b><small>Можно играть, торговать и развиваться, не подключая кошелёк.</small></div></div><div className="wallet-adapter-status"><span className="signal-dot" /> АДАПТЕР ПОДГОТОВЛЕН · ПРОВАЙДЕР ОТКЛЮЧЁН</div><button className="button button-quiet button-full" onClick={onClose}>Понятно · продолжить игру</button></div></div>;
}

function BattleModal({ report, now, onClose }: { report: BattleReport; now: number; onClose: () => void }) {
  const victory = report.outcome === 'victory';
  const directionLabel = ({ frontal: 'Прямой прорыв', north: 'Северный обход', flank: 'Фланговый удар' } as const)[report.direction || 'frontal'];
  return <div className="modal-scrim battle-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`battle-modal modal-panel ${victory ? 'battle-victory' : 'battle-defeat'}`}><button className="modal-close icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button><div className="battle-modal-top"><span className="eyebrow"><span className="eyebrow-mark" /> AAR · AFTER ACTION REPORT · {new Date(report.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span><Chip tone={victory ? 'green' : 'red'}>{victory ? 'ОПЕРАЦИЯ УСПЕШНА' : 'ОТСТУПЛЕНИЕ'}</Chip></div><h2>{victory ? 'Рубеж взят.' : 'Позиция удержана.'}</h2><p className="battle-subtitle">Операция на объекте <b>{report.targetName}</b> завершена. {report.summary}<br /><span className="battle-direction-label">МАНЁВР · {directionLabel}</span></p><div className="battle-vs-board"><div className="battle-side attacker-side"><span>АТАКУЮЩИЙ</span><div className="battle-side-icon"><Swords size={24} /></div><b>{report.attacker}</b><small>{UNIT_BY_ID[report.unit].name}</small><strong>{formatNumber(report.sent - report.attackerLosses)} <em>В СТРОЮ</em></strong></div><div className="battle-vs">VS<span>⚔</span></div><div className="battle-side defender-side"><span>ЗАЩИЩАЮЩИЙ</span><div className="battle-side-icon"><ShieldCheck size={24} /></div><b>{report.defender}</b><small>{report.targetName}</small><strong>{formatNumber(report.enemyDestroyed)} <em>ПОТЕРИ ВРАГА</em></strong></div></div><div className="battle-results-grid"><div><small>ОТПРАВЛЕНО</small><b>{formatNumber(report.sent)}</b></div><div><small>НАШИ ПОТЕРИ</small><b className={report.attackerLosses > 0 ? 'loss-value' : ''}>{formatNumber(report.attackerLosses)}</b></div><div><small>СИЛА ОБОРОНЫ</small><b>~{formatNumber(report.defensePower, true)}</b></div><div><small>ОПЫТ</small><b className="xp-earned">+{report.xp} XP</b></div></div>{report.territoryCaptured && <div className="territory-capture-line"><Flag size={15} /><b>ТЕРРИТОРИЯ ЗАКРЕПЛЕНА</b><span>Объект добавлен в ваш сектор.</span></div>}{Object.keys(report.loot).length > 0 && <div className="battle-loot"><span>ТРОФЕИ</span><ResourceCost cost={report.loot} compact /></div>}<div className="battle-modal-bottom"><span>РЕЙТИНГ <b className={report.ratingDelta >= 0 ? 'xp-earned' : 'loss-value'}>{report.ratingDelta >= 0 ? '+' : ''}{report.ratingDelta}</b></span><span>{timeAgo(report.createdAt, now)}</span><button className={`button ${victory ? 'button-brass' : 'button-quiet'} button-small`} onClick={onClose}>ПРОДОЛЖИТЬ <ArrowRight size={14} /></button></div></div></div>;
}

function BattleJournal({ reports, now, onClose, onOpenReport }: { reports: BattleReport[]; now: number; onClose: () => void; onOpenReport: (report: BattleReport) => void }) {
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="journal-modal modal-panel"><button className="modal-close icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button><span className="eyebrow"><span className="eyebrow-mark" /> ARCHIVE · BATTLE RECORDS</span><h2>Журнал <em>операций</em></h2><p>Сводки боевых действий в вашем секторе.</p><div className="journal-list">{reports.length ? reports.map((report) => <button className="journal-row" key={report.id} onClick={() => onOpenReport(report)}><span className={`journal-status ${report.outcome}`}><Swords size={15} /></span><span className="journal-copy"><b>{report.targetName} <i>·</i> {report.outcome === 'victory' ? 'победа' : 'поражение'}</b><small>{report.attacker} vs {report.defender} · {report.sent} отправлено · {report.attackerLosses} потерь</small></span><span className="journal-date">{timeAgo(report.createdAt, now)}<ChevronRight size={13} /></span></button>) : <EmptyState icon={<FileText size={22} />} title="Архив пока пуст" text="Первая операция появится здесь после атаки на карте мира." />}</div><div className="journal-footer"><span>СВОДОК: <b>{reports.length}</b></span><span>SERVER LOG · NORTHLINE N-04</span></div></div></div>;
}

function NotificationsModal({ notifications, now, onClose, onRead }: { notifications: NotificationItem[]; now: number; onClose: () => void; onRead: () => void }) {
  const unread = notifications.filter((item) => !item.read).length;
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="notifications-modal modal-panel"><button className="modal-close icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button><span className="eyebrow"><span className="eyebrow-mark" /> СИГНАЛЫ КОМАНДОВАНИЯ</span><div className="notification-modal-title"><h2>Уведомления</h2>{unread > 0 && <Chip tone="gold">{unread} НОВЫХ</Chip>}</div><div className="notification-list">{notifications.length ? notifications.map((item) => <div key={item.id} className={`notification-list-row ${item.read ? '' : 'notification-new'}`}><ActivityRow item={item} now={now} /></div>) : <EmptyState icon={<Bell size={22} />} title="Тишина в эфире" text="О важных событиях сообщим здесь." />}</div><button className="button button-quiet button-full" disabled={!unread} onClick={onRead}><CheckCheck size={14} /> Отметить всё прочитанным</button></div></div>;
}
