import React, { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import ImageDisplay from "./ImageDisplay";
import Toolbar from "./Toolbar";
import Sidebar from "./Sidebar";
import { extractPages, revokePages, type Page } from "./archive";

const getInitialTheme = (): "light" | "dark" => {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

function App() {
  const [pages, setPages] = useState<Page[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  const [words, setWords] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [activeWord, setActiveWord] = useState<string | null>(null);

  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;

  // Revoke object URLs on unmount.
  useEffect(() => () => revokePages(pagesRef.current), []);

  // Sync theme with document element
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  const resetSelection = useCallback(() => {
    setWords([]);
    setSelectedText("");
    setActiveWord(null);
  }, []);

  // Save progress to localStorage
  useEffect(() => {
    if (fileName) {
      localStorage.setItem(`manga-progress:${fileName}`, pageIndex.toString());
    }
  }, [fileName, pageIndex]);

  const openFile = async (file: File) => {
    setExtracting(true);
    setError(null);
    resetSelection();
    setExtractionProgress({ current: 0, total: 0 });
    try {
      const next = await extractPages(file, (current, total) => {
        setExtractionProgress({ current, total });
      });
      revokePages(pagesRef.current);
      if (next.length === 0) {
        setPages([]);
        setError("No images found in that archive.");
      } else {
        setPages(next);
        setFileName(file.name);

        // Restore progress
        const saved = localStorage.getItem(`manga-progress:${file.name}`);
        const savedIndex = saved ? parseInt(saved, 10) : 0;
        const validIndex = savedIndex >= 0 && savedIndex < next.length ? savedIndex : 0;
        setPageIndex(validIndex);
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

  const handleOpen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = ""; // allow re-opening the same file
    await openFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "zip" || ext === "cbz" || ext === "cbr") {
      await openFile(file);
    } else {
      setError("Please drop a valid .zip, .cbz, or .cbr archive.");
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
    <div
      className={`app${dragOver ? " drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toolbar
        fileName={fileName}
        pageCount={pages.length}
        pageIndex={pageIndex}
        theme={theme}
        onOpen={handleOpen}
        onPrev={() => goTo(pageIndex - 1)}
        onNext={() => goTo(pageIndex + 1)}
        onPageChange={goTo}
        onToggleTheme={toggleTheme}
      />

      <div className="reader">
        <main className="viewer">
          {extracting && (
            <div className="extraction-progress-container">
              <p className="muted">Opening archive…</p>
              {extractionProgress.total > 0 && (
                <div className="progress-bar-wrapper">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${(extractionProgress.current / extractionProgress.total) * 100}%`,
                    }}
                  />
                  <span className="progress-text">
                    Extracting page {extractionProgress.current} of {extractionProgress.total} ({Math.round((extractionProgress.current / extractionProgress.total) * 100)}%)
                  </span>
                </div>
              )}
            </div>
          )}
          {error && <p className="error">{error}</p>}
          {!extracting && !error && !currentPage && (
            <div className="empty-state">
              <p>Open or drag-and-drop a .zip, .cbz, or .cbr to start reading.</p>
            </div>
          )}
          {!extracting && currentPage && (
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

      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-message">
            <span className="drop-icon">📥</span>
            <p>Drop your manga archive here!</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;