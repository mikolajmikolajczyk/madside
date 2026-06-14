// Installed remote courses (epic ecd5258, child 7ff626b). A course fetched from
// a public git repo is persisted here as its raw course-root-relative files, so
// it survives reload, works offline, and lists alongside the bundled courses.
// The CourseSource (`@app/courses`) rebuilds the in-memory bundle from these
// files on hydration. Re-installing the same sourceId overwrites (= refresh).

import { getDB } from "./db";
import type { InstalledCourseRow } from "./types";

export async function installRemoteCourse(row: InstalledCourseRow): Promise<void> {
  const db = await getDB();
  await db.put("courses", row);
}

export async function listInstalledCourses(): Promise<InstalledCourseRow[]> {
  const db = await getDB();
  return db.getAll("courses");
}

export async function getInstalledCourse(sourceId: string): Promise<InstalledCourseRow | undefined> {
  const db = await getDB();
  return db.get("courses", sourceId);
}

export async function removeInstalledCourse(sourceId: string): Promise<void> {
  const db = await getDB();
  await db.delete("courses", sourceId);
}
