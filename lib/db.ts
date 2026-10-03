import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type TransactionalDatabase = DatabaseSync & { transaction<T>(callback: () => T): () => T };
let transactionDepth = 0;

const databaseGlobal = globalThis as typeof globalThis & { __northlineDb?: TransactionalDatabase; __northlineSeeded?: boolean };

function openDatabase(): TransactionalDatabase {
  if (databaseGlobal.__northlineDb) return databaseGlobal.__northlineDb;
  const databasePath = process.env.NORTHLINE_DB_PATH || path.join(process.cwd(), 'data', 'northline.sqlite');
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT COLLATE NOCASE UNIQUE,
      password_hash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS game_states (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS world_nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      owner TEXT NOT NULL,
      owner_user_id TEXT,
      alliance_tag TEXT,
      defense_power INTEGER NOT NULL DEFAULT 0,
      resources_json TEXT NOT NULL DEFAULT '{}',
      subtitle TEXT NOT NULL DEFAULT '',
      is_npc INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS world_nodes_kind ON world_nodes(kind);
    CREATE TABLE IF NOT EXISTS alliances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      tag TEXT NOT NULL COLLATE NOCASE UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      leader_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      npc_members INTEGER NOT NULL DEFAULT 0,
      territories INTEGER NOT NULL DEFAULT 0,
      rating INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alliance_members (
      alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'Боец',
      joined_at INTEGER NOT NULL,
      PRIMARY KEY(alliance_id, user_id),
      UNIQUE(user_id)
    );
    CREATE TABLE IF NOT EXISTS alliance_messages (
      id TEXT PRIMARY KEY,
      alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS diplomatic_relations (
      alliance_a TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
      alliance_b TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(alliance_a, alliance_b)
    );
    CREATE TABLE IF NOT EXISTS market_orders (
      id TEXT PRIMARY KEY,
      seller_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      seller_name TEXT NOT NULL,
      offer_resource TEXT NOT NULL,
      offer_amount INTEGER NOT NULL,
      ask_resource TEXT NOT NULL,
      ask_amount INTEGER NOT NULL,
      remaining INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_trades (
      id TEXT PRIMARY KEY,
      buyer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_name TEXT NOT NULL,
      resource_from TEXT NOT NULL,
      amount_from INTEGER NOT NULL,
      resource_to TEXT NOT NULL,
      amount_to INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS battle_reports (
      id TEXT PRIMARY KEY,
      attacker_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      defender_user_id TEXT,
      target_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      report_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS territories (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      alliance_id TEXT REFERENCES alliances(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
  `);
  const transactional = database as TransactionalDatabase;
  transactional.transaction = <T>(callback: () => T): (() => T) => () => {
    const depth = transactionDepth;
    const savepoint = `northline_nested_${depth}`;
    if (depth === 0) transactional.exec('BEGIN IMMEDIATE');
    else transactional.exec(`SAVEPOINT ${savepoint}`);
    transactionDepth += 1;
    try {
      const result = callback();
      transactionDepth -= 1;
      if (depth === 0) transactional.exec('COMMIT');
      else transactional.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      transactionDepth = Math.max(0, transactionDepth - 1);
      try {
        if (depth === 0) transactional.exec('ROLLBACK');
        else {
          transactional.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          transactional.exec(`RELEASE SAVEPOINT ${savepoint}`);
        }
      } catch { /* Preserve the original domain error. */ }
      throw error;
    }
  };
  databaseGlobal.__northlineDb = transactional;
  seedWorld(transactional);
  return transactional;
}

function seedWorld(database: DatabaseSync): void {
  if (databaseGlobal.__northlineSeeded) return;
  const insertNode = database.prepare(`INSERT OR IGNORE INTO world_nodes
    (id, name, kind, x, y, level, owner, owner_user_id, alliance_tag, defense_power, resources_json, subtitle, is_npc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const nodes: [string, string, string, number, number, number, string, string | null, string | null, number, string, string, number][] = [
    ['node_icewatch', 'Застава Иней', 'base', 27, 34, 2, 'Варяг-13', null, 'WLF', 520, '{"credits":1800,"metal":1100,"oil":320}', 'Пограничный лагерь · следы конвоя', 1],
    ['node_harbor', 'Тихая гавань', 'base', 72, 25, 3, 'Мира Коваль', null, 'СЕВ', 760, '{"credits":2600,"metal":800,"oil":1250}', 'Опорный узел снабжения', 1],
    ['node_blackridge', 'Чёрный хребет', 'base', 22, 71, 4, 'Дозор-9', null, 'ВОЛК', 1120, '{"credits":3400,"metal":1600,"oil":600}', 'Укреплённая высота', 1],
    ['node_ashgate', 'Пепельные ворота', 'base', 79, 67, 5, 'Седой', null, 'ASH', 1490, '{"credits":4200,"metal":2100,"oil":950}', 'Закрытый промышленный сектор', 1],
    ['node_polar_post', 'Пост Полярный', 'neutral', 51, 13, 1, 'Нейтральный гарнизон', null, null, 340, '{"credits":650,"metal":260,"food":350}', 'Нейтральная сторожевая вышка', 1],
    ['node_northgrad', 'Североград', 'city', 55, 77, 3, 'Городской совет', null, null, 590, '{"credits":2100,"food":1450,"metal":480}', 'Город · торговый узел сектора', 1],
    ['node_metal_mine', 'Рудник «Кварц»', 'resource', 39, 25, 1, 'Свободный объект', null, null, 280, '{"metal":1800,"credits":280}', 'Месторождение металла', 1],
    ['node_oil_field', 'Скважины «Маяк»', 'resource', 85, 42, 1, 'Свободный объект', null, null, 320, '{"oil":1600,"credits":350}', 'Нефтяной промысел', 1],
    ['node_power', 'Энергоузел-3', 'resource', 38, 77, 1, 'Свободный объект', null, null, 360, '{"energy":1300,"metal":420}', 'Заброшенная подстанция', 1],
    ['node_farm', 'Зерновой элеватор', 'resource', 67, 53, 1, 'Свободный объект', null, null, 300, '{"food":1700,"credits":240}', 'Склад продовольствия', 1],
    ['node_northline', 'Северная линия', 'alliance', 15, 48, 2, 'Альянс «Стальной рубеж»', null, 'SRZ', 680, '{"metal":720,"oil":380}', 'Территория альянса · нейтральный режим', 1],
    ['node_radio', 'Радиовышка «Эхо»', 'neutral', 60, 41, 2, 'Нейтральный гарнизон', null, null, 430, '{"energy":520,"credits":500}', 'Военный объект · контроль связи', 1],
  ];
  for (const node of nodes) insertNode.run(...node);
  database.prepare(`INSERT OR IGNORE INTO alliances (id, name, tag, description, leader_user_id, npc_members, territories, rating, created_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`)
    .run('alliance_steel', 'Стальной рубеж', 'SRZ', 'Союз гарнизонов северной дуги. Общая оборона и взаимная поддержка.', 47, 14, 42800, Date.now());
  databaseGlobal.__northlineSeeded = true;
}

export const db = openDatabase();
