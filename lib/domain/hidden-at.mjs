/** When a piece was hidden: an ISO instant such as 2026-10-25T13:55:00.000Z. Anything else is dropped on load and refused in a backup. */
export const isHiddenAt = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,3})?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));
