// createIdbStorage — groups the IDB module functions into the StorageBackend
// port. Thin: every method is an existing function, bound 1:1. The functions
// stay exported individually too (the app still imports several directly);
// this just gives the workbench a single injectable backend.

import type { StorageBackend } from "@ports";
import {
  createFile,
  createProject,
  deleteFile,
  deleteFolder,
  deleteProject,
  duplicateProject,
  getActiveProjectId,
  listProjects,
  loadProject,
  renameFile,
  renameFolder,
  renameProject,
  saveFile,
  saveManifest,
  setActiveProjectId,
} from "./project";
import {
  clearSnapshotsForProject,
  createSnapshot,
  deleteSnapshot,
  diffSnapshots,
  gcOrphanBlobs,
  listSnapshots,
  pruneAutoSnapshots,
  restoreSnapshot,
} from "./snapshots";
import { clearBreakpoints, loadBreakpoints, saveBreakpoints } from "./breakpoints";
import {
  getInstalledCourse,
  installRemoteCourse,
  listInstalledCourses,
  removeInstalledCourse,
} from "./course-store";

export function createIdbStorage(): StorageBackend {
  return {
    projects: {
      list: listProjects,
      load: loadProject,
      create: createProject,
      rename: renameProject,
      duplicate: duplicateProject,
      delete: deleteProject,
      writeFile: saveFile,
      createFile,
      deleteFile,
      renameFile,
      renameFolder,
      deleteFolder,
      saveManifest,
    },
    snapshots: {
      create: createSnapshot,
      list: listSnapshots,
      restore: restoreSnapshot,
      delete: deleteSnapshot,
      clearForProject: clearSnapshotsForProject,
      pruneAuto: pruneAutoSnapshots,
      gcOrphanBlobs,
      diff: diffSnapshots,
    },
    breakpoints: {
      load: loadBreakpoints,
      save: saveBreakpoints,
      clear: clearBreakpoints,
    },
    courses: {
      install: installRemoteCourse,
      list: listInstalledCourses,
      get: getInstalledCourse,
      remove: removeInstalledCourse,
    },
    kv: {
      getActiveProjectId,
      setActiveProjectId,
    },
  };
}
