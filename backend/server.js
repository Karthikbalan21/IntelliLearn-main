const http = require("http"); //import the http module, which is used to create the web server.
const crypto = require("crypto");
require("dotenv").config();
const { explainTopic, regenerateVisualIdeas, answerQuestion, generateQuiz } = require("./services/groqService"); //functions which send the topic or question to Groq AI and return the response.
const { searchTopic, cleanChunk, splitIntoSentences } = require("./services/tavilyService");
const { rankContent } = require("./services/pageRankService");
const { validateQuiz, randomizeOptionPositions } = require("./services/quizService");
const { sanitizeWebContent, detectPromptInjection } = require("./services/promptSecurity");
const { buildSourcePreview } = require("./services/sourceService");
const { generateTopicImage } = require("./services/imageGenerationService");

const PORT = process.env.PORT || 5000;

// Bridges the two-step "show sources, then generate from the ones the
// learner picked" flow: /api/sources runs the (expensive, rate-limited)
// Tavily search once and stashes its raw results here; /api/explain later
// looks them up by searchId instead of searching again, so choosing sources
// never costs a second Tavily call. Each entry is consumed on first use by
// /api/explain; anything left unclaimed (the learner never confirmed) is
// swept out after SEARCH_CACHE_TTL_MS so this doesn't grow unbounded.
const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;
function pruneSearchCache() {
    const cutoff = Date.now() - SEARCH_CACHE_TTL_MS;
    for (const [id, entry] of searchCache) {
        if (entry.createdAt < cutoff) searchCache.delete(id);
    }
}

// Reads and JSON-parses a request body, shared by every POST route below.
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}

// Tavily -> PageRank -> Groq, plus the Source Preview and Trust Indicator
// built from the same Tavily response. Falls back to a topic-only Groq
// explanation (and no sources) if Tavily is unconfigured or the search
// fails, so the app never breaks.
//
// When `searchId` names a still-cached /api/sources lookup, that lookup's
// raw results are reused instead of searching Tavily again - this is what
// lets the frontend show sources, let the learner pick some, and only then
// generate content, without a second search. When `selectedUrls` is also
// given (non-empty), only the raw results whose url is in that list feed
// the explanation; otherwise every fetched result is used, same as before
// the source-picking step existed.
async function buildLearningContent(topic, { searchId, selectedUrls, level } = {}) {
    let rawResults = null;
    let sources = [];

    if (searchId && searchCache.has(searchId)) {
        rawResults = searchCache.get(searchId).rawResults;
        searchCache.delete(searchId); // one-shot: this searchId has now been spent
        sources = buildSourcePreview(rawResults);
    } else {
        const searchResult = await searchTopic(topic);
        if (searchResult.ok) {
            rawResults = searchResult.rawResults;
            sources = buildSourcePreview(rawResults);
        } else {
            console.warn("Tavily unavailable, falling back to topic-only explanation:", searchResult.reason);
        }
    }

    let context = "";
    if (rawResults && rawResults.length) {
        // selectedUrls is an array whenever the learner went through the
        // pick-your-sources step - including an EMPTY array, when they
        // deliberately chose none, which should mean a topic-only
        // explanation, not silently falling back to every source found.
        // Only a genuinely absent selectedUrls (an older/direct caller
        // that never offered a choice) falls back to using everything.
        const pool = Array.isArray(selectedUrls)
            ? rawResults.filter((result) => selectedUrls.includes(result.url))
            : rawResults;

        const seen = new Set();
        const sentences = [];
        for (const result of pool) {
            const cleaned = cleanChunk(result.content);
            for (const sentence of splitIntoSentences(cleaned)) {
                const key = sentence.toLowerCase().replace(/\s+/g, " ");
                if (seen.has(key)) continue;
                seen.add(key);
                sentences.push(sentence);
            }
        }

        if (sentences.length) {
            // Security layer: sanitize untrusted web content (strip HTML/script,
            // normalize, cap length) and screen it for obvious instruction-
            // override attempts before it is ranked and handed to Groq.
            // Detection is advisory/logging only here - it never deletes
            // content, since legitimate educational text can also mention
            // these phrases. The actual defense is the instruction/data
            // separation applied inside explainTopic() (see groqService.js).
            const sanitizedSentences = sentences.map(sanitizeWebContent);
            detectPromptInjection(sanitizedSentences.join(" "));

            const rankedSentences = rankContent(sanitizedSentences);
            context = rankedSentences.join(" ");
        }
    }

    const explanation = await explainTopic(topic, context, level);
    return { explanation, sources };
}

