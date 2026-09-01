// Input limits shared by the write endpoints.
//
// WHY THIS EXISTS. Two gaps, both only reachable by a signed-in teacher
// (identity is verified in _auth.js), but neither of which should depend
// on the client behaving:
//
// 1. FIELD-PATH INJECTION, and a latent bug behind it. boardSettings built
//    a Mongo update path by interpolating a client string:
//    { $set: { [`settings.${key}`]: value } }. Mongo reads a dot in a
//    field path as nesting, so this was never just a theoretical worry --
//    per-lesson settings build their key from the teacher's own lesson
//    title (see lessonBoardCountKey in boardConfig.js), so a lesson called
//    "Ch. 4 Review" produced `settings.slidingBoardsCount:0:Ch. 4 Review`,
//    which Mongo split into a nested document. On read the client looked
//    for the flat key, found nothing, and fell back to the default: that
//    lesson's board count silently never persisted.
//
// 2. UNBOUNDED GROWTH. Nothing capped how much any endpoint would store.
//    Vercel caps a request body around 4.5MB, but nothing capped the
//    NUMBER of writes, so a loop -- a bug as easily as an attacker --
//    could grow one teacher's document until it hit Mongo's 16MB ceiling,
//    at which point every further write for that teacher fails
//    permanently. A cap that rejects one oversized save is recoverable; a
//    document that has already grown past the limit is not.
//
// The limits are deliberately generous. They exist to stop the absurd
// case, not to second-guess a teacher with a lot of lessons.

export const LIMITS = {
  // Generous because a per-lesson key embeds the teacher's lesson title,
  // so this is not merely an identifier the app itself chose.
  SETTING_KEY: 256,
  SETTING_VALUE: 20_000,
  // Names, schools, subjects: a long real answer is maybe 80 characters.
  NAME: 200,
  // One freeform board field -- an agenda, a list of goals. Long by the
  // standards of anything a teacher types into a box on a board.
  TEXT_FIELD: 20_000,
  // A whole curriculum or checked-goals payload, serialized.
  PAYLOAD_BYTES: 2_000_000,
};

// The three characters Mongo gives special meaning inside a field path are
// percent-encoded before the path is built, and decoded on the way back
// out. Keys containing none of them -- every key that works today --
// encode to themselves, so nothing already stored has to move.
const ENCODE = { "%": "%25", ".": "%2E", $: "%24" };

export function encodeSettingKey(key) {
  return String(key).replace(/[%.$]/g, (ch) => ENCODE[ch]);
}

export function decodeSettingKey(key) {
  // %25 last, so a literal "%25" in a key round-trips instead of being
  // re-read as the escape for one of the others.
  return String(key)
    .replace(/%2E/g, ".")
    .replace(/%24/g, "$")
    .replace(/%25/g, "%");
}

/**
 * Rejects only what is genuinely unusable: empty, over-long, or carrying
 * control characters. Spaces, colons and punctuation are all legitimate --
 * see the lesson-title keys above.
 */
export function isValidSettingKey(key) {
  return typeof key === "string"
    && key.length > 0
    && key.length <= LIMITS.SETTING_KEY
    // eslint-disable-next-line no-control-regex
    && !/[\u0000-\u001F\u007F]/.test(key);
}

/**
 * Approximate serialized size of a value, in bytes.
 *
 * JSON.stringify can throw on a circular structure, which is itself a good
 * enough reason to reject the payload, so a throw counts as "too big"
 * rather than crashing the handler.
 */
export function payloadTooBig(value, maxBytes = LIMITS.PAYLOAD_BYTES) {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > maxBytes;
  } catch {
    return true;
  }
}

/** Trims a string to a maximum length, for fields where truncating beats rejecting. */
export function capString(value, max) {
  return typeof value === "string" ? value.slice(0, max) : value;
}
