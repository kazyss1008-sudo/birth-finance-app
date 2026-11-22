import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CAST_COOKIE } from '@/lib/cast-auth';
export async function POST() {
  (await cookies()).delete(CAST_COOKIE);
  return NextResponse.json({ ok: true });
}
