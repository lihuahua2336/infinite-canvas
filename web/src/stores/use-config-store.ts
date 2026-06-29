"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import type { NewAPIConfigResponse } from "@/services/api/new-api";

export type ApiCallFormat = "openai" | "gemini";
export type ApiProxyMode = "direct" | "nextjs";

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    proxyMode: ApiProxyMode;
    models: string[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    proxyMode: ApiProxyMode;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
};

export type WebdavSyncConfig = {
    proxyMode: "direct" | "nextjs";
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_TEXT_MODEL_NAME = "gpt-5.5";
const DEFAULT_IMAGE_MODEL_NAME = "gpt-image-2";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    proxyMode: "direct",
    channels: [
        {
            id: "default",
            name: "默认渠道",
            baseUrl: OPENAI_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            proxyMode: "direct",
            models: ["gpt-image-2", "grok-imagine-video", "gpt-5.5", "gpt-4o-mini-tts"],
        },
    ],
    model: "default::gpt-image-2",
    imageModel: "default::gpt-image-2",
    videoModel: "default::grok-imagine-video",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: ["default::gpt-image-2", "default::grok-imagine-video", "default::gpt-5.5", "default::gpt-4o-mini-tts"],
    imageModels: ["default::gpt-image-2"],
    videoModels: ["default::grok-imagine-video"],
    textModels: ["default::gpt-5.5"],
    audioModels: ["default::gpt-4o-mini-tts"],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    proxyMode: "direct",
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    newAPIConfig: NewAPIConfigResponse | null;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    setNewAPIConfig: (config: NewAPIConfigResponse | null) => void;
    applyNewAPITokenAsChannel: (config: NewAPIConfigResponse, tokenId?: string) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function isVideoModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo");
}

function isImageModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            newAPIConfig: null,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            setNewAPIConfig: (newAPIConfig) => set({ newAPIConfig }),
            applyNewAPITokenAsChannel: (newAPIConfig, tokenId) =>
                set((state) => ({
                    config: applyNewAPITokenAsChannel(state.config, newAPIConfig, tokenId),
                    newAPIConfig,
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        proxyMode: normalizeProxyMode(config.proxyMode),
                        channels,
                        models,
                        imageModel: normalizeDefaultModel(normalizeModelOptionValue(config.imageModel || config.model, channels), filterModelsByCapability(models, "image"), DEFAULT_IMAGE_MODEL_NAME),
                        videoModel: normalizeModelOptionValue(config.videoModel || "grok-imagine-video", channels),
                        textModel: normalizeDefaultModel(normalizeModelOptionValue(config.textModel || config.model, channels), filterModelsByCapability(models, "text"), DEFAULT_TEXT_MODEL_NAME),
                        audioModel: normalizeModelOptionValue(config.audioModel || defaultConfig.audioModel, channels),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        canvasImageCount: config.canvasImageCount || "3",
                        imageModels: Array.isArray(persistedConfig.imageModels) ? normalizeModelList(config.imageModels, channels) : filterModelsByCapability(models, "image"),
                        videoModels: Array.isArray(persistedConfig.videoModels) ? normalizeModelList(config.videoModels, channels) : filterModelsByCapability(models, "video"),
                        textModels: Array.isArray(persistedConfig.textModels) ? normalizeModelList(config.textModels, channels) : filterModelsByCapability(models, "text"),
                        audioModels: Array.isArray(persistedConfig.audioModels) ? normalizeModelList(config.audioModels, channels) : filterModelsByCapability(models, "audio"),
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[], channels: ModelChannel[]) {
    const allModelOptions = channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model)));
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)))
        .map((model) => normalizeModelOptionValue(model, channels))
        .filter((model) => !allModelOptions.length || allModelOptions.includes(model) || !isChannelModelValue(model));
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || "新渠道",
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        apiFormat,
        proxyMode: normalizeProxyMode(channel?.proxyMode),
        models: uniqueRawModels(channel?.models || []),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.includes(decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.includes(decoded?.model || model)) || channels[0];
    return channel && channel.models.includes(decoded?.model || model) ? encodeChannelModel(channel.id, decoded?.model || model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.includes(model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: "默认渠道", baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
        proxyMode: channel.proxyMode,
    };
}

