import assert from "node:assert/strict";
import test from "node:test";

import type { NewAPIConfigResponse } from "@/services/api/new-api";
import { applyNewAPITokenAsChannel, defaultConfig } from "./use-config-store";

test("EggAI creates one channel per group and preserves configured channels", () => {
    const next: NewAPIConfigResponse = {
        configured: true,
        displayName: "EggAI",
        loginUrl: "",
        message: "",
        models: ["gpt-image-2", "grok-imagine-video", "claude-sonnet-4"],
        tokens: [
            { tokenId: 1, tokenName: "OpenAI 1", group: "OpenAI", baseUrl: "https://api.example/v1", apiKey: "openai-key", models: ["gpt-image-2"] },
            { tokenId: 3, tokenName: "Grok 1", group: "Grok", baseUrl: "https://api.example/v1", apiKey: "grok-key", models: ["grok-imagine-video"] },
            { tokenId: 5, tokenName: "Claude 1", group: "claude", baseUrl: "https://api.example/v1", apiKey: "claude-key", models: ["claude-sonnet-4"] },
        ],
    };
    const configuredOpenAI = { id: "custom-openai", protocol: "openai" as const, name: "OpenAI", baseUrl: "https://custom.example/v1", apiKey: "custom-key", models: ["gpt-image-2"] };
    const config = { ...defaultConfig, localChannels: [configuredOpenAI], imageChannelId: configuredOpenAI.id };
    const result = applyNewAPITokenAsChannel(config, next);

    assert.deepEqual(result.localChannels.map(({ name }) => name), ["OpenAI", "Grok", "claude"]);
    assert.deepEqual(result.localChannels[0], configuredOpenAI);
    assert.deepEqual(result.localChannels[1].models, ["grok-imagine-video"]);
    assert.deepEqual(result.localChannels[2].models, ["claude-sonnet-4"]);
    assert.equal(result.imageChannelId, configuredOpenAI.id);
    assert.equal(result.channelMode, config.channelMode);
});
