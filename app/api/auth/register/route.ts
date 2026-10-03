import { NextRequest, NextResponse } from 'next/server';
import { attachSession, getSessionUser, registerAccount } from '@/lib/auth/service';
import { errorResponse, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const currentUser = getSessionUser(request);
    const { token, user } = registerAccount({ username: body.username, email: body.email, password: body.password }, currentUser?.id === 'demo' ? 'demo' : undefined);
    return attachSession(NextResponse.json({ user }), token);
  } catch (error) {
    return errorResponse(error);
  }
}