const server = http.createServer((req, res) => { //create a web server, everytime the request comes, this callback will runs.

    // Allow React to access this backend
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle preflight request
    if (req.method === "OPTIONS") {
        res.writeHead(200); //HTTP status 200 OK
        res.end();
        return;
    }

    if (req.method === "GET" && req.url === "/") {//it is used to check whether the backend server is running correctly or not.

        res.writeHead(200, {
            "Content-Type": "text/plain"
        });

        res.end("Welcome to EDUCARE Backend");
    }

    // Sources Route: runs the Tavily search and returns the ranked Source
    // Preview / Trust Indicator only - no Groq call yet. The learner picks
    // which of these to keep, then /api/explain (below) is called with the
    // returned searchId so the explanation is generated from that same
    // search without paying for a second Tavily lookup.
    else if (req.method === "POST" && req.url === "/api/sources") {
        parseBody(req)
            .then(async (data) => {
                const topic = data.topic;
                if (!topic || !topic.trim()) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, message: "Please provide a topic." }));
                    return;
                }

                try {
                    pruneSearchCache();
                    const searchResult = await searchTopic(topic);
                    if (!searchResult.ok) {
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ success: true, sources: [], searchId: null }));
                        return;
                    }

                    const sources = buildSourcePreview(searchResult.rawResults);
                    const searchId = crypto.randomUUID();
                    searchCache.set(searchId, { rawResults: searchResult.rawResults, createdAt: Date.now() });

                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true, sources, searchId }));
                } catch (error) {
                    console.error("Sources route error:", error);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        success: false,
                        message: "Sorry, I couldn't fetch sources right now. Please try again."
                    }));
                }
            })
            .catch((error) => {
                console.error("Sources route body error:", error);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, message: "Invalid request body." }));
            });
    }
    // Explain Route
    else if (req.method === "POST" && req.url === "/api/explain") {
        parseBody(req)
            .then(async (data) => {
                const topic = data.topic;
                if (!topic || !topic.trim()) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, message: "Please provide a topic." }));
                    return;
                }

                try {
                    const { explanation, sources } = await buildLearningContent(topic, {
                        searchId: data.searchId,
                        selectedUrls: Array.isArray(data.selectedUrls) ? data.selectedUrls : undefined,
                        level: data.level,
                    });
                    const response = {
                        success: true,
                        title: topic,
                        explanation: explanation,
                        sources: sources
                    };
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(response));
                } catch (error) {
                    console.error("Explain route error:", error?.message || error);
                    res.writeHead(error?.code === "AI_PROVIDER_UNAVAILABLE" ? 502 : 500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        success: false,
                        message: error?.code === "AI_PROVIDER_UNAVAILABLE"
                            ? error.message
                            : "Sorry, I couldn't prepare the explanation right now. Check the backend logs and try again."
                    }));
                }
            })
            .catch((error) => {
                console.error("Explain route body error:", error);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, message: "Invalid request body." }));
            });
    }
    else if (req.method === "POST" && req.url === "/api/visuals/regenerate") {
        parseBody(req)
            .then(async (data) => {
                const topic = typeof data.topic === "string" ? data.topic.trim() : "";
                const content = typeof data.content === "string" ? data.content.trim() : "";
                const supportedTypes = ["map", "path", "points"];

                if (!topic || !content || !supportedTypes.includes(data.visualType)) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, message: "Topic, lesson content, and a supported visual type are required." }));
                    return;
                }

                if (topic.length > 300 || content.length > 12000) {
                    res.writeHead(413, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, message: "The topic or lesson content is too long to regenerate." }));
                    return;
                }

                const previousIdeas = Array.isArray(data.previousIdeas)
                    ? data.previousIdeas.filter((idea) => typeof idea === "string").slice(0, 6)
                    : [];

                try {
                    const ideas = await regenerateVisualIdeas(topic, content, data.visualType, previousIdeas);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true, ideas }));
                } catch (error) {
                    console.error("Visual regeneration route error:", error?.message || error);
                    res.writeHead(502, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        success: false,
                        message: "Unable to generate different visual content right now. Please try again.",
                    }));
                }
            })
            .catch((error) => {
                console.error("Visual regeneration body error:", error);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, message: "Invalid request body." }));
            });
    }
    else if (req.method === "POST" && req.url === "/api/images/generate") {
        parseBody(req)
            .then(async (data) => {
                const topic = typeof data.topic === "string" ? data.topic.trim() : "";
                const explanation = typeof data.content === "string" ? data.content.trim() : "";
                if (!topic || topic.length > 300) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, message: "Enter a topic of 1 to 300 characters." }));
                    return;
                }
                if (explanation.length > 12000) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, message: "The explanation is too long to use for an image." }));
                    return;
                }

                try {
                    const imageDataUrl = await generateTopicImage(topic, explanation);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true, imageDataUrl }));
                } catch (error) {
                    console.error("Image generation route error:", error?.code || error?.message || error);
                    const isUnconfigured = error?.code === "IMAGE_PROVIDER_NOT_CONFIGURED";
                    const isRateLimited = error?.code === "IMAGE_PROVIDER_RATE_LIMIT";
                    res.writeHead(isUnconfigured ? 503 : isRateLimited ? 429 : 502, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        success: false,
                        message: isUnconfigured
                            ? "AI image generation needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in backend/.env. Add them and restart the backend."
                            : error?.code === "IMAGE_PROVIDER_AUTH_ERROR"
                                ? "Cloudflare rejected the Workers AI credentials. Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in backend/.env."
                                    : isRateLimited
                                        ? "The image provider is rate-limiting requests. Wait a moment, then try again."
                                : "Image generation failed. Check the backend logs and try again.",
                    }));
                }
            })
            .catch((error) => {
                console.error("Image generation body error:", error);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, message: "Invalid request body." }));
            });
    }
    else if (req.method === "POST" && req.url === "/api/qa") {
        parseBody(req)
            .then(async (data) => {
                const topic = data.topic;
                const question = data.question;
                const content = data.content || "";

                try {
                    const answer = await answerQuestion(topic, question, content);
                    const response = {
                        success: true,
                        answer: answer
                    };
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(response));
                } catch (error) {
                    console.error("QA route error:", error);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        success: false,
                        message: "Sorry, I couldn't prepare an answer right now. Please try again."
                    }));
                }
            })
            .catch((error) => {
                console.error("QA route body error:", error);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, message: "Invalid request body." }));
            });
    }
    // Quiz generation route
    else if (req.method === "POST" && req.url === "/api/quiz/generate") {
        parseBody(req)
            .then(async (data) => {
                const topic = data.topic;
                const content = data.content;

                if (!topic || !content) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, message: "Topic and content are required to build a quiz." }));
                    return;
                }

                try {
                    const quizJson = await generateQuiz(topic, content);
                    const questions = randomizeOptionPositions(validateQuiz(quizJson));
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true, questions }));
                } catch (error) {
                    console.error("Quiz generate route error:", error);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        success: false,
                        message: "I couldn't create the quiz right now. Would you like to try again?"
                    }));
                }
            })
            .catch((error) => {
                console.error("Quiz generate body error:", error);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, message: "Invalid request body." }));
            });
    }
    else {

        res.writeHead(404, {
            "Content-Type": "text/plain"
        });

        res.end("Route Not Found");

    }

});

server.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);

});
