import { useEffect, useState } from "react";
import { fetchOfficialCatalogue, type OfficialCourse } from "@app";

/** The official course catalogue, fetched once on mount. Failures (offline,
 *  cache miss) resolve to an empty list — the welcome screen still renders. */
export function useOfficialCourses(): OfficialCourse[] {
  const [courses, setCourses] = useState<OfficialCourse[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchOfficialCatalogue()
      .then((cs) => { if (!cancelled) setCourses(cs); })
      .catch(() => { /* offline / unreachable — show nothing */ });
    return () => { cancelled = true; };
  }, []);
  return courses;
}
