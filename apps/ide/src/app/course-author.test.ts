import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { createMemoryStorage } from "@adapters/storage-memory";
import { getCourse, getLesson, validateCourseFiles } from "./courses";
import { createDraftCourse, getDraftCourse, importDraftCourse, saveDraftCourse } from "./course-author";
import {
  AUTHORABLE_MACHINES,
  COURSE_FILE,
  courseExportFiles,
  courseMetaText,
  createCourseProject,
  importCourseProject,
  isCourseAuthoring,
  lessonSwapRenames,
  listLessons,
  newLessonFiles,
  readCourseMeta,
  readLessonBody,
  readLessonChecks,
  rebaseCourseFiles,
  slugify,
  zipCourse,
  type LessonInfo,
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

describe("draft course bundle", () => {
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

  it("lessonSwapRenames swaps two prefixes collision-safe (via temp)", () => {
    const a: LessonInfo = { dir: "lessons/01-intro", id: "01-intro", n: 1, slug: "intro", title: "Intro" };
    const b: LessonInfo = { dir: "lessons/02-loops", id: "02-loops", n: 2, slug: "loops", title: "Loops" };
    expect(lessonSwapRenames(a, b)).toEqual([
      { from: "lessons/01-intro", to: "lessons/__swap-intro" },
      { from: "lessons/02-loops", to: "lessons/01-loops" },
      { from: "lessons/__swap-intro", to: "lessons/02-intro" },
    ]);
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

  it("importCourseProject round-trips an exported course back into authoring", async () => {
    const storage = createMemoryStorage();
    // Author + export a course, then import the exported files back.
    const made = await createCourseProject(storage, { name: "RT", machine: "c64" });
    const loaded = await storage.projects.load(made.id);
    const exported = courseExportFiles(loaded!.files.map((f) => ({ path: f.path, content: dec.decode(f.content) })));

    const imported = await importCourseProject(storage, exported);
    const back = await storage.projects.load(imported.id);
    const files = back!.files.map((f) => ({ path: f.path, content: dec.decode(f.content) }));

    expect(isCourseAuthoring(files)).toBe(true);               // course.json present
    expect(files.some((f) => f.path === "project.json")).toBe(true); // container added
    expect(readCourseMeta(files)).toMatchObject({ machine: "c64" });
  });

  it("importCourseProject rejects an invalid course", async () => {
    const storage = createMemoryStorage();
    await expect(importCourseProject(storage, [{ path: "course.json", content: "{}" }])).rejects.toThrow();
  });

  it("zipCourse round-trips to a validateCourseFiles-clean course", async () => {
    const storage = createMemoryStorage();
    const row = await createCourseProject(storage, { name: "Z", machine: "atari-xl" });
    const loaded = await storage.projects.load(row.id);
    const files = loaded!.files.map((f) => ({ path: f.path, content: dec.decode(f.content) }));

    const zipped = unzipSync(zipCourse(files));
    const out = Object.entries(zipped).map(([path, bytes]) => ({ path, content: dec.decode(bytes) }));
    expect(out.some((f) => f.path === "project.json")).toBe(false); // container excluded
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
