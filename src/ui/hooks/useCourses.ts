import { useEffect, useSyncExternalStore } from "react";
import { coursesSnapshot, hydrateRemoteCourses, subscribeCourses, type CourseInfo } from "@app";

/** Reactive course list (bundled + installed-remote). Subscribes to the course
 *  registry (ADR-0007 useSyncExternalStore style) so the list re-renders when a
 *  remote course is hydrated at startup, installed, refreshed, or removed.
 *  Triggers the one-time IDB hydration of installed remote courses on mount. */
export function useCourses(): CourseInfo[] {
  useEffect(() => { void hydrateRemoteCourses(); }, []);
  return useSyncExternalStore(subscribeCourses, coursesSnapshot, coursesSnapshot);
}
