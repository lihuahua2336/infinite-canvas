import { handleSignIn } from "@logto/next/server-actions";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { eggAiBaseUrl, eggAiLogtoConfig } from "@/lib/eggai-server";

export async function GET(request: NextRequest) {
    await handleSignIn(eggAiLogtoConfig, request.nextUrl.searchParams);
    return NextResponse.redirect(eggAiBaseUrl);
}
