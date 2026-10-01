import axios from "axios";
import { useRef, useState } from "react";
import "./VisualLearningModule.css";

const visualTypes = [
    { id: "map", label: "Concept map" },
    { id: "path", label: "Learning path" },
    { id: "points", label: "Key points" },
];

function extractIdeas(content) {
    const lines = (content || "")
        .split(/\r?\n/)
        .map((line) => line
            .replace(/^\s*(?:#{1,6}\s*|[-*+]\s+|\d+[.)]\s+)/, "")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/[`*_~]/g, "")
            .trim())
        .filter(Boolean);

    const ideas = lines.flatMap((line) => line.split(/(?<=[.!?])\s+/))
        .map((idea) => idea.trim())
        .filter((idea) => idea.length >= 24);
    const uniqueIdeas = [...new Set(ideas)];

    if (uniqueIdeas.length) return uniqueIdeas.slice(0, 6);
    return [(content || "").replace(/\s+/g, " ").trim()].filter(Boolean).slice(0, 1);
}

function VisualLearningModule({ topic, content, apiBaseUrl }) {
    const [visualType, setVisualType] = useState(null);
    const [ideas, setIdeas] = useState(() => extractIdeas(content));
    const [regenerationCount, setRegenerationCount] = useState(0);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regenerationError, setRegenerationError] = useState("");
    const [topicImage, setTopicImage] = useState(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isImageVisible, setIsImageVisible] = useState(false);
    const [imageError, setImageError] = useState("");
    const requestIdRef = useRef(0);
    const useAlternateLayout = regenerationCount % 2 === 1;

    const regenerateVisual = async () => {
        if (isRegenerating) return;

        const requestId = ++requestIdRef.current;
        setIsRegenerating(true);
        setRegenerationError("");

        try {
            const response = await axios.post(`${apiBaseUrl}/api/visuals/regenerate`, {
                topic,
                content,
                visualType,
                previousIdeas: ideas,
            });
            if (requestId !== requestIdRef.current) return;
            if (!response.data.success || !Array.isArray(response.data.ideas) || !response.data.ideas.length) {
                throw new Error(response.data.message || "No new visual content was generated.");
            }

            setIdeas(response.data.ideas);
            setRegenerationCount((count) => count + 1);
        } catch (error) {
            if (requestId === requestIdRef.current) {
                setRegenerationError(error?.response?.data?.message || error.message || "Unable to regenerate visual content right now.");
            }
        } finally {
            if (requestId === requestIdRef.current) setIsRegenerating(false);
        }
    };

    const toggleTopicImage = async () => {
        if (topicImage) {
            setIsImageVisible((visible) => !visible);
            return;
        }

        setIsGeneratingImage(true);
        setImageError("");

        try {
            const response = await axios.post(`${apiBaseUrl}/api/images/generate`, {
                topic,
                content,
            });
            if (!response.data.success || typeof response.data.imageDataUrl !== "string") {
                throw new Error(response.data.message || "No generated image was returned.");
            }

            setTopicImage(response.data.imageDataUrl);
            setIsImageVisible(true);
        } catch (error) {
            setImageError(error?.response?.data?.message || error.message || "Unable to find an image right now.");
        } finally {
            setIsGeneratingImage(false);
        }
    };

    if (!ideas.length) return null;

    return (
        <section className="visual-learning" aria-labelledby="visual-learning-title">
            <div className="visual-learning-heading">
                <div>
                    <p className="visual-learning-kicker">LEARN IT VISUALLY</p>
                    <h3 id="visual-learning-title">Choose a view</h3>
                </div>
                <span className="visual-learning-count">{ideas.length} ideas</span>
            </div>

            <div className="visual-actions">
                <div className="visual-type-options" role="group" aria-label="Visualization type">
                    {visualTypes.map((type) => (
                        <button
                            key={type.id}
                            className={`visual-type-option${visualType === type.id ? " is-active" : ""}`}
                            type="button"
                            aria-pressed={visualType === type.id}
                            onClick={() => setVisualType(type.id)}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
                {visualType ? (
                    <button
                        className="visual-regenerate"
                        type="button"
                        onClick={regenerateVisual}
                        disabled={isRegenerating}
                    >
                        {isRegenerating ? "Regenerating..." : "Regenerate"}
                    </button>
                ) : null}
                <button
                    className="visual-image-action"
                    type="button"
                    onClick={toggleTopicImage}
                    disabled={isGeneratingImage}
                    aria-expanded={isImageVisible}
                >
                    {isGeneratingImage ? "Generating image..." : isImageVisible ? "Hide image" : topicImage ? "View image" : "Generate image"}
                </button>
            </div>

            {visualType === "map" ? (
                <div className={`visual-map${useAlternateLayout ? " visual-map--alternate" : ""}`} aria-label={`Concept map for ${topic || "this lesson"}`}>
                    <div className="visual-map-topic">{topic || "This lesson"}</div>
                    <div className="visual-map-branches">
                        {ideas.map((idea, index) => (
                            <article className="visual-map-idea" key={`${index}-${idea}`}>
                                <span className="visual-idea-index">{String(index + 1).padStart(2, "0")}</span>
                                <p>{idea}</p>
                            </article>
                        ))}
                    </div>
                </div>
            ) : null}

            {visualType === "path" ? (
                <ol className={`visual-path${useAlternateLayout ? " visual-path--alternate" : ""}`} aria-label="Lesson ideas in order">
                    {ideas.map((idea, index) => (
                        <li className="visual-path-step" key={`${index}-${idea}`}>
                            <span className="visual-path-number">{index + 1}</span>
                            <p>{idea}</p>
                        </li>
                    ))}
                </ol>
            ) : null}

            {visualType === "points" ? (
                <ol className={`visual-points${useAlternateLayout ? " visual-points--alternate" : ""}`} aria-label="Key ideas from the lesson">
                    {ideas.map((idea, index) => (
                        <li className="visual-point" key={`${index}-${idea}`}>
                            <span className="visual-point-index">{String(index + 1).padStart(2, "0")}</span>
                            <p>{idea}</p>
                        </li>
                    ))}
                </ol>
            ) : null}
            {visualType ? (
                <span className="visual-regenerate-status" aria-live="polite">
                    {regenerationCount ? `New visual content ${regenerationCount} generated from the lesson.` : ""}
                </span>
            ) : null}
            {regenerationError ? <p className="visual-regenerate-error" role="alert">{regenerationError}</p> : null}
            {imageError ? <p className="visual-regenerate-error" role="alert">{imageError}</p> : null}
            {isImageVisible && topicImage ? (
                <figure className="visual-topic-image">
                    <img src={topicImage} alt={`AI-generated educational illustration of ${topic}`} decoding="async" />
                    <figcaption>
                        AI-generated educational illustration for {topic}.
                    </figcaption>
                </figure>
            ) : null}
        </section>
    );
}

export default VisualLearningModule;
