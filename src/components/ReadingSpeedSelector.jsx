import { useState } from "react";

const LEVELS = [
    { id: "beginner", mark: "01", title: "Beginner", detail: "Simple language and familiar examples" },
    { id: "student", mark: "02", title: "Student", detail: "Clear academic explanations" },
    { id: "advanced", mark: "03", title: "Advanced", detail: "Deeper technical detail" },
];

const SPEEDS = [
    { rate: 0.7, title: "Slow" },
    { rate: 1, title: "Normal" },
    { rate: 1.3, title: "Fast" },
];

function ReadingSpeedSelector({ onSelect }) {
    const [level, setLevel] = useState("student");
    const [rate, setRate] = useState(1);

    return (
        <div className="learning-preferences">
            <section className="level-picker" aria-labelledby="level-picker-title">
                <span className="speed-overline">PERSONALIZE YOUR LESSON</span>
                <h3 className="speed-heading" id="level-picker-title">Choose your learning level</h3>
                <p className="muted speed-description">
                    EDUCARE will shape the explanation around the detail that works for you.
                </p>
                <div className="level-option-list" role="group" aria-label="Learning level">
                    {LEVELS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={`level-option${level === option.id ? " selected" : ""}`}
                            aria-pressed={level === option.id}
                            onClick={() => setLevel(option.id)}
                        >
                            <span className="level-option-mark" aria-hidden="true">{option.mark}</span>
                            <span className="level-option-copy">
                                <strong>{option.title}</strong>
                                <small>{option.detail}</small>
                            </span>
                            <span className="level-option-check" aria-hidden="true">{level === option.id ? "Selected" : ""}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="pace-picker" aria-labelledby="pace-picker-title">
                <div>
                    <h4 id="pace-picker-title">Listening pace</h4>
                    <p className="muted">Choose how quickly the lesson is read aloud.</p>
                </div>
                <div className="pace-options" role="group" aria-label="Audio reading speed">
                    {SPEEDS.map((option) => (
                        <button
                            key={option.rate}
                            type="button"
                            className={`pace-option${rate === option.rate ? " selected" : ""}`}
                            aria-pressed={rate === option.rate}
                            onClick={() => setRate(option.rate)}
                        >
                            {option.title}
                        </button>
                    ))}
                </div>
            </section>

            <button type="button" className="preference-continue" onClick={() => onSelect(level, rate)}>
                Continue to lesson
                <span aria-hidden="true">&rarr;</span>
            </button>
        </div>
    );
}

export default ReadingSpeedSelector;
