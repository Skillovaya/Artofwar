import { NextResponse } from 'next/server';
import { GameError } from './game/service';

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof GameError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('[northline-api]', error);
  return NextResponse.json({ error: 'Внутренняя ошибка командного сервера. Попробуйте ещё раз.' }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
    return value as Record<string, unknown>;
  } catch {
    throw new GameError('Некорректный формат запроса.');
  }
}
