import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { createMemoryStorage } from "@adapters/storage-memory";
import { getCourse, getLesson, validateCourseFiles } from "./courses";
import { createDraftCourse, getDraftCourse, importDraftCourse, saveDraftCourse } from "./course-author";
import {
  AUTHORABLE_MACHINES,
  COURSE_FILE,
  addLessonInFiles,
  courseExportFiles,
  courseMetaText,
  deleteLessonInFiles,
  listLessons,
  newLessonFiles,
  readCourseMeta,
  readLessonBody,
  readLessonChecks,
  rebaseCourseFiles,
  slugify,
  swapLessonsInFiles,
  zipCourse,
  lessonChapter,
  assignLessonToChapter,
} from "./course-author";
import type { CourseMeta } from "./courses";

// #139 — course authoring helpers (draft bundle + pure file transforms).

const dec = new TextDecoder();

describe("course-author helpers", () => {
  it("readCourseMeta parses, courseMetaText round-trips (omits unset order)", () => {
    const meta = { title: "T", description: "D", machine: "atari-xl" };
    const text = courseMetaText(meta);
    expect(readCourseMeta([{ path: COURSE_FILE, content: text }])).toEqual(meta);
    expect(text).not.toContain("order");

    const withOrder = courseMetaText({ ...meta, order: 3 });
    expect(readCourseMeta([{ path: COURSE_FILE, content: withOrder }])).toEqual({ ...meta, order: 3 });
  });

  it("chapters: assign creates/moves/prunes, round-trips through course.json", () => {
    const base: CourseMeta = { title: "T", description: "D", machine: "atari-xl" };
    // assign a → "Intro" (creates the chapter)
    let m = assignLessonToChapter(base, "a", "Intro");
    expect(m.chapters).toEqual([{ title: "Intro", lessons: ["a"] }]);
    expect(lessonChapter(m, "a")).toBe("Intro");
    // assign b → "Intro" (appends)
    m = assignLessonToChapter(m, "b", "Intro");
    expect(m.chapters).toEqual([{ title: "Intro", lessons: ["a", "b"] }]);
    // move a → "Deep" (new chapter, removed from Intro)
    m = assignLessonToChapter(m, "a", "Deep");
    expect(m.chapters).toEqual([{ title: "Intro", lessons: ["b"] }, { title: "Deep", lessons: ["a"] }]);
    // unassign b → Intro empties and is pruned
    m = assignLessonToChapter(m, "b", null);
    expect(m.chapters).toEqual([{ title: "Deep", lessons: ["a"] }]);
    expect(lessonChapter(m, "b")).toBeNull();
    // course.json round-trip keeps chapters
    expect(readCourseMeta([{ path: COURSE_FILE, content: courseMetaText(m) }])).toEqual(m);
    // removing the last lesson drops chapters entirely (undefined, not [])
    expect(assignLessonToChapter(m, "a", null).chapters).toBeUndefined();
  });

  it("readCourseMeta returns null when absent or malformed", () => {
    expect(readCourseMeta([{ path: "project.json", content: "{}" }])).toBeNull();
    expect(readCourseMeta([{ path: COURSE_FILE, content: "{ not json" }])).toBeNull();
  });
});

