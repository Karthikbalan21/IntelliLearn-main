const { sanitizeWebContent, detectPromptInjection } = require("./promptSecurity");

const MAX_SOURCES = 5;

const OFFICIAL_ROOT_DOMAINS = [
    "apache.org", "oracle.com", "microsoft.com", "google.com", "mozilla.org",
    "python.org", "nodejs.org", "w3.org", "ietf.org", "reactjs.org",
    "react.dev", "kubernetes.io", "docker.com",
];
const RECOGNIZED_ORG_DOMAINS = ["github.com", "stackoverflow.com", "ieee.org", "who.int", "un.org"];
const REFERENCE_DOMAINS = ["wikipedia.org", "britannica.com"];
const EDUCATIONAL_DOMAINS = [
    "tutorialspoint.com", "geeksforgeeks.org", "w3schools.com",
    "javatpoint.com", "freecodecamp.org", "khanacademy.org",
];

const SELF_PUBLISHING_DOMAINS = [
    "blogspot.com", "wordpress.com", "medium.com", "wix.com",
    "weebly.com", "tumblr.com", "substack.com",
];

//This function is used to extract the domain name from the hostname.
//example: www.microsoft.com => microsoft.com
function getRegistrableDomain(hostname) {
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join(".");
}
//checks whether the root domain is present in the list of recognized domains.
function matchesRoot(rootDomain, list) {
    return list.includes(rootDomain);
}

function isGovernmentTld(hostname) {
    return /\.gov(\.[a-z]{2})?$/i.test(hostname);
}

function isAcademicTld(hostname) {
    return /\.edu(\.[a-z]{2})?$/i.test(hostname) || /\.ac\.[a-z]{2}$/i.test(hostname);
}

function isOfficialDocsSubdomain(hostname) {
    return /^(docs|developer|dev)\./i.test(hostname);
}

/**
 * @returns {{ trustLevel: string, trustScore: number|null, sourceType: string, domain: string }}
 */
function classifyTrust(url, { suspicious = false } = {}) {
    let hostname;
    try {
        hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch (error) {
        return { trustLevel: "UNKNOWN", trustScore: null, sourceType: "Unknown Source", domain: "" };
    }

    const root = getRegistrableDomain(hostname);
    let base;
    let sourceType;

    if (isGovernmentTld(hostname)) {
        base = 90;
        sourceType = "Government Source";
    } else if (isAcademicTld(hostname)) {
        base = 88;
        sourceType = "University / Academic Source";
    } else if (isOfficialDocsSubdomain(hostname) || matchesRoot(root, OFFICIAL_ROOT_DOMAINS)) {
        base = 85;
        sourceType = "Official Documentation";
    } else if (matchesRoot(root, RECOGNIZED_ORG_DOMAINS)) {
        base = 65;
        sourceType = "Recognized Organization";
    } else if (matchesRoot(root, REFERENCE_DOMAINS)) {
        base = 55;
        sourceType = "Reference Source";
    } else if (matchesRoot(root, EDUCATIONAL_DOMAINS)) {
        base = 50;
        sourceType = "Educational Website";
    } else if (matchesRoot(root, SELF_PUBLISHING_DOMAINS)) {
        base = 30;
        sourceType = "User-Published Content";
    } else {
        base = 50;
        sourceType = "General Website";
    }

    const isHttps = url.toLowerCase().startsWith("https://");
    let score = base + (isHttps ? 5 : -15); // no HTTPS today is a real red flag, not a rounding error
    if (suspicious) score -= 20; // lowered, never blocked - see buildSourcePreview()

    score = Math.max(0, Math.min(100, score));

    let trustLevel;
    if (score >= 70) trustLevel = "HIGH";
    else if (score >= 40) trustLevel = "MEDIUM";
    else trustLevel = "LOW";

    return { trustLevel, trustScore: score, sourceType, domain: hostname };
}

/**
 * Ranks and de-duplicates Tavily's raw results into a clean top-N source
 * list with trust metadata attached. Never fabricates sources - returns
 * fewer than MAX_SOURCES if fewer usable results exist.
 * @param {Array<{title:string, url:string, content:string, score:number}>} rawResults
 * @returns {Array<{title:string, url:string, domain:string, sourceType:string, trustLevel:string, trustScore:number|null}>}
 */
function buildSourcePreview(rawResults) {
    if (!Array.isArray(rawResults) || !rawResults.length) return [];

    const scored = [];
    const seenDomains = new Set();

    for (const result of rawResults) {
        if (!result.url || !result.title) continue;

        const sanitizedTitle = sanitizeWebContent(result.title);
        const { suspicious } = detectPromptInjection(`${sanitizedTitle} ${result.content || ""}`);

        const { trustLevel, trustScore, sourceType, domain } = classifyTrust(result.url, { suspicious });
        if (!domain) continue; // unparseable URL - skip rather than guess a source

        if (seenDomains.has(domain)) continue; // avoid duplicate domains
        seenDomains.add(domain);

        const relevance = typeof result.score === "number" ? result.score : 0;
        const trustComponent = trustScore === null ? 0.3 : trustScore / 100;
        const rank = relevance * 0.6 + trustComponent * 0.4;

        scored.push({
            title: sanitizedTitle || domain,
            url: result.url,
            domain,
            sourceType,
            trustLevel,
            trustScore,
            _rank: rank,
        });
    }

    scored.sort((a, b) => b._rank - a._rank);

    return scored.slice(0, MAX_SOURCES).map(({ _rank, ...source }) => source);
}

module.exports = { buildSourcePreview };
