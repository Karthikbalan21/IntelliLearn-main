// Renders the sources found for a topic, before any explanation is
// generated: just the name and a link. Trust level still drives the ranked
// order they're offered in (see sourceService.js) - it's simply not
// surfaced here. Which of these the lesson actually gets grounded
// on is up to the learner's pick below, not the ranking alone.
//
// While `selectable` is true, each card gets a toggle button and a
// "Continue" action is shown before choosing a reading speed.
function SourcePreviewGrid({ sources, selectable = false, selectedIndices = [], onToggle, onContinue }) {
    if (!sources || !sources.length) return null;

    return (
        <div className="source-preview" aria-label="Sources used for this explanation">
            <h3 className="source-preview-heading">Sources Used For This Explanation</h3>
            <ol className="source-grid">
                {sources.map((source, index) => {
                    const isSelected = selectedIndices.includes(index);
                    return (
                        <li
                            key={source.url || index}
                            className={`source-card${selectable && isSelected ? " source-card-selected" : ""}`}
                        >
                            <span className="source-number" aria-hidden="true">{index + 1}</span>
                            <div className="source-card-body">
                                <a
                                    className="source-link"
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Visit source ${index + 1}: ${source.domain}`}
                                >
                                    {source.domain}
                                </a>
                            </div>
                            {selectable ? (
                                <button
                                    type="button"
                                    className={`source-select-toggle${isSelected ? " source-select-toggle-active" : ""}`}
                                    aria-pressed={isSelected}
                                    aria-label={`${isSelected ? "Deselect" : "Select"} source ${index + 1}: ${source.domain}`}
                                    onClick={() => onToggle && onToggle(index)}
                                >
                                    {isSelected ? "Selected ✓" : "Select"}
                                </button>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
            {selectable ? (
                <div className="confirm-buttons" role="group" aria-label="Confirm source selection">
                    <p className="muted">
                        Choose the sources you want to use, then continue.
                    </p>
                    <button type="button" className="search-button" aria-label="Continue with selected sources" onClick={onContinue}>
                        Continue
                    </button>
                </div>
            ) : (
                <p className="muted source-hint">
                    Select a source link to open it.
                </p>
            )}
        </div>
    );
}

export default SourcePreviewGrid;
