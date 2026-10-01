const STOPWORDS = new Set([
    "a", "an", "the", "and", "or", "but", "if", "then", "so", "of", "at", "by",
    "for", "with", "about", "against", "between", "into", "through", "during",
    "before", "after", "above", "below", "to", "from", "up", "down", "in", "out",
    "on", "off", "over", "under", "again", "further", "once", "is", "are", "was",
    "were", "be", "been", "being", "have", "has", "had", "having", "do", "does",
    "did", "doing", "would", "should", "could", "can", "will", "shall", "may",
    "might", "must", "it", "its", "this", "that", "these", "those", "as", "not",
    "no", "nor", "too", "very", "just", "also", "such", "than", "he", "she",
    "they", "we", "you", "i", "his", "her", "their", "our", "your", "them",
    "us", "who", "whom", "which", "what", "when", "where", "why", "how", "all",
    "any", "both", "each", "few", "more", "most", "other", "some", "only",
    "own", "same",
]);

function tokenize(sentence) { //convert a sentence into a list of meaningful words.
    return sentence
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function buildTfIdfVectors(tokenizedSentences) { //Represents every sentence into a numerical form, because algorithm finds the similarity between numbers
    const df = new Map();
    tokenizedSentences.forEach((tokens) => {
        const seen = new Set(tokens);
        seen.forEach((token) => df.set(token, (df.get(token) || 0) + 1));
    });

    const n = tokenizedSentences.length; //stores the total no. of sentences

    return tokenizedSentences.map((tokens) => {
        const tf = new Map();
        tokens.forEach((token) => tf.set(token, (tf.get(token) || 0) + 1));

        const vector = new Map();
        tf.forEach((count, token) => {
            const idf = Math.log(n / (1 + df.get(token)));
            vector.set(token, (count / tokens.length) * idf);
        });
        return vector;
    });
}

//Find how similar are two sentences
function cosineSimilarity(vecA, vecB) { 
    let dot = 0;
    let normA = 0;
    let normB = 0;

    vecA.forEach((value, key) => {
        normA += value * value;
        if (vecB.has(key)) dot += value * vecB.get(key);
    });
    vecB.forEach((value) => {
        normB += value * value;
    });

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildSimilarityMatrix(vectors) {
    const n = vectors.length;
    const matrix = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const sim = cosineSimilarity(vectors[i], vectors[j]);
            matrix[i][j] = sim;
            matrix[j][i] = sim;
        }
    }
    return matrix;
}

//analyze every sentences and find which sentences are more important.
function computePageRank(matrix, damping = 0.85, maxIterations = 40, tolerance = 1e-4) {
    const n = matrix.length;
    if (n === 0) return [];

    const rowSums = matrix.map((row) => row.reduce((a, b) => a + b, 0));
    let scores = new Array(n).fill(1 / n); //initiale stage the algoithm gives all sentence as equal.

    for (let iter = 0; iter < maxIterations; iter++) {
        const next = new Array(n).fill((1 - damping) / n);

        for (let j = 0; j < n; j++) {
            if (rowSums[j] === 0) continue;
            for (let i = 0; i < n; i++) {
                if (matrix[j][i] === 0) 
                    continue; // if the sentences has no similarity then skip the iteration
                next[i] += damping * (matrix[j][i] / rowSums[j]) * scores[j];
            }
        }

        const delta = next.reduce((sum, val, idx) => sum + Math.abs(val - scores[idx]), 0);
        scores = next;
        if (delta < tolerance) break;
    }

    return scores;
}


function rankContent(sentences, maxSentences = 14) {
    if (!Array.isArray(sentences) || sentences.length === 0) return [];

    if (sentences.length <= 3) return sentences;

    const tokenized = sentences.map(tokenize);
    const vectors = buildTfIdfVectors(tokenized);
    const matrix = buildSimilarityMatrix(vectors);
    const scores = computePageRank(matrix);

    const targetCount = Math.min(maxSentences, Math.max(6, Math.ceil(sentences.length * 0.4)));

    const rankedIndices = scores
        .map((score, index) => ({ score, index }))
        .sort((a, b) => b.score - a.score)
        .slice(0, targetCount)
        .map((entry) => entry.index)
        .sort((a, b) => a - b); // restore original order

    return rankedIndices.map((index) => sentences[index]);
}

module.exports = { rankContent };
