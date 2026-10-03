import { NextResponse } from 'next/server';
import { clearSession, endSession } from '@/lib/auth/service';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Parameters<typeof endSession>[0]) {
  try {
    endSession(request);
    return clearSession(NextResponse.json({ ok: true }));
  } catch (error) {
    return errorResponse(error);
  }
}
