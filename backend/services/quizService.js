const VALID_LETTERS = ["A", "B", "C", "D"];


function validateQuiz(quizJson) {
    const questions = quizJson?.questions;
    if (!Array.isArray(questions) || questions.length !== 3) {
        throw new Error("Quiz must contain exactly 3 questions");
    }
    questions.forEach((q, i) => {
        if (!q.question || typeof q.question !== "string") {
            throw new Error(`Question ${i + 1} is missing its question text`);
        }
        if (!q.options || VALID_LETTERS.some((letter) => !q.options[letter])) {
            throw new Error(`Question ${i + 1} is missing one or more options`);
        }
        if (!VALID_LETTERS.includes(q.correctAnswer)) {
            throw new Error(`Question ${i + 1} has an invalid correctAnswer`);
        }
        if (!q.explanation || typeof q.explanation !== "string") {
            throw new Error(`Question ${i + 1} is missing an explanation`);
        }
    });
    return questions;
}

function scoreQuiz(results) {
    const correct = results.filter((r) => r.isCorrect).length;
    return { correct, total: 3, score: correct / 3 };
}
function shuffleArray(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// LLM-generated quizzes tend to place the correct answer on option A far
// more often than chance. This re-shuffles each question's option order so
// the correct answer's letter is genuinely randomized across A/B/C/D,
// independent of whatever the model produced.
function randomizeOptionPositions(questions) {
    return questions.map((q) => {
        const entries = VALID_LETTERS.map((letter) => ({
            text: q.options[letter],
            isCorrect: letter === q.correctAnswer,
        }));
        const shuffled = shuffleArray(entries);
        const options = {};
        let correctAnswer = q.correctAnswer;
        shuffled.forEach((entry, index) => {
            const letter = VALID_LETTERS[index];
            options[letter] = entry.text;
            if (entry.isCorrect) correctAnswer = letter;
        });
        return { ...q, options, correctAnswer };
    });
}

module.exports = { validateQuiz, scoreQuiz, randomizeOptionPositions };