import { defaultAppUrl } from '@/lib/shared';
import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const appUrl = process.env.APP_PUBLIC_URL?.trim() || defaultAppUrl;
  redirect(new URL(appUrl, request.url).toString().replace(/\/?$/, '/'));
}
