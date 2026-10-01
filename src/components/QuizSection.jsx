const OPTION_LETTERS = ["A", "B", "C", "D"];

function QuizSection({ question, questionNumber, totalQuestions, feedback, disabled, onAnswer }) {
    if (!question) return null;

    return (
        <div className="quiz-section" role="group" aria-label={`Quiz question ${questionNumber} of ${totalQuestions}`}>
            <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Question {questionNumber} of {totalQuestions}
            </p>
            <p className="quiz-question-text">{question.question}</p>

            <div className="quiz-option-list">
                {OPTION_LETTERS.map((letter) => (
                    <button
                        key={letter}
                        type="button"
                        className="quiz-option-button"
                        aria-label={`Option ${letter}: ${question.options[letter]}`}
                        disabled={disabled}
                        onClick={() => onAnswer(letter)}
                    >
                        <span className="quiz-option-letter">{letter}</span>
                        <span>{question.options[letter]}</span>
                    </button>
                ))}
            </div>

            {feedback ? (
                <p className="quiz-feedback" role="status" aria-live="polite">
                    {feedback}
                </p>
            ) : null}
        </div>
    );
}

export default QuizSection;
