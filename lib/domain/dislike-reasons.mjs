// The reasons a person can give for "Not for me". One list, used by the dialog, validation, backups, ranking and learning.
export const REASONS = ["style", "material", "color", "price", "data", "unspecified"];
export const REASON_LABELS = {
  style: "Not my style",
  material: "Not the right material",
  color: "Not the right colour",
  price: "Too expensive",
  data: "Incorrect size/category",
  unspecified: "No reason",
};
/**
 * Reasons that are about one attribute of the piece, not a verdict on the brand or style. They only ever speak about the
 * piece's traits that start with the given prefix, so "wrong colour" can never penalise a brand that is otherwise liked.
 */
export const ATTRIBUTE_REASONS = { material: "material:", color: "color:" };
export const isReason = (value) => REASONS.includes(value);
