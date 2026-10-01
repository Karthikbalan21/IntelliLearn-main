const LETTER_WORDS = {
    a: "A", first: "A", one: "A",
    b: "B", second: "B", two: "B",
    c: "C", third: "C", three: "C",
    d: "D", fourth: "D", four: "D",
};

// Normalizes spoken/typed quiz answers ("A", "option A", "the first one", "b")
// into a canonical "A" | "B" | "C" | "D", or null if nothing recognizable.
export function normalizeAnswer(input) {
    if (!input) return null;

    const cleaned = input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return null;

    // Single-letter answers like "a" or "option a"
    const letterMatch = cleaned.match(/\b([a-d])\b/);
    if (letterMatch) return letterMatch[1].toUpperCase();

    for (const word of cleaned.split(" ")) {
        if (LETTER_WORDS[word]) return LETTER_WORDS[word];
    }

    return null;
}

const CORRECT_PHRASES = [
    "Excellent! That's correct.",
    "Great job! You got it right.",
    "Well done! You're learning quickly.",
    "Fantastic! That's the correct answer.",
];

export function randomCorrectPhrase() {
    return CORRECT_PHRASES[Math.floor(Math.random() * CORRECT_PHRASES.length)];
}

export function incorrectPhrase(correctLetter, correctText, explanation) {
    return `That's not quite right. The correct answer is ${correctLetter}, ${correctText}. ${explanation}`;
}

export function scoreMessage(correct, total = 3) {
    if (correct === total) {
        return `Excellent! You scored ${correct} out of ${total}. Fantastic work! You have mastered this topic.`;
    }
    if (correct === 0) {
        return `Quiz completed. Your score is ${correct} out of ${total}. Don't worry, keep learning and try again.`;
    }
    return `Quiz completed. Your score is ${correct} out of ${total}. Good effort! Keep learning and try again.`;
}
