import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/service';
import { getGameSnapshot } from '@/lib/game/service';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Требуется авторизация.' }, { status: 401 });
    return NextResponse.json(getGameSnapshot(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
