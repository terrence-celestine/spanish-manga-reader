import React from "react";

interface ToolbarProps {
  fileName: string | null;
  pageCount: number;
  pageIndex: number;
  onOpen: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPrev: () => void;
  onNext: () => void;
}

function Toolbar({
  fileName,
  pageCount,
  pageIndex,
  onOpen,
  onPrev,
  onNext,
}: ToolbarProps) {
  return (
    <header className="toolbar">
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
          <button type="button" onClick={onPrev} disabled={pageIndex <= 0} aria-label="Previous page">
            ‹
          </button>
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
