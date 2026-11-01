// What a failed read or write of the hosted learning history should tell the person, and what to keep for diagnosis. The old
// message blamed a missing migration for every failure, even though the tables exist and most calls succeed; a timeout and a
// missing table need different words. Every kind stays a temporary 503 for the client, so queued feedback is kept and retried.
const text = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
/**
 * @param {{code?: string, message?: string, details?: string, hint?: string} | null | undefined} error  a PostgREST / fetch error
 * @returns {{kind: "missing" | "timeout" | "network" | "auth" | "other", message: string}}
 */
export function describeHostedError(error) {
  const code = text(error?.code),
    all = `${text(error?.message)} ${text(error?.details)} ${text(error?.hint)}`;
  if (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(all)
  )
    return {
      kind: "missing",
      message:
        "The learning history tables are missing in your Supabase project. Apply the learning migration, then retry.",
    };
  if (
    code === "57014" ||
    code === "PGRST003" ||
    /statement timeout|canceling statement|timed? ?out|timeout/i.test(all)
  )
    return {
      kind: "timeout",
      message:
        "Your learning history is slow to respond right now. Your feedback is kept on this device and sent again automatically.",
    };
  if (
    code === "PGRST301" ||
    code === "42501" ||
    /jwt|not authori[sz]ed|permission denied|owner required|row-level security/i.test(all)
  )
    return {
      kind: "auth",
      message:
        "Your sign-in could not be confirmed for the learning history. Reload and sign in again if this continues.",
    };
  if (
    /fetch failed|network|econn|enotfound|etimedout|socket|failed to fetch|could not reach|offline/i.test(
      all,
    )
  )
    return {
      kind: "network",
      message:
        "The learning history could not be reached. Your feedback is kept on this device and sent again when you are connected.",
    };
  return {
    kind: "other",
    message:
      "The learning history is unavailable right now. Your feedback is kept on this device and sent again automatically.",
  };
}
/** The fields worth logging for diagnosis: codes and a short message only, never row data (the logger also redacts keys). */
export const hostedErrorFields = (error, operation) => ({
  operation,
  code: text(error?.code) || undefined,
  message: text(error?.message),
  details: text(error?.details) || undefined,
  hint: text(error?.hint) || undefined,
});