describe("draft course bundle", () => {
  it("falls back to the default machine for an unknown one", async () => {
    const storage = createMemoryStorage();
    const { courseId } = await createDraftCourse(storage, { machine: "nonsense" });
    const files = (await getDraftCourse(storage, courseId))!;
    expect(AUTHORABLE_MACHINES).toContain(readCourseMeta(files)!.machine);
  });

  it("createDraftCourse registers a local course the read API sees", async () => {
    const storage = createMemoryStorage();
    const { courseId, lessonId } = await createDraftCourse(storage, { name: "Drafty", machine: "atari-xl" });
    expect(courseId.startsWith("local:")).toBe(true);
    expect(lessonId).toBe("01-intro");

    const info = getCourse(courseId);
    expect(info).toBeDefined();
    expect(info!.source.kind).toBe("local");
    expect(info!.title).toBe("Drafty");
    expect(info!.lessons).toContain(lessonId);

    const lesson = getLesson(courseId, lessonId);
    expect(lesson).toBeDefined();
    expect(lesson!.body).toContain("# Introduction");
    expect(lesson!.checks).toEqual([{ kind: "build" }]);

    // It round-trips through the courses store.
    const files = await getDraftCourse(storage, courseId);
    expect(files!.some((f) => f.path === "course.json")).toBe(true);
  });

  it("saveDraftCourse overwrites the bundle by id (re-registers)", async () => {
    const storage = createMemoryStorage();
    const { courseId } = await createDraftCourse(storage, { name: "Edit me", machine: "c64" });
    const files = (await getDraftCourse(storage, courseId))!;
    const next = files.map((f) => (f.path === "course.json" ? { ...f, content: JSON.stringify({ title: "Renamed", description: "d", machine: "c64" }) } : f));
    await saveDraftCourse(storage, courseId, next);
    expect(getCourse(courseId)!.title).toBe("Renamed");
  });

  it("importDraftCourse validates + registers; rejects invalid", async () => {
    const storage = createMemoryStorage();
    const good = [
      { path: "course.json", content: JSON.stringify({ title: "Imported", description: "d", machine: "atari-xl" }) },
      { path: "lessons/01-intro/lesson.md", content: "# Intro" },
      { path: "lessons/01-intro/files/project.json", content: JSON.stringify({ version: 2, name: "l", main: "src/m.a65", machine: "atari-xl", toolchain: "mads" }) },
      { path: "lessons/01-intro/files/src/m.a65", content: "; x" },
    ];
    const { courseId, lessonId } = await importDraftCourse(storage, good);
    expect(getCourse(courseId)!.source.kind).toBe("local");
    expect(lessonId).toBe("01-intro");

    await expect(importDraftCourse(storage, [{ path: "course.json", content: "{}" }])).rejects.toThrow();
  });
});

