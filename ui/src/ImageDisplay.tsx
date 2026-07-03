import { useEffect, useRef, useState } from "react";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { cropAndPreprocess, type Rect } from "./ocr";

interface ImageDisplayProps {
  imageURL: string;
  onWordsDetected: (words: string[]) => void;
  onTextDetected?: (text: string) => void;
  onLoadingChange?: (loading: boolean) => void;
}

// Minimum drag size (in displayed pixels) to count as a selection rather than a click.
const MIN_DRAG = 8;

// Extract Spanish words from OCR'd text: keep letters (incl. accents/ñ/ü),
// lowercase, split on everything else, drop empties + 1-char noise tokens,
// de-dupe preserving order.
function extractSpanishWords(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-zñáéíóúü]+/gi) ?? [];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of matches) {
    if (word.length < 2) continue; // drop stray single-char garble
    if (!seen.has(word)) {
      seen.add(word);
      words.push(word);
    }
  }
  return words;
}

interface DragBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function ImageDisplay({
  imageURL,
  onWordsDetected,
  onTextDetected,
  onLoadingChange,
}: ImageDisplayProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const workerPromiseRef = useRef<Promise<Worker> | null>(null);

  // Drag state kept in refs (no re-render per mousemove); box mirrored to state
  // for rendering the overlay.
  const draggingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<DragBox | null>(null);

  // Zoom and pan state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"select" | "pan">("select");
  const [spacePressed, setSpacePressed] = useState(false);

  const spacePressedRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panOffsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const cbRefs = useRef({ onWordsDetected, onTextDetected, onLoadingChange });
  useEffect(() => {
    cbRefs.current = { onWordsDetected, onTextDetected, onLoadingChange };
  }, [onWordsDetected, onTextDetected, onLoadingChange]);

  // Create the OCR worker once (Spanish, single-block page segmentation since we
  // now OCR one focused crop) and terminate it on unmount.
  useEffect(() => {
    const workerPromise = (async () => {
      const worker = await createWorker("spa");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        recognitionMode: "full",
      });
      return worker;
    })();
    workerPromiseRef.current = workerPromise;

    return () => {
      workerPromiseRef.current = null;
      workerPromise.then((worker) => worker.terminate()).catch(() => {});
    };
  }, []);

  // Listen for spacebar to temporarily toggle pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        if (!spacePressedRef.current) {
          spacePressedRef.current = true;
          setSpacePressed(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spacePressedRef.current = false;
        setSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Keyboard shortcuts for mode selection (S for select, P for pan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key.toLowerCase() === "s") {
        setMode("select");
      } else if (e.key.toLowerCase() === "p") {
        setMode("pan");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset the selection and zoom when a new image is loaded.
  useEffect(() => {
    setBox(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    cbRefs.current.onWordsDetected([]);
    cbRefs.current.onTextDetected?.("");
  }, [imageURL]);

  const pointerToImage = (e: React.PointerEvent): { x: number; y: number } => {
    const img = imgRef.current!;
    const container = img.closest(".select-container");
    if (!container) return { x: 0, y: 0 };
    const cr = container.getBoundingClientRect();

    // Clamp pointer to container bounds
    const px = Math.max(0, Math.min(e.clientX - cr.left, cr.width));
    const py = Math.max(0, Math.min(e.clientY - cr.top, cr.height));

    // Map from container coordinates to unscaled image coordinates:
    // x = (px - offsetX) / scale
    // y = (py - offsetY) / scale
    const x = (px - offset.x) / scale;
    const y = (py - offset.y) / scale;

    // Clamp to the unscaled image bounds (0 to img.clientWidth)
    const imgW = img.clientWidth;
    const imgH = img.clientHeight;
    return {
      x: Math.max(0, Math.min(x, imgW)),
      y: Math.max(0, Math.min(y, imgH)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imgRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const isPanningMode = mode === "pan" || spacePressedRef.current;
    if (isPanningMode) {
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOffsetStartRef.current = offset;
    } else {
      draggingRef.current = true;
      startRef.current = pointerToImage(e);
      setBox({
        left: startRef.current.x,
        top: startRef.current.y,
        width: 0,
        height: 0,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const img = imgRef.current!;
      const W = img.clientWidth;
      const H = img.clientHeight;

      let newX = panOffsetStartRef.current.x + dx;
      let newY = panOffsetStartRef.current.y + dy;

      const minX = W * (1 - scale);
      const minY = H * (1 - scale);
      newX = Math.max(minX, Math.min(newX, 0));
      newY = Math.max(minY, Math.min(newY, 0));

      setOffset({ x: newX, y: newY });
    } else if (draggingRef.current && startRef.current) {
      const cur = pointerToImage(e);
      const s = startRef.current;
      setBox({
        left: Math.min(s.x, cur.x),
        top: Math.min(s.y, cur.y),
        width: Math.abs(cur.x - s.x),
        height: Math.abs(cur.y - s.y),
      });
    }
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (panStartRef.current) {
      panStartRef.current = null;
      return;
    }

    if (!draggingRef.current || !startRef.current || !imgRef.current) return;
    draggingRef.current = false;
    const cur = pointerToImage(e);
    const s = startRef.current;
    startRef.current = null;

    const dispBox: DragBox = {
      left: Math.min(s.x, cur.x),
      top: Math.min(s.y, cur.y),
      width: Math.abs(cur.x - s.x),
      height: Math.abs(cur.y - s.y),
    };
    setBox(dispBox);

    if (dispBox.width < MIN_DRAG || dispBox.height < MIN_DRAG) return;

    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const rect: Rect = {
      x: dispBox.left * scaleX,
      y: dispBox.top * scaleY,
      width: dispBox.width * scaleX,
      height: dispBox.height * scaleY,
    };

    const { onWordsDetected, onTextDetected, onLoadingChange } = cbRefs.current;
    onLoadingChange?.(true);
    try {
      const worker = await workerPromiseRef.current;
      if (!worker) throw new Error("OCR worker not ready");

      const canvas = cropAndPreprocess(img, rect);
      const { data } = await worker.recognize(canvas);

      const text = (data.text || "").trim();
      onTextDetected?.(text);
      onWordsDetected(extractSpanishWords(text));
    } catch (error) {
      console.error("OCR error:", error);
      onWordsDetected([]);
      onTextDetected?.("");
    } finally {
      onLoadingChange?.(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let nextScale = scale;
    if (e.deltaY < 0) {
      nextScale = Math.min(5, scale * zoomFactor);
    } else {
      nextScale = Math.max(1, scale / zoomFactor);
    }

    if (nextScale !== scale) {
      const img = imgRef.current!;
      const container = img.closest(".select-container");
      if (!container) return;
      const cr = container.getBoundingClientRect();
      const px = e.clientX - cr.left;
      const py = e.clientY - cr.top;

      const ratio = nextScale / scale;
      let nextOffsetX = px - (px - offset.x) * ratio;
      let nextOffsetY = py - (py - offset.y) * ratio;

      const W = img.clientWidth;
      const H = img.clientHeight;
      const minX = W * (1 - nextScale);
      const minY = H * (1 - nextScale);
      nextOffsetX = Math.max(minX, Math.min(nextOffsetX, 0));
      nextOffsetY = Math.max(minY, Math.min(nextOffsetY, 0));

      setScale(nextScale);
      setOffset({ x: nextOffsetX, y: nextOffsetY });
    }
  };

  const handleZoomIn = () => {
    setScale((s) => {
      const next = Math.min(5, s + 0.5);
      if (imgRef.current) {
        const W = imgRef.current.clientWidth;
        const H = imgRef.current.clientHeight;
        const px = W / 2;
        const py = H / 2;
        const ratio = next / s;
        let nextOffsetX = px - (px - offset.x) * ratio;
        let nextOffsetY = py - (py - offset.y) * ratio;
        const minX = W * (1 - next);
        const minY = H * (1 - next);
        nextOffsetX = Math.max(minX, Math.min(nextOffsetX, 0));
        nextOffsetY = Math.max(minY, Math.min(nextOffsetY, 0));
        setOffset({ x: nextOffsetX, y: nextOffsetY });
      }
      return next;
    });
  };

  const handleZoomOut = () => {
    setScale((s) => {
      const next = Math.max(1, s - 0.5);
      if (imgRef.current) {
        const W = imgRef.current.clientWidth;
        const H = imgRef.current.clientHeight;
        const px = W / 2;
        const py = H / 2;
        const ratio = next / s;
        let nextOffsetX = px - (px - offset.x) * ratio;
        let nextOffsetY = py - (py - offset.y) * ratio;
        const minX = W * (1 - next);
        const minY = H * (1 - next);
        nextOffsetX = Math.max(minX, Math.min(nextOffsetX, 0));
        nextOffsetY = Math.max(minY, Math.min(nextOffsetY, 0));
        setOffset({ x: nextOffsetX, y: nextOffsetY });
      }
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  if (!imageURL) return null;

  const isPanningMode = mode === "pan" || spacePressed;
  const cursorStyle = isPanningMode
    ? (panStartRef.current ? "grabbing" : "grab")
    : "crosshair";

  return (
    <div className="select-container" style={{ overflow: "hidden" }} onWheel={handleWheel}>
      <div
        className="zoom-pan-wrapper"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          position: "relative",
          display: "inline-block",
        }}
      >
        <img
          ref={imgRef}
          src={imageURL}
          alt="Uploaded"
          draggable={false}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ cursor: cursorStyle }}
        />
        {box && (
          <div
            className="selection-rect"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
            }}
          />
        )}
      </div>

      <div className="zoom-controls">
        <button
          type="button"
          className={mode === "select" && !spacePressed ? "active" : ""}
          onClick={() => setMode("select")}
          title="Select Text (S)"
        >
          🔍
        </button>
        <button
          type="button"
          className={mode === "pan" || spacePressed ? "active" : ""}
          onClick={() => setMode("pan")}
          title="Pan Image (P or Hold Space)"
        >
          ✋
        </button>
        <div className="zoom-divider" style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
        <button type="button" onClick={handleZoomOut} disabled={scale <= 1} title="Zoom Out">
          -
        </button>
        <span className="zoom-level">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={handleZoomIn} disabled={scale >= 5} title="Zoom In">
          +
        </button>
        <button type="button" onClick={handleResetZoom} disabled={scale === 1 && offset.x === 0 && offset.y === 0} title="Reset Zoom">
          ↺
        </button>
      </div>
    </div>
  );
}

export default ImageDisplay;