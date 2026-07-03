import React from "react";

interface ToolbarProps {
  fileName: string | null;
  pageCount: number;
  pageIndex: number;
  theme: "light" | "dark";
  onOpen: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPrev: () => void;
  onNext: () => void;
  onPageChange: (index: number) => void;
  onToggleTheme: () => void;
}

function Toolbar({
  fileName,
  pageCount,
  pageIndex,
  theme,
  onOpen,
  onPrev,
  onNext,
  onPageChange,
  onToggleTheme,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <button
        type="button"
        className="theme-toggle-btn"
        onClick={onToggleTheme}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <label className="open-btn">
        Open .zip / .cbz / .cbr
        <input
          type="file"
          accept=".zip,.cbz,.cbr,application/zip,application/x-cbr,application/vnd.comicbook+zip,application/vnd.comicbook-rar"
          onChange={onOpen}
          hidden
        />
      </label>
      {fileName && <span className="file-name">{fileName}</span>}

      <span className="spacer" />

      {pageCount > 0 && (
        <div className="pager">
          <button
            type="button"
            onClick={onPrev}
            disabled={pageIndex <= 0}
            aria-label="Previous page"
          >
            ‹
          </button>
          <input
            type="range"
            min={0}
            max={pageCount - 1}
            value={pageIndex}
            onChange={(e) => onPageChange(parseInt(e.target.value, 10))}
            className="page-slider"
            title="Slide to change page"
          />
          <span className="page-counter">
            {pageIndex + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={pageIndex >= pageCount - 1}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}
    </header>
  );
}

export default Toolbar;