// Tiny drag-to-resize handle. Sits in its own grid column; on mousedown it
// captures the cursor and reports x-deltas via onResize.

import { useRef } from "react";
import "./Splitter.css";

interface Props {
  // True when dragging right grows the panel on the right (i.e. handle sits
  // on the right edge of a panel and a right drag should *shrink* it).
  invert?: boolean;
  onResize: (deltaPx: number) => void;
  onResizeEnd?: () => void;
}

export function Splitter({ invert, onResize, onResizeEnd }: Props) {
  const lastXRef = useRef(0);

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    lastXRef.current = e.clientX;
    const handleMove = (ev: MouseEvent) => {
      const dx = ev.clientX - lastXRef.current;
      lastXRef.current = ev.clientX;
      onResize(invert ? -dx : dx);
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      onResizeEnd?.();
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    document.body.style.cursor = "col-resize";
  };

  return <div className="splitter" onMouseDown={onDown} />;
}
