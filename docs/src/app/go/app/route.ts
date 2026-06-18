import { defaultAppUrl } from '@/lib/shared';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export function GET() {
  const appUrl = process.env.APP_PUBLIC_URL?.trim() || defaultAppUrl;
  redirect(appUrl.replace(/\/?$/, '/'));
}
