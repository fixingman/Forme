// The reasons a person can give for "Not for me". One list, used by the dialog, validation, backups, ranking and learning.
export const REASONS = ["style", "material", "color", "price", "data", "unneeded", "similar", "unspecified"];
export const REASON_LABELS = {
  style: "Not my style",
  material: "Not the right material",
  color: "Not the right colour",
  price: "Too expensive",
  data: "Incorrect size/category",
  unneeded: "Not needed",
  similar: "Already have something similar",
  unspecified: "No reason",
};
/**
 * How the dialog groups the choices, so eight reasons read as three short questions instead of one long list. "No reason" is not
 * a choice: it is what a hide is until a reason is given, and the dialog offers to go back to it. Only the first group speaks
 * about taste; the others are kept as context and never train a dislike.
 */
export const REASON_GROUPS = [
  { id: "piece", label: "The piece", reasons: ["style", "material", "color"] },
  { id: "listing", label: "The listing", reasons: ["price", "data"] },
  { id: "need", label: "Your needs", reasons: ["unneeded", "similar"] },
];
/**
 * Reasons that are about one attribute of the piece, not a verdict on the brand or style. They only ever speak about the
 * piece's traits that start with the given prefix, so "wrong colour" can never penalise a brand that is otherwise liked.
 */
export const ATTRIBUTE_REASONS = { material: "material:", color: "color:" };
export const isReason = (value) => REASONS.includes(value);
