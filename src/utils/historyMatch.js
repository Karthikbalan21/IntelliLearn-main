// Matches a spoken phrase like "I want to learn Machine Learning again"
// against stored history titles like "Introduction to Machine Learning",
// without requiring an exact or complete-title match.

const FILLER_WORDS = new Set([
    "open", "show", "my", "previous", "lesson", "topic", "learn", "again",
    "i", "want", "to", "the", "a", "an", "on", "of", "for", "about",
    "please", "tell", "me", "that", "this", "is", "was", "revisit",
    "study", "studied", "reopen", "load", "old", "earlier", "go",
]);

function tokenize(text) {
    return (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

// Lowercased, punctuation-stripped, filler-stripped keywords.
function meaningfulWords(text) {
    return tokenize(text).filter((word) => !FILLER_WORDS.has(word));
}

function titleCase(words) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function evaluateMatch(queryWords, title) {
    const titleWords = meaningfulWords(title);
    if (!queryWords.length || !titleWords.length) {
        return { score: 0, queryCoverage: 0 };
    }

    const titleSet = new Set(titleWords);
    const overlap = queryWords.filter((word) => titleSet.has(word)).length;

    const queryCoverage = overlap / queryWords.length; // how much of what they said is in the title
    const titleCoverage = overlap / titleSet.size;      // how much of the title they covered

    return { score: queryCoverage * 0.65 + titleCoverage * 0.35, queryCoverage };
}

const MIN_QUERY_COVERAGE = 0.5; // at least half the spoken meaningful words must appear in the title
const AMBIGUITY_GAP = 0.12;     // scores within this margin of the top score are treated as a tie

/**
 * Finds the best history item(s) matching a spoken phrase.
 * @param {Array<{title: string}>} history
 * @param {string} spokenText
 * @returns {{status: "match", item: object} | {status: "ambiguous", items: object[], queryLabel: string} | {status: "none"}}
 */
export function matchHistoryTopic(history, spokenText) {
    const queryWords = meaningfulWords(spokenText);
    if (!queryWords.length || !Array.isArray(history) || !history.length) {
        return { status: "none" };
    }

    const scored = history
        .map((item) => ({ item, ...evaluateMatch(queryWords, item.title || "") }))
        .filter((entry) => entry.score > 0 && entry.queryCoverage >= MIN_QUERY_COVERAGE)
        .sort((a, b) => b.score - a.score);

    if (!scored.length) return { status: "none" };
    if (scored.length === 1) return { status: "match", item: scored[0].item };

    const top = scored[0];
    const tied = scored.filter((entry) => top.score - entry.score < AMBIGUITY_GAP);

    if (tied.length > 1) {
        return { status: "ambiguous", items: tied.map((entry) => entry.item), queryLabel: titleCase(queryWords) };
    }

    return { status: "match", item: top.item };
}
