// Which CLASSROOM a request is about.
//
// A teacher can run more than one course, and each course is its own board
// with its own units, content, assignments, ticks and look (Jay: "we need
// to make it so a profile can have multiple classrooms for teachers who
// teach more than one course"). So every per-board document carries a
// classroomId next to its teacherId, and every per-board endpoint reads
// the classroom from the request the same way it reads the teacher from
// the session.
//
// "main" is the classroom every existing document was assigned when this
// was introduced (see the migration of 2026-09-02), and what a request
// that names no classroom means -- so an older client, or a link without
// ?class=, still lands on the board the teacher always had.
//
// Not verified against the teacher's profile on every request: data is
// already partitioned by the verified teacherId, so a made-up classroom
// id can only ever reach an empty board of the caller's own.
export const DEFAULT_CLASSROOM_ID = "main";
const CLASSROOM_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function classroomIdFrom(req) {
  const raw = req.method === "GET" || req.method === "DELETE"
    ? req.query?.classroomId
    : (req.body || {}).classroomId ?? req.query?.classroomId;
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return CLASSROOM_RE.test(v) ? v : DEFAULT_CLASSROOM_ID;
}

// Settings that belong to the TEACHER, not to any one classroom: what
// they have added from the Design Store (a border bought once is theirs
// on every board -- Jay: "belong to teacher") and whether they have done
// the Build tour. Stored under this pseudo-classroom in boardSettings.
export const TEACHER_SETTINGS_ID = "_teacher";
export const TEACHER_LEVEL_SETTINGS = ["ownedDesignOptions", "buildTourDone"];
export const isTeacherLevelSetting = (key) => TEACHER_LEVEL_SETTINGS.includes(key);
