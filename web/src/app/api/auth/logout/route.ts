import { NextRequest, NextResponse } from "next/server";

import { appURL, clearSessionCookie } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
}

export async function GET(request: NextRequest) {
    const response = NextResponse.redirect(appURL(request, "/login"));
    clearSessionCookie(response);
    return response;
}
