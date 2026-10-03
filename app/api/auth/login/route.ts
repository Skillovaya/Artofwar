import { NextResponse } from 'next/server';
import { attachSession, loginAccount } from '@/lib/auth/service';
import { errorResponse, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const { token, user } = loginAccount({ login: body.login, password: body.password });
    return attachSession(NextResponse.json({ user }), token);
  } catch (error) {
    return errorResponse(error);
  }
}
