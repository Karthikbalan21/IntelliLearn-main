function QuizResult({ correct, total, message }) {
    return (
        <div className="quiz-score" role="status" aria-live="polite">
            <h3>Quiz Completed</h3>
            <p className="quiz-score-value">
                Your score: {correct} / {total}
            </p>
            <p className="muted">{message}</p>
        </div>
    );
}

export default QuizResult;
