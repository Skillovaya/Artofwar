import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/service';
import { performGameAction } from '@/lib/game/service';
import { errorResponse, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Сессия завершена. Войдите снова.' }, { status: 401 });
    const body = await readJson(request);
    if (typeof body.action !== 'string') return NextResponse.json({ error: 'В запросе не указан приказ.' }, { status: 400 });
    return NextResponse.json(performGameAction(user.id, body as { action: string; [key: string]: unknown }));
  } catch (error) {
    return errorResponse(error);
  }
}
