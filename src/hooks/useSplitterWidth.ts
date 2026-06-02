import { useEffect, useState } from "react";

/** Pixel-width state that auto-persists to localStorage under `key`.
 *  Reads on mount, writes on change. Caller clamps before passing the
 *  new value (so this hook doesn't need to know any bounds). */
export function useSplitterWidth(key: string, fallback: number) {
  const [width, setWidth] = useState(() => {
    const raw = Number(localStorage.getItem(key));
    return raw > 0 ? raw : fallback;
  });
  useEffect(() => {
    localStorage.setItem(key, String(width));
  }, [key, width]);
  return [width, setWidth] as const;
}
