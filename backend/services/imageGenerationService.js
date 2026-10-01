const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

async function generateTopicImage(topic, explanation = "") {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
        const error = new Error("Cloudflare Workers AI credentials are not configured.");
        error.code = "IMAGE_PROVIDER_NOT_CONFIGURED";
        throw error;
    }

    const normalizedTopic = topic.trim().replace(/[.!?]+$/, "");
    const explanationLines = typeof explanation === "string"
        ? explanation
            .split(/\r?\n/)
            .map((line) => line
                .replace(/^\s*(?:#{1,6}\s*|[-*+]\s+|\d+[.)]\s+)/, "")
                .replace(/[`*_~]/g, "")
                .trim())
            .filter(Boolean)
        : [];
    const selectedExplanationLines = explanationLines.length >= 3
        ? explanationLines.slice(0, 4)
        : explanationLines.join(" ").split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 4);
    const explanationContext = selectedExplanationLines.join(" ");
    const promptPrefix = `Educational illustration about ${normalizedTopic}. Tutor explanation: `;
    const topicGuidance = /^(next\s*\.?\s*js|nextjs)$/i.test(normalizedTopic)
        ? " Include the recognizable Next.js brand mark and wordmark with web-development imagery."
        : " For a named product, framework, organization, or app, include its recognizable logo or brand mark when relevant; for general concepts, show representative subject imagery.";
    const promptSuffix = `. Show specific objects, steps, or relationships from the explanation and keep ${normalizedTopic} central. Simple, clear composition with accessible contrast. No unrelated scenery.${topicGuidance} Avoid extra labels, borders, and watermarks.`;
    const availableContextLength = Math.max(0, 2048 - promptPrefix.length - promptSuffix.length);
    const context = explanationContext
        ? explanationContext.slice(0, availableContextLength)
        : "Use concrete visual details directly about the named topic".slice(0, availableContextLength);
    const prompt = `${promptPrefix}${context}${promptSuffix}`;

    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${IMAGE_MODEL}`;
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt }),
            signal: AbortSignal.timeout(120000),
        });
    } catch {
        const error = new Error("Could not connect to the image generation provider.");
        error.code = "IMAGE_PROVIDER_UNAVAILABLE";
        throw error;
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
        const providerError = result.errors?.[0];
        const providerCode = providerError?.code;
        const error = new Error(`Image provider returned HTTP ${response.status}.`);
        error.providerCode = providerCode;
        error.code = response.status === 401 || response.status === 403
            ? "IMAGE_PROVIDER_AUTH_ERROR"
            : response.status === 429
                ? "IMAGE_PROVIDER_RATE_LIMIT"
                : "IMAGE_PROVIDER_ERROR";
        const providerMessage = typeof providerError?.message === "string"
            ? providerError.message.slice(0, 300)
            : "unknown";
        console.error("Cloudflare Workers AI image API error:", response.status, providerCode || "unknown", providerMessage);
        throw error;
    }

    const imageBase64 = result.result?.image;
    if (!imageBase64) {
        console.error("Cloudflare Workers AI returned no image data. Response fields:", Object.keys(result.result || {}));
        const error = new Error("The image provider returned no image data.");
        error.code = "IMAGE_PROVIDER_ERROR";
        throw error;
    }

    return `data:image/jpeg;base64,${imageBase64}`;
}

module.exports = { generateTopicImage };
