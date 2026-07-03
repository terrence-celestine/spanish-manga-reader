import { useEffect, useState } from "react";
import { lookupWord, type LookupResult } from "./lookup";

interface DefinitionPanelProps {
  word: string | null;
}

function DefinitionPanel({ word }: DefinitionPanelProps) {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!word) {
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    lookupWord(word)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Lookup failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [word]);

  if (!word) return null;

  return (
    <div className="definition-panel">
      <h3>{word}</h3>
      {loading && <p>Looking up…</p>}
      {error && <p className="dict-error">{error}</p>}
      {!loading && !error && result && result.entries.length === 0 && (
        <p>No definition found.</p>
      )}
      {!loading && !error && result && result.entries.length > 0 && (
        <ul className="dict-entries">
          {result.entries.map((entry, i) => (
            <li key={`${entry.lemma}-${entry.pos}-${i}`}>
              <span className="dict-lemma">{entry.lemma}</span>{" "}
              <span className="dict-pos">{entry.pos}</span>
              <ol className="dict-glosses">
                {entry.glosses.slice(0, 5).map((g, j) => (
                  <li key={j}>{g}</li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DefinitionPanel;
