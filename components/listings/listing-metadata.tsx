import Link from "next/link";
import type { ReactNode } from "react";
import type { Listing } from "@/lib/catalog";
import { formatPrice, listingCondition, listingSize } from "@/lib/domain/presentation.mjs";

/** `note` sits on the price line itself (e.g. "excl. delivery and fees"), before any previous-price line. */
export function ListingPrice({ item, note }: { item: Listing; note?: ReactNode }) {
  return (
    <div className="price">
      {formatPrice(item.price, item.currency)}
      {note}
      {Number.isFinite(item.previousPrice) && item.previousPrice !== item.price && (
        <span className="previous-price">
          Previously {formatPrice(item.previousPrice!, item.currency)} ·{" "}
          {item.price < item.previousPrice! ? "down" : "up"}{" "}
          {formatPrice(Math.abs(item.price - item.previousPrice!), item.currency)}
        </span>
      )}
    </div>
  );
}
export default function ListingMetadata({ item, href }: { item: Listing; href?: string }) {
  const title = (
    <>
      <strong>{item.brand}</strong>
      <div className="title">{item.title}</div>
    </>
  );
  const size = listingSize(item);
  return (
    <>
      {href ? (
        <Link href={href} className="productlink">
          {title}
        </Link>
      ) : (
        title
      )}
      <div className="card-description">
        {listingCondition(item)}
        {size && <> · Size {size}</>}
      </div>
      <ListingPrice item={item} />
    </>
  );
}
