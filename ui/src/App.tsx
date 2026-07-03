import React, { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import ImageDisplay from "./ImageDisplay";
import Toolbar from "./Toolbar";
import Sidebar from "./Sidebar";
import { extractPages, revokePages, type Page } from "./archive";

function App() {
  const [pages, setPages] = useState<Page[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [words, setWords] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [activeWord, setActiveWord] = useState<string | null>(null);

  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;

  // Revoke object URLs on unmount.
  useEffect(() => () => revokePages(pagesRef.current), []);

  const resetSelection = useCallback(() => {
    setWords([]);
    setSelectedText("");
    setActiveWord(null);
  }, []);

  const handleOpen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = ""; // allow re-opening the same file
    setExtracting(true);
    setError(null);
    resetSelection();
    try {
      const next = await extractPages(file);
      revokePages(pagesRef.current);
      if (next.length === 0) {
        setPages([]);
        setError("No images found in that archive.");
      } else {
        setPages(next);
        setPageIndex(0);
        setFileName(file.name);
      }
    } catch (err) {
      console.error(err);
      setError(
        "Couldn't open that file. Make sure it's a .zip, .cbz, or .cbr archive.",
      );
    } finally {
      setExtracting(false);
    }
  };

  const goTo = useCallback(
    (index: number) => {
      setPageIndex((cur) => {
        const next = Math.max(0, Math.min(index, pagesRef.current.length - 1));
        if (next !== cur) resetSelection();
        return next;
      });
    },
    [resetSelection],
  );

  // Keyboard page navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(pageIndex + 1);
      else if (e.key === "ArrowLeft") goTo(pageIndex - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, pageIndex]);

  const currentPage = pages[pageIndex];

  return (
    <div className="app">
      <Toolbar
        fileName={fileName}
        pageCount={pages.length}
        pageIndex={pageIndex}
        onOpen={handleOpen}
        onPrev={() => goTo(pageIndex - 1)}
        onNext={() => goTo(pageIndex + 1)}
      />

      <div className="reader">
        <main className="viewer">
          {extracting && <p className="muted">Opening archive…</p>}
          {error && <p className="error">{error}</p>}
          {!extracting && !error && !currentPage && (
            <div className="empty-state">
              <p>Open a .zip, .cbz, or .cbr to start reading.</p>
            </div>
          )}
          {currentPage && (
            <ImageDisplay
              imageURL={currentPage.url}
              onWordsDetected={setWords}
              onTextDetected={setSelectedText}
              onLoadingChange={setOcrLoading}
            />
          )}
        </main>

        <Sidebar
          selectedText={selectedText}
          words={words}
          activeWord={activeWord}
          ocrLoading={ocrLoading}
          onSelectWord={setActiveWord}
        />
      </div>
    </div>
  );
}

export default App;