describe("lessons (phase 2)", () => {
  const files = [
    { path: "course.json", content: "{}" },
    { path: "lessons/02-loops/lesson.md", content: "# Loops\n\nbody" },
    { path: "lessons/02-loops/check.json", content: "{}" },
    { path: "lessons/01-intro/lesson.md", content: "intro with no heading" },
    { path: "lessons/01-intro/files/src/main.a65", content: "; x" },
  ];

  it("listLessons parses + sorts by prefix, title from first # else slug", () => {
    const ls = listLessons(files);
    expect(ls.map((l) => l.id)).toEqual(["01-intro", "02-loops"]);
    expect(ls[0]).toMatchObject({ n: 1, slug: "intro", title: "intro" }); // no heading → slug
    expect(ls[1]).toMatchObject({ n: 2, slug: "loops", title: "Loops" });
    expect(ls[0]!.dir).toBe("lessons/01-intro");
  });

  it("slugify produces dir-safe slugs", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("  spaces  ")).toBe("spaces");
    expect(slugify("!!!")).toBe("lesson");
  });

  it("swapLessonsInFiles swaps two lessons' prefixes (pure path rewrite)", () => {
    const out = swapLessonsInFiles(files, "01-intro", "02-loops");
    const ids = listLessons(out).map((l) => l.id);
    // intro takes 02, loops takes 01 → sorted: 01-loops, 02-intro
    expect(ids).toEqual(["01-loops", "02-intro"]);
    // content travels with the swap
    expect(out.find((f) => f.path === "lessons/02-intro/files/src/main.a65")?.content).toBe("; x");
  });

  it("addLessonInFiles appends the next-numbered lesson; deleteLessonInFiles removes one", () => {
    const { files: added, lessonId } = addLessonInFiles(files, "atari-xl");
    expect(lessonId).toBe("03-new-lesson");
    expect(listLessons(added).map((l) => l.id)).toEqual(["01-intro", "02-loops", "03-new-lesson"]);
    const removed = deleteLessonInFiles(added, "02-loops");
    expect(listLessons(removed).map((l) => l.id)).toEqual(["01-intro", "03-new-lesson"]);
    expect(removed.some((f) => f.path.startsWith("lessons/02-loops/"))).toBe(false);
  });

  it("newLessonFiles appends after the highest prefix with a starter + check", () => {
    const ls = listLessons(files);
    const added = newLessonFiles(ls, "atari-xl");
    const paths = added.map((f) => f.path);
    expect(paths).toContain("lessons/03-new-lesson/lesson.md");
    expect(paths).toContain("lessons/03-new-lesson/check.json");
    expect(paths.some((p) => p.startsWith("lessons/03-new-lesson/files/"))).toBe(true);
    // starter manifest targets the requested machine
    const manifest = added.find((f) => f.path === "lessons/03-new-lesson/files/project.json")!;
    expect(JSON.parse(manifest.content)).toMatchObject({ machine: "atari-xl", toolchain: "mads" });
  });

  it("newLessonFiles starts at 01 for an empty course", () => {
    expect(newLessonFiles([], "atari-xl")[0]!.path).toBe("lessons/01-new-lesson/lesson.md");
  });

  it("courseExportFiles keeps course.json + lessons/**, drops container/.gitkeep/generated", () => {
    const f = [
      { path: "project.json", content: "{}" },               // authoring container — drop
      { path: "course.json", content: '{"title":"T"}' },      // keep
      { path: "lessons/01-intro/lesson.md", content: "# I" }, // keep
      { path: "lessons/01-intro/files/.gitkeep", content: "" }, // drop
      { path: "generated/x.asm", content: "x" },              // drop
    ];
    expect(courseExportFiles(f).map((x) => x.path)).toEqual([
      "course.json",
      "lessons/01-intro/lesson.md",
    ]);
  });

  it("rebaseCourseFiles strips a picked-folder prefix; leaves a root zip alone", () => {
    const folder = [
      { path: "my-course/course.json", content: "{}" },
      { path: "my-course/lessons/01-intro/lesson.md", content: "# I" },
      { path: "my-course/README.md", content: "ignored-but-kept-under-root" },
      { path: "elsewhere/x", content: "dropped" },
    ];
    expect(rebaseCourseFiles(folder).map((f) => f.path)).toEqual([
      "course.json",
      "lessons/01-intro/lesson.md",
      "README.md",
    ]);
    const atRoot = [{ path: "course.json", content: "{}" }, { path: "lessons/01-x/lesson.md", content: "x" }];
    expect(rebaseCourseFiles(atRoot)).toEqual(atRoot);
  });

  it("zipCourse round-trips a draft to a validateCourseFiles-clean course", async () => {
    const storage = createMemoryStorage();
    const { courseId } = await createDraftCourse(storage, { name: "Z", machine: "atari-xl" });
    const files = (await getDraftCourse(storage, courseId))!;

    const zipped = unzipSync(zipCourse(files));
    const out = Object.entries(zipped).map(([path, bytes]) => ({ path, content: dec.decode(bytes) }));
    expect(out.some((f) => f.path === "course.json")).toBe(true);
    expect(validateCourseFiles(out)).toEqual({ ok: true });
  });

  it("readLessonBody / readLessonChecks read a lesson's md + checks", () => {
    const f = [
      { path: "lessons/01-intro/lesson.md", content: "# Intro\n\nhi" },
      { path: "lessons/01-intro/check.json", content: JSON.stringify({ checks: [{ kind: "build" }, { kind: "label", name: "main" }] }) },
      { path: "lessons/02-x/check.json", content: "{ not json" },
    ];
    expect(readLessonBody(f, "01-intro")).toBe("# Intro\n\nhi");
    expect(readLessonBody(f, "99-none")).toBe("");
    expect(readLessonChecks(f, "01-intro")).toEqual([{ kind: "build" }, { kind: "label", name: "main" }]);
    expect(readLessonChecks(f, "02-x")).toEqual([]); // malformed → []
    expect(readLessonChecks(f, "99-none")).toEqual([]); // absent → []
  });
});
