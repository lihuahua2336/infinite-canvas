import { signOut } from "@logto/next/server-actions";

import { eggAiBaseUrl, eggAiLogtoConfig } from "@/lib/eggai-server";

export async function GET() {
    await signOut(eggAiLogtoConfig, eggAiBaseUrl);
}
