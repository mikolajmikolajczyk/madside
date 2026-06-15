import { useState } from "react";

/** "Show first N + more" disclosure. Returns the visible slice, whether a
 *  "more" toggle is warranted, and the toggle. Used by the welcome screen's
 *  Your-projects / Templates sections. */
export function useDisclosure<T>(items: T[], n: number) {
  const [expanded, setExpanded] = useState(false);
  return {
    visible: expanded ? items : items.slice(0, n),
    hasMore: items.length > n,
    hiddenCount: Math.max(0, items.length - n),
    expanded,
    toggle: () => setExpanded((e) => !e),
  };
}
