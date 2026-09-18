// Which school a classroom is at.
//
// A school is a fact about a course, not about the teacher: the name,
// colours and fonts follow a teacher between buildings, the building
// belongs to the board. Most teachers have one building, so the profile
// keeps a single school that every classroom uses; a classroom with a
// school of its own (the music or reading specialist who covers two
// schools -- Jay: "in elementary some teachers split time between two
// schools") overrides it for that board only. Null on the classroom means
// "the teacher's school".
//
// One place to answer that, so the board title, the home photo, the
// Profile page's preview and the server's address-maker all agree.

/** The school name this classroom's board shows. "" when neither is set. */
export function schoolNameFor(profile, classroom) {
  return (classroom?.school || profile?.school || "").trim();
}

/** The partner-district school entry (name, homeImageUrl) for this
 *  classroom: its own pick when it has one, else the teacher's. Null when
 *  the profile has no district, or nothing was picked. */
export function districtSchoolFor(profile, classroom) {
  const district = profile?.district;
  if (!district) return null;
  if (classroom?.schoolId) {
    return (district.schools || []).find(s => s.id === classroom.schoolId) || null;
  }
  return district.school || null;
}
