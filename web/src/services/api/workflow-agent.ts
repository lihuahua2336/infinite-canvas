import { buildApiUrl, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";

const DEFAULT_WORKFLOW_AGENT_PROMPT = `你是一个创意图片工作流设计助手。根据用户描述设计可重复运行的图片生成工作流。
只返回一个 JSON 对象，不要返回 Markdown、代码块或解释文字。JSON 结构：
{
  "name": "工作流名称",
  "category": "分类",
  "description": "用途说明",
  "mode": "single_image 或 multi_image_series",
  "variables": [{ "key": "英文变量名", "label": "中文名称", "type": "text|textarea|number|select|boolean", "required": true, "defaultValue": "", "options": [], "placeholder": "" }],
  "config": { "promptTemplate": "使用 {{变量名}} 的完整图片提示词模板", "negativePrompt": "" },
  "seriesConfig": { "targetCount": "4", "promptInstruction": "多图拆分规则", "reviewRequired": true, "concurrency": "3" }
}
变量 key 只能包含英文字母、数字、下划线或连字符，promptTemplate 必须引用已声明的变量。不要输出 id、模型、渠道、API 地址或密钥，这些配置由客户端补全。`;

type ChatCompletionPayload = {
    choices?: Array<{ message?: { content?: string } }>;
    data?: { choices?: Array<{ message?: { content?: string } }> };
    error?: { message?: string } | string;
    message?: string;
    msg?: string;
    code?: number;
};

export async function requestWorkflowAgentDraft<T>(config: AiConfig, prompt: string, scope: "private" | "public", references: string[]) {
    const configuredPrompt = (config.systemPrompts.workflowAgent || "").trim();
    const systemPrompt = configuredPrompt ? `${configuredPrompt}\n\n${DEFAULT_WORKFLOW_AGENT_PROMPT}` : DEFAULT_WORKFLOW_AGENT_PROMPT;
    const referenceContent = references
        .filter((url) => /^data:image\//.test(url) || /^https?:\/\//.test(url))
        .map((url) => ({ type: "image_url" as const, image_url: { url } }));
    const userContent = referenceContent.length
        ? [{ type: "text" as const, text: prompt }, ...referenceContent]
        : prompt;

    let response = await requestCompletion(config, systemPrompt, userContent);
    if (!response.ok && referenceContent.length && isImageCompatibilityError(await response.clone().text())) {
        response = await requestCompletion(config, systemPrompt, prompt);
    }
    const payload = (await response.json().catch(() => ({}))) as ChatCompletionPayload;
    if (!response.ok || (typeof payload.code === "number" && payload.code !== 0)) {
        throw new Error(readError(payload) || `工作流 Agent 请求失败（${response.status}）`);
    }
    const content = payload.choices?.[0]?.message?.content || payload.data?.choices?.[0]?.message?.content || "";
    const jsonText = extractJSONText(content);
    if (!jsonText) throw new Error("工作流 Agent 返回内容格式异常，请重试");
    try {
        const draft = JSON.parse(jsonText) as T & { scope?: "private" | "public" };
        draft.scope = scope;
        return draft;
    } catch {
        throw new Error("工作流 Agent 返回内容格式异常，请重试");
    }
}

function requestCompletion(config: AiConfig, systemPrompt: string, userContent: string | Array<Record<string, unknown>>) {
    const channel = localChannelForActiveModel(config);
    const baseUrl = channel?.baseUrl || config.baseUrl;
    const apiKey = channel?.apiKey || config.apiKey;
    if (!baseUrl || !apiKey) throw new Error("EggAI 文本渠道配置不完整，请刷新页面后重试");
    return fetch(buildApiUrl(baseUrl, "/chat/completions"), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
            ],
            stream: false,
        }),
    });
}

function extractJSONText(content: string) {
    const trimmed = content.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    return start >= 0 && end > start ? trimmed.slice(start, end + 1) : "";
}

function readError(payload: ChatCompletionPayload) {
    if (typeof payload.error === "string") return payload.error;
    return payload.error?.message || payload.message || payload.msg || "";
}

function isImageCompatibilityError(message: string) {
    return /image_url|image input|vision|multimodal|content.*array|unsupported.*image|不支持.*图片|图像输入/i.test(message);
}
