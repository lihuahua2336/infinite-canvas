import { NextRequest } from "next/server";

import { readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const session = readSession(request);
    if (!session) return Response.json({ user: null }, { status: 401 });
    return Response.json({ user: session.user });
}
