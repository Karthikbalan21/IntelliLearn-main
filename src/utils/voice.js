// Picks a female-sounding voice for the browser's SpeechSynthesis API so the
// whole app speaks in one consistent voice instead of the OS/browser default
// (which is often male). Voice lists load asynchronously in some browsers,
// so we cache and refresh via the "voiceschanged" event.

const FEMALE_NAME_HINTS = [
    "female", "zira", "heera", "veena", "susan", "samantha", "victoria",
    "karen", "moira", "tessa", "fiona", "aria", "jenny", "salli", "joanna",
    "kendra", "kimberly", "ivy", "raveena", "google us english",
    "google uk english female", "emma", "ava", "michelle", "hazel",
    "sonia", "libby", "natasha", "catherine", "linda",
];

const MALE_NAME_HINTS = [
    "male", "ravi", "david", "mark", "george", "james", "daniel", "guy",
    "matthew", "brian", "russell", "andrew", "christopher", "eric", "roger",
    "google uk english male",
];

let cachedVoices = [];

function refreshVoices() {
    if (typeof window === "undefined" || !window.speechSynthesis) return [];
    cachedVoices = window.speechSynthesis.getVoices() || [];
    return cachedVoices;
}

if (typeof window !== "undefined" && window.speechSynthesis) {
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function scoreVoice(voice) {
    const name = voice.name.toLowerCase();
    const lang = (voice.lang || "").toLowerCase();

    if (MALE_NAME_HINTS.some((hint) => name.includes(hint))) return -1;

    let score = 0;
    if (FEMALE_NAME_HINTS.some((hint) => name.includes(hint))) score += 10;
    if (lang.startsWith("en-in")) score += 5;
    else if (lang.startsWith("en")) score += 2;

    return score;
}

// Best available female-sounding English voice, preferring en-IN. Returns
// null if no voices are loaded yet or none score as female.
export function getPreferredFemaleVoice() {
    const voices = cachedVoices.length ? cachedVoices : refreshVoices();
    if (!voices.length) return null;

    const englishVoices = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
    const pool = englishVoices.length ? englishVoices : voices;

    const ranked = pool
        .map((voice) => ({ voice, score: scoreVoice(voice) }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score);

    return ranked.length ? ranked[0].voice : null;
}

function isFemaleNamed(voice) {
    const name = voice.name.toLowerCase();
    return FEMALE_NAME_HINTS.some((hint) => name.includes(hint));
}

// Applies the preferred female voice (and its matching lang) to an
// utterance, and owns utterance.pitch entirely - callers should not set
// pitch themselves. Falls back to fallbackLang with no explicit voice if
// none is available. When the best available voice isn't explicitly
// female-labeled (some OS/browser combos only ship one generic voice), the
// pitch is nudged up so the app still reads as consistently female rather
// than silently falling back to a flat/male-sounding default.
export function applyFemaleVoice(utterance, fallbackLang = "en-IN") {
    const voice = getPreferredFemaleVoice();
    if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.pitch = isFemaleNamed(voice) ? 1 : 1.15;
    } else {
        utterance.lang = fallbackLang;
        utterance.pitch = 1.15;
    }
}
