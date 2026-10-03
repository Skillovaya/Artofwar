import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '../db';
import { ensureGameForUser, GameError, readState } from '../game/service';

const SESSION_COOKIE = 'northline_session';
const SESSION_DAYS = 30;
const DEMO_USER = { id: 'demo', username: 'Командир-09', email: 'commander@northline.game' };

function passwordHash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, original] = stored.split(':');
  if (!salt || !original) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(original, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(token, userId, expires, now);
  return token;
}

function publicUser(userId: string): { id: string; username: string; email?: string; createdAt?: number } | null {
  const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(userId) as { id: string; username: string; email: string | null; created_at: number } | undefined;
  return user ? { id: user.id, username: user.username, email: user.email || undefined, createdAt: user.created_at } : null;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export function startDemoSession(): { token: string; user: NonNullable<ReturnType<typeof publicUser>> } {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, NULL, ?)')
    .run(DEMO_USER.id, DEMO_USER.username, DEMO_USER.email, now);
  const token = createSession(DEMO_USER.id);
  const user = publicUser(DEMO_USER.id)!;
  ensureGameForUser(user.id, user.username);
  return { token, user };
}

export function registerAccount(input: { username: unknown; email: unknown; password: unknown }, sourceUserId?: string): { token: string; user: NonNullable<ReturnType<typeof publicUser>> } {
  const username = typeof input.username === 'string' ? input.username.trim().replace(/\s+/g, ' ') : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username)) throw new GameError('Имя командира: 3–20 букв, цифр, «_» или «-».');
  if (username.toLowerCase() === DEMO_USER.username.toLowerCase() || email === DEMO_USER.email) throw new GameError('Этот позывной зарезервирован для гостевого демо-аккаунта.', 409);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new GameError('Укажите корректный email.');
  if (password.length < 8 || password.length > 128) throw new GameError('Пароль должен содержать не менее 8 символов.');
  const id = `u_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const now = Date.now();
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, username, email, passwordHash(password), now);
      if (sourceUserId === 'demo') {
        const inherited = structuredClone(readState('demo'));
        inherited.userId = id;
        inherited.username = username;
        inherited.avatar = username.slice(0, 2).toUpperCase();
        inherited.createdAt = now;
        inherited.updatedAt = now;
        inherited.lastTickAt = now;
        const sourceAlliance = db.prepare('SELECT alliance_id FROM alliance_members WHERE user_id = ?').get('demo') as { alliance_id: string } | undefined;
        inherited.allianceId = sourceAlliance?.alliance_id || null;
        inherited.notifications.unshift({ id: randomUUID(), kind: 'system', title: 'База привязана к аккаунту', body: 'Командирский прогресс и склад перенесены в новую серверную учётную запись.', createdAt: now, read: false });
        db.prepare('INSERT INTO game_states (user_id, state_json, updated_at) VALUES (?, ?, ?)').run(id, JSON.stringify(inherited), now);
        if (sourceAlliance) db.prepare('INSERT INTO alliance_members (alliance_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(sourceAlliance.alliance_id, id, 'Боец', now);
        for (const territoryId of inherited.territories || []) {
          db.prepare('UPDATE world_nodes SET owner = ?, owner_user_id = ?, subtitle = ? WHERE id = ? AND owner_user_id = ?').run(username, id, 'Территория привязана к командирскому аккаунту', territoryId, 'demo');
          db.prepare('UPDATE territories SET owner_user_id = ?, alliance_id = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?').run(id, inherited.allianceId, now, territoryId, 'demo');
        }
        const guestState = readState('demo');
        guestState.territories = guestState.territories.filter((territoryId) => !inherited.territories.includes(territoryId));
        guestState.stats.territoryCount = guestState.territories.length;
        db.prepare('UPDATE game_states SET state_json = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(guestState), now, 'demo');
        const hash = Array.from(id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) | 0, 0);
        const x = 8 + (Math.abs(hash) % 84);
        const y = 10 + (Math.abs((hash >> 8) * 17) % 80);
        db.prepare(`INSERT INTO world_nodes (id, name, kind, x, y, level, owner, owner_user_id, alliance_tag, defense_power, resources_json, subtitle, is_npc)
          VALUES (?, ?, 'base', ?, ?, ?, ?, ?, NULL, 610, ?, ?, 0)`)
          .run(`base_${id}`, `${username} · база`, x, y, inherited.buildings.hq, username, id, JSON.stringify({ credits: 950, metal: 420, oil: 210 }), 'Игрок · домашний сектор');
      } else {
        ensureGameForUser(id, username);
      }
    })();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) throw new GameError('Такой никнейм или email уже зарегистрирован.', 409);
    throw error;
  }
  const token = createSession(id);
  return { token, user: publicUser(id)! };
}

export function loginAccount(input: { login: unknown; password: unknown }): { token: string; user: NonNullable<ReturnType<typeof publicUser>> } {
  const login = typeof input.login === 'string' ? input.login.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!login || !password) throw new GameError('Введите email или никнейм и пароль.');
  const user = db.prepare('SELECT id, username, email, password_hash FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?) LIMIT 1')
    .get(login, login) as { id: string; username: string; email: string | null; password_hash: string | null } | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) throw new GameError('Неверный логин или пароль.', 401);
  const token = createSession(user.id);
  ensureGameForUser(user.id, user.username);
  return { token, user: publicUser(user.id)! };
}

export function getSessionUser(request: NextRequest): NonNullable<ReturnType<typeof publicUser>> | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as { user_id: string; expires_at: number } | undefined;
  if (!session || session.expires_at <= Date.now()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return publicUser(session.user_id);
}

export function endSession(request: NextRequest): void {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function attachSession(response: Response, token: string): Response {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.headers.append('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure}`);
  return response;
}

export function clearSession(response: Response): Response {
  response.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}
