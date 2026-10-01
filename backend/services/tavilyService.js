const axios = require("axios");

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_URL = "https://api.tavily.com/search";

// Strips navigation/ad/metadata noise that leaks into scraped page content.
function cleanChunk(text) {
    if (!text) return "";

    return text
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/\b(subscribe|advertisement|cookie policy|accept cookies|sign up|log in|read more|click here|all rights reserved|terms of service|privacy policy)\b/gi, " ")
        .replace(/[|•]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Splits cleaned content into sentence-sized units for downstream ranking.
function splitIntoSentences(text) {
    if (!text) return [];
    return text
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 25 && s.split(/\s+/).length > 4);
}

async function searchTopic(topic) {
    if (!TAVILY_API_KEY) {
        return { ok: false, reason: "TAVILY_API_KEY not set" };
    }

    try {
        const response = await axios.post(
            TAVILY_URL,
            {
                api_key: TAVILY_API_KEY,
                query: topic,
                search_depth: "advanced",
                include_answer: false,
                include_raw_content: false,
                max_results: 5,
            },
            { timeout: 15000 }
        );

        const results = response.data?.results || [];
        if (!results.length) {
            return { ok: false, reason: "No search results returned" };
        }

        const seen = new Set();
        const sentences = [];

        for (const result of results) {
            const cleaned = cleanChunk(result.content);
            for (const sentence of splitIntoSentences(cleaned)) {
                const key = sentence.toLowerCase().replace(/\s+/g, " ");
                if (seen.has(key)) continue;
                seen.add(key);
                sentences.push(sentence);
            }
        }

        if (!sentences.length) {
            return { ok: false, reason: "No usable content after cleaning" };
        }

        // Per-result metadata (title/url/relevance score), preserved for the
        // source-preview feature. Built from the same response as the
        // sentences above - no second Tavily call.
        const rawResults = results.map((result) => ({
            title: result.title || "",
            url: result.url || "",
            content: result.content || "",
            score: typeof result.score === "number" ? result.score : 0,
        }));

        return { ok: true, sentences, rawResults };
    } catch (error) {
        console.error("Tavily searchTopic error:", error?.message || error);
        return { ok: false, reason: error?.message || "Tavily request failed" };
    }
}

module.exports = { searchTopic, cleanChunk, splitIntoSentences };
