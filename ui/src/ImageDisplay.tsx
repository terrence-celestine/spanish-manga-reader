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
        whitelist: ["si", "yes", "sí"], // Add the Spanish word here
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

  // Reset the selection when a new image is loaded.
  useEffect(() => {
    setBox(null);
    cbRefs.current.onWordsDetected([]);
    cbRefs.current.onTextDetected?.("");
  }, [imageURL]);

  const pointerToImage = (e: React.PointerEvent): { x: number; y: number } => {
    const img = imgRef.current!;
    const r = img.getBoundingClientRect();
    // Clamp to the image bounds so drags that leave the image still map inside.
    const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
    const y = Math.max(0, Math.min(e.clientY - r.top, r.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imgRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    startRef.current = pointerToImage(e);
    setBox({
      left: startRef.current.x,
      top: startRef.current.y,
      width: 0,
      height: 0,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !startRef.current) return;
    const cur = pointerToImage(e);
    const s = startRef.current;
    setBox({
      left: Math.min(s.x, cur.x),
      top: Math.min(s.y, cur.y),
      width: Math.abs(cur.x - s.x),
      height: Math.abs(cur.y - s.y),
    });
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
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

    // Ignore clicks / tiny drags.
    if (dispBox.width < MIN_DRAG || dispBox.height < MIN_DRAG) return;

    const img = imgRef.current;
    // Map displayed-pixel box → natural-pixel rect.
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

  if (!imageURL) return null;

  return (
    <div className="select-container">
      <img
        ref={imgRef}
        src={imageURL}
        alt="Uploaded"
        draggable={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
  );
}

export default ImageDisplay;
