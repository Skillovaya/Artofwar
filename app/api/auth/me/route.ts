import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/service';
import { errorResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = getSessionUser(request);
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
