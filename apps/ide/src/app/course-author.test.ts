import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@adapters/storage-memory";
import { validateCourseFiles } from "./courses";
import {
  AUTHORABLE_MACHINES,
  COURSE_FILE,
  courseMetaText,
  createCourseProject,
  isCourseAuthoring,
  lessonSwapRenames,
  listLessons,
  newLessonFiles,
  readCourseMeta,
  readLessonBody,
  readLessonChecks,
  slugify,
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
