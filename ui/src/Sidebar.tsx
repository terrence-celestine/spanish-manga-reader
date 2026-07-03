import DefinitionPanel from "./DefinitionPanel";

interface SidebarProps {
  selectedText: string;
  words: string[];
  activeWord: string | null;
  ocrLoading: boolean;
  onSelectWord: (word: string) => void;
}

function Sidebar({
  selectedText,
  words,
  activeWord,
  ocrLoading,
  onSelectWord,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <section>
        <h2 className="sidebar-label">Selection</h2>
        {ocrLoading ? (
          <p className="muted">Reading text…</p>
        ) : selectedText ? (
          <p className="selected-text">{selectedText}</p>
        ) : (
          <p className="muted">Drag a box over text on the page.</p>
        )}
      </section>

      {words.length > 0 && (
        <section>
          <h2 className="sidebar-label">Words found ({words.length})</h2>
          <ul className="word-list">
            {words.map((word, i) => (
              <li key={`${word}-${i}`}>
                <button
                  type="button"
                  className={`word-chip${activeWord === word ? " active" : ""}`}
                  onClick={() => onSelectWord(word)}
                >
                  {word}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeWord && (
        <section className="sidebar-definition">
          <DefinitionPanel word={activeWord} />
        </section>
      )}
    </aside>
  );
}

export default Sidebar;
