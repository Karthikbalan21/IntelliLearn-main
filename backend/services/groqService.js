const Groq = require("groq-sdk");//import the groq library
const { buildSecureUserMessage, withSecurityInstructions, validateAIOutput } = require("./promptSecurity");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY, // create the client & reads my api key from the .env file
});
// Allow choosing model via environment variable to avoid hard-coding inaccessible models
const modelName = process.env.GROQ_MODEL;
if (!modelName) {
    console.error("Environment variable GROQ_MODEL is not set. Please set it to a model name your account can access.");
}

function sanitizeExplanation(text) { 
    if (!text) return "";

    return text
        .replace(/^\s*([*\-•]|\d+[.)]|[#>])\s*/gm, "")
        .replace(/[`*_#~>/]/g, "")
        .replace(/[^\p{L}\p{N}\s.,!?;:'()\n-]/gu, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const GROUNDED_SYSTEM_PROMPT = "You are an accessible AI tutor for visually impaired learners. Using ONLY the provided source information, create a clear, well-developed, and accurate explanation of the requested topic. Requirements: use simple language; cover the important concepts in enough depth that a learner really understands them, not just a surface summary; use short sentences suitable for text-to-speech; organize the explanation logically; include important definitions; include an example when useful; do not introduce unsupported facts; avoid unnecessary technical jargon; make the explanation suitable for a learner hearing the content rather than reading it. Aim for around 20 to 25 short lines. Do not use headings, bullet points, or numbered lists. Conclude with a single sentence summarizing the main idea.";

const TOPIC_ONLY_SYSTEM_PROMPT = "You are an experienced university professor and an accessibility expert teaching visually impaired students. Explain the topic in simple, clear, and conversational English that is easy to understand when heard through text-to-speech. Begin with a brief definition of the topic, then explain the most important key concepts in a logical and engaging manner, with enough detail that a learner really understands them rather than just a surface summary. Aim for around 20 to 25 short lines, avoiding unnecessary technical jargon, and immediately explain any technical term that must be used. Include one or two simple real-world examples that help learners connect the concept to everyday life. If the topic involves diagrams, graphs, formulas, tables, or visual elements, describe them verbally instead of referring to their appearance so that visually impaired students can easily understand them. Ensure the explanation flows naturally like a professor teaching a beginner in a classroom, without using headings, bullet points, or numbered lists. Conclude with a single sentence summarizing the main idea. The explanation should be accurate, engaging, educational, and optimized for visually impaired students listening through text-to-speech.";

const VISUAL_REGENERATION_PROMPT = "Create new educational content for a visual learning aid using ONLY the supplied lesson. Return a JSON object with an 'ideas' array containing up to 6 concise, distinct ideas. Make these ideas meaningfully different from the ideas already shown, not simple paraphrases; choose other supported details, examples, causes, or relationships from the lesson. Never invent facts. For a learning_path, preserve the lesson's logical order. For a concept_map or key_points view, choose a useful order based on the lesson. If the lesson has fewer unused ideas, return only the genuinely distinct ideas available. Return no markdown or text outside the JSON object.";

//async - because the function will communicate with the groq api, and it will take some time to respond,
async function explainTopic(topic, context = "", level = "student") {
    try {
        if (!modelName) throw new Error("GROQ_MODEL not set");

        const useGrounded = Boolean(context && context.trim());
        const safeLevel = ["beginner", "student", "advanced"].includes(level) ? level : "student";
        const levelInstructions = {
            beginner: "Teach at beginner level. Assume no prior knowledge, define unfamiliar words, and use a familiar everyday example.",
            student: "Teach at student level. Explain core terminology and relationships clearly, with enough academic detail for a learner studying the subject.",
            advanced: "Teach at advanced level. Include deeper technical detail, precise terminology, and relevant nuance while keeping the explanation clear when heard aloud.",
        };
        const baseSystemPrompt = useGrounded
            ? withSecurityInstructions(GROUNDED_SYSTEM_PROMPT)
            : TOPIC_ONLY_SYSTEM_PROMPT;
        const createParams = {
            messages: [
                {
                    role: "system",
                    // Security layer: when grounded on Tavily content, the
                    // system prompt is prefixed with instructions telling
                    // Groq to treat that content strictly as untrusted data
                    // (see promptSecurity.js). The topic-only fallback path
                    // never sees web content, so it needs no wrapping.
                    content: `${baseSystemPrompt}\n\nRequested teaching level: ${safeLevel}. ${levelInstructions[safeLevel]}`
                },
                {
                    role: "user",
                    // Security layer: untrusted Tavily content is fenced off
                    // from the trusted topic with explicit delimiters,
                    // never interpolated as free-form instructions.
                    content: useGrounded
                        ? buildSecureUserMessage(topic, context)
                        : topic
                }
            ],
            max_tokens: 950,
            model: modelName,
        };

        const chatCompletion = await groq.chat.completions.create(createParams);
        const explanation = sanitizeExplanation(chatCompletion.choices[0].message.content || "");

        // Security layer: validate the model's own output before it is ever
        // returned, in case an injection attempt (or anything else) caused
        // it to leak something it shouldn't.
        const validation = validateAIOutput(explanation);
        if (!validation.safe) {
            console.warn("Groq explainTopic: output failed safety validation, returning safe fallback message.");
            return "Sorry, I couldn't generate a safe explanation. Please try again.";
        }

        console.log(explanation);
        console.log("Word Count:", explanation.split(/\s+/).length);
        return explanation;
    }
    catch (error) {
        console.error("Groq explainTopic error:", error?.status || error?.code || error?.message || error);
        const failure = new Error(
            !modelName
                ? "GROQ_MODEL is missing from backend/.env."
                : error?.status === 401 || error?.status === 403
                    ? "Groq rejected the API key. Check GROQ_API_KEY in backend/.env."
                    : error?.status === 404
                        ? "Groq could not find this model. Check GROQ_MODEL in backend/.env."
                        : error?.status === 429
                            ? "Groq rate limit reached. Please wait and try again."
                            : !error?.status
                                ? "Cannot connect to Groq. Check the backend's internet access and try again."
                                : `Groq request failed with HTTP ${error.status}. Check backend logs.`,
        );
        failure.code = "AI_PROVIDER_UNAVAILABLE";
        throw failure;
    }
}

async function regenerateVisualIdeas(topic, content, visualType, previousIdeas = []) {
    if (!modelName) throw new Error("GROQ_MODEL not set");

    const visualData = JSON.stringify({
        lessonContent: content.slice(0, 12000),
        visualType,
        ideasAlreadyShown: previousIdeas.slice(0, 6),
    });
    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: withSecurityInstructions(VISUAL_REGENERATION_PROMPT),
            },
            {
                role: "user",
                content: buildSecureUserMessage(topic, visualData),
            },
        ],
        max_tokens: 600,
        model: modelName,
        response_format: { type: "json_object" },
    });

    const rawOutput = completion.choices[0].message.content || "{}";
    const parsedOutput = JSON.parse(rawOutput);
    if (!Array.isArray(parsedOutput.ideas)) {
        throw new Error("The visual generator returned an invalid response.");
    }

    const previousSet = new Set(previousIdeas.map((idea) => idea.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()));
    const distinctIdeas = parsedOutput.ideas
        .filter((idea) => typeof idea === "string")
        .map((idea) => sanitizeExplanation(idea).replace(/\s+/g, " ").trim().slice(0, 250))
        .filter((idea) => {
            const normalizedIdea = idea.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
            return idea && !previousSet.has(normalizedIdea);
        });
    const ideas = [...new Set(distinctIdeas)].slice(0, 6);

    if (!ideas.length) {
        throw new Error("The visual generator did not return any new ideas.");
    }

    const validation = validateAIOutput(ideas.join(" "));
    if (!validation.safe) {
        throw new Error("The generated visual content did not pass safety validation.");
    }

    return ideas;
}

async function answerQuestion(topic, question, context = "") {
    try {
        if (!modelName) throw new Error("GROQ_MODEL not set");
        const qaParams = {
            messages: [
                {
                    role: "system",
                    content: "You are a helpful, accessible tutor for a visually impaired learner. Answer the user's question clearly, simply, and concisely, grounded in the topic and the explanation already given to them. Keep the answer suitable for text-to-speech: short sentences, no headings, no bullet points, no markdown."
                },
                {
                    role: "user",
                    content: context && context.trim()
                        ? `Topic: ${topic}\nExplanation already given to the learner:\n${context}\n\nQuestion: ${question}`
                        : `Topic: ${topic}\nQuestion: ${question}`
                }
            ],
            max_tokens: 700,
            model: modelName,
        };

        const chatCompletion = await groq.chat.completions.create(qaParams);

        return sanitizeExplanation(chatCompletion.choices[0].message.content || "");
    } catch (error) {
        console.error("Groq answerQuestion error:", error?.message || error);
        if (error?.stack) console.error(error.stack);
        return "Sorry, I could not answer that question (check backend logs).";
    }
}

async function requestQuizJson(topic, content) {
    const quizParams = {
        messages: [
            {
                role: "system",
                content: "You are an accessible quiz generator for a visually impaired learner. Based ONLY on the given topic and content, create exactly 3 multiple-choice questions that test understanding of the material. Each question must have 4 distinct, plausible options with no duplicate or near-duplicate text. Vary which letter (A, B, C, or D) holds the correct answer across the 3 questions - do not place the correct answer on the same letter every time, and do not default to A. Respond with ONLY a JSON object of this exact shape, no other text: {\"questions\":[{\"question\":\"...\",\"options\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},\"correctAnswer\":\"<the letter A, B, C, or D of the correct option>\",\"explanation\":\"...\"}]}. The array must contain exactly 3 items. Keep question text, options, and explanations short and suitable for text-to-speech."
            },
            {
                role: "user",
                content: `Topic: ${topic}\n\nContent taught to the learner:\n${content}`
            }
        ],
        max_tokens: 900,
        model: modelName,
        response_format: { type: "json_object" },
    };

    const chatCompletion = await groq.chat.completions.create(quizParams);
    const raw = chatCompletion.choices[0].message.content || "{}";
    return JSON.parse(raw);
}

async function generateQuiz(topic, content) {
    if (!modelName) throw new Error("GROQ_MODEL not set");

    try {
        return await requestQuizJson(topic, content);
    } catch (error) {
        console.warn("Groq generateQuiz first attempt failed, retrying:", error?.message || error);
        return await requestQuizJson(topic, content);
    }
}

module.exports = { explainTopic, regenerateVisualIdeas, answerQuestion, generateQuiz };
