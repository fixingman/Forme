// Shared display rules. These format recorded facts; they never alter stored data.
export function formatPrice(price, currency = "SEK") {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}
export function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function listingCondition(item) {
  const condition = item.condition?.trim();
  // A condition we could not translate is better shown as the seller wrote it than as a placeholder.
  if (condition === "Condition not translated" && item.originalCondition?.trim())
    return item.originalCondition.trim();
  return condition || (item.source ? "Condition not provided" : "Very good");
}
export function listingSize(item) {
  const size = item.size?.trim();
  return size && size.toLowerCase() !== "not provided" ? size : "";
}