export function configWithChannels(config: AiConfig, channels: ModelChannel[]): AiConfig {
    const normalizedChannels = normalizeChannels({ ...config, channels });
    const models = modelOptionsFromChannels(normalizedChannels);
    const imageModels = keepOrSuggest(config.imageModels, filterModelsByCapability(models, "image"), models);
    const videoModels = keepOrSuggest(config.videoModels, filterModelsByCapability(models, "video"), models);
    const textModels = keepOrSuggest(config.textModels, filterModelsByCapability(models, "text"), models);
    const audioModels = keepOrSuggest(config.audioModels, filterModelsByCapability(models, "audio"), models);
    return {
        ...config,
        channels: normalizedChannels,
        models,
        baseUrl: normalizedChannels[0]?.baseUrl || config.baseUrl,
        apiKey: normalizedChannels[0]?.apiKey || config.apiKey,
        apiFormat: normalizedChannels[0]?.apiFormat || config.apiFormat,
        proxyMode: normalizedChannels[0]?.proxyMode || config.proxyMode,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        model: normalizeDefaultModel(config.model, textModels, DEFAULT_TEXT_MODEL_NAME),
        imageModel: normalizeDefaultModel(config.imageModel, imageModels, DEFAULT_IMAGE_MODEL_NAME),
        videoModel: normalizeDefaultModel(config.videoModel, videoModels),
        textModel: normalizeDefaultModel(config.textModel, textModels, DEFAULT_TEXT_MODEL_NAME),
        audioModel: normalizeDefaultModel(config.audioModel, audioModels),
    };
}

function applyNewAPITokenAsChannel(config: AiConfig, newAPIConfig: NewAPIConfigResponse, tokenId?: string): AiConfig {
    const token = resolveNewAPIToken(newAPIConfig, tokenId);
    if (!token?.apiKey?.trim()) return config;
    const channelId = `new-api-${token.tokenId}`;
    const rawModels = uniqueRawModels(newAPIConfig.models || []);
    const baseUrl = token.baseUrl.trim() || config.baseUrl || defaultConfig.baseUrl;
    const channel = createModelChannel({
        id: channelId,
        name: token.tokenName || `${newAPIConfig.displayName || "New API"} ${token.tokenId}`,
        baseUrl,
        apiKey: token.apiKey,
        apiFormat: "openai",
        models: rawModels,
    });
    const others = config.channels.filter((item) => item.id !== channelId);
    const nextConfig = configWithChannels({ ...config, baseUrl, apiKey: token.apiKey }, [channel, ...others]);
    const allModels = modelOptionsFromChannels(nextConfig.channels);
    const imageModels = filterModelsByCapability(allModels, "image");
    const videoModels = filterModelsByCapability(allModels, "video");
    const textModels = filterModelsByCapability(allModels, "text");
    const audioModels = filterModelsByCapability(allModels, "audio");
    return {
        ...nextConfig,
        models: allModels,
        baseUrl,
        apiKey: token.apiKey,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        model: preferChannelModel(textModels, channelId, nextConfig.model, DEFAULT_TEXT_MODEL_NAME),
        imageModel: preferChannelModel(imageModels, channelId, nextConfig.imageModel, DEFAULT_IMAGE_MODEL_NAME),
        videoModel: preferChannelModel(videoModels, channelId, nextConfig.videoModel),
        textModel: preferChannelModel(textModels, channelId, nextConfig.textModel, DEFAULT_TEXT_MODEL_NAME),
        audioModel: preferChannelModel(audioModels, channelId, nextConfig.audioModel),
    };
}

function resolveNewAPIToken(newAPIConfig: NewAPIConfigResponse, tokenId?: string) {
    const requested = (tokenId || "").trim();
    return newAPIConfig.tokens.find((token) => String(token.tokenId) === requested) || newAPIConfig.tokens[0] || null;
}

function preferChannelModel(models: string[], channelId: string, current: string, preferredModelName?: string) {
    if (current && models.includes(current) && decodeChannelModel(current)?.channelId === channelId) return current;
    const channelModels = models.filter((model) => decodeChannelModel(model)?.channelId === channelId);
    return preferredModelOption(channelModels, preferredModelName) || channelModels[0] || normalizeDefaultModel(current, models, preferredModelName);
}

function keepOrSuggest(current: string[], suggested: string[], allModels: string[]) {
    const available = new Set(allModels);
    const kept = uniqueModelOptions(current).filter((model) => available.has(model));
    return kept.length ? kept : suggested;
}

function normalizeDefaultModel(value: string, options: string[], preferredModelName?: string) {
    if (options.includes(value)) return value;
    return preferredModelOption(options, preferredModelName) || options[0] || value;
}

function preferredModelOption(options: string[], preferredModelName?: string) {
    const preferred = preferredModelName?.trim().toLowerCase();
    if (!preferred) return "";
    return options.find((model) => modelOptionName(model).toLowerCase() === preferred) || "";
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
            models: uniqueRawModels(channel.models || []),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: "默认渠道",
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                proxyMode: config.proxyMode || defaultConfig.proxyMode,
                models: uniqueRawModels([
                    ...(config.models || []),
                    config.model,
                    config.imageModel,
                    config.videoModel,
                    config.textModel,
                    config.audioModel,
                ]),
            }),
        );
    }
    return channels.map((channel) => ({ ...channel, models: uniqueRawModels(channel.models) }));
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    return apiFormat === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? "gemini" : "openai";
}

function normalizeProxyMode(proxyMode: unknown): ApiProxyMode {
    return proxyMode === "nextjs" ? "nextjs" : "direct";
}

function uniqueRawModels(models: string[]) {
    return Array.from(new Set((models || []).map((model) => modelOptionName(model).trim()).filter(Boolean)));
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
