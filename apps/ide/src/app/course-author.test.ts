import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@adapters/storage-memory";
import { validateCourseFiles } from "./courses";
import {
  AUTHORABLE_MACHINES,
  COURSE_FILE,
  courseMetaText,
  createCourseProject,
  isCourseAuthoring,
  readCourseMeta,
} from "./course-author";

// #139 phase 1 — course-as-project authoring helpers.

const dec = new TextDecoder();

describe("course-author helpers", () => {
  it("isCourseAuthoring detects a root course.json", () => {
    expect(isCourseAuthoring([{ path: "project.json" }, { path: "course.json" }])).toBe(true);
    expect(isCourseAuthoring([{ path: "project.json" }, { path: "src/main.c" }])).toBe(false);
    // nested course.json doesn't count — must be at root
    expect(isCourseAuthoring([{ path: "lessons/01/files/course.json" }])).toBe(false);
  });

  it("readCourseMeta parses, courseMetaText round-trips (omits unset order)", () => {
    const meta = { title: "T", description: "D", machine: "atari-xl" };
    const text = courseMetaText(meta);
    expect(readCourseMeta([{ path: COURSE_FILE, content: text }])).toEqual(meta);
    expect(text).not.toContain("order");

    const withOrder = courseMetaText({ ...meta, order: 3 });
    expect(readCourseMeta([{ path: COURSE_FILE, content: withOrder }])).toEqual({ ...meta, order: 3 });
  });

  it("readCourseMeta returns null when absent or malformed", () => {
    expect(readCourseMeta([{ path: "project.json", content: "{}" }])).toBeNull();
    expect(readCourseMeta([{ path: COURSE_FILE, content: "{ not json" }])).toBeNull();
  });
});

describe("createCourseProject", () => {
  it("seeds a valid, loadable course-authoring project", async () => {
    const storage = createMemoryStorage();
    const row = await createCourseProject(storage, { name: "My Course", machine: "nes" });

    const loaded = await storage.projects.load(row.id);
    expect(loaded).not.toBeNull();
    const files = loaded!.files.map((f) => ({ path: f.path, content: dec.decode(f.content) }));

    // It's recognised as a course-authoring project.
    expect(isCourseAuthoring(files)).toBe(true);

    // The course.json carries the requested metadata.
    expect(readCourseMeta(files)).toMatchObject({ title: "My Course", machine: "nes" });

    // A valid container manifest exists (so the project loads).
    expect(files.some((f) => f.path === "project.json")).toBe(true);

    // The seeded layout passes the course runtime's own validator.
    expect(validateCourseFiles(files)).toEqual({ ok: true });

    // The stub lesson + its check are present.
    expect(files.some((f) => f.path === "lessons/01-intro/lesson.md")).toBe(true);
    expect(files.some((f) => f.path === "lessons/01-intro/check.json")).toBe(true);
  });

  it("falls back to the default machine for an unknown one", async () => {
    const storage = createMemoryStorage();
    const row = await createCourseProject(storage, { machine: "nonsense" });
    const loaded = await storage.projects.load(row.id);
    const files = loaded!.files.map((f) => ({ path: f.path, content: dec.decode(f.content) }));
    expect(AUTHORABLE_MACHINES).toContain(readCourseMeta(files)!.machine);
  });
});
