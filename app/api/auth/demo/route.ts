import { NextResponse } from 'next/server';
import { attachSession, startDemoSession } from '@/lib/auth/service';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { token, user } = startDemoSession();
    return attachSession(NextResponse.json({ user, demo: true }), token);
  } catch (error) {
    return errorResponse(error);
  }
}
