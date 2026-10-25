"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Heart } from "lucide-react";
import { usePathname } from "next/navigation";
import { canBrowse, freshness, availability } from "@/lib/domain/data-trust.mjs";
import { listingKey } from "@/lib/domain/recommendations.mjs";
import { isNew } from "@/lib/preferences";
import { images, type Listing } from "@/lib/catalog";
import { useFeed, type Explanation } from "./feed-context";
import ProductPhoto from "../product-photo";
import ListingFeedback from "../listing-feedback";
import ListingMetadata from "./listing-metadata";
export default function Card({ item }: { item: Listing }) {
  const { data, reasons, toggleSave, dismiss, restore, brandPreferences, recordVisible } =
    useFeed();
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!recordVisible || !element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
          recordVisible(item);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [item, recordVisible]);
  const discover = usePathname() === "/discover" && !!item.source;
  const saved = data.saved.includes(item.id);
  return (
    <article ref={element} className="product" data-testid={`listing-${item.id}`}>
      <div className="photo">
        <Link href={`/items/${item.id}`} aria-label={`View ${item.brand} ${item.title}`}>
          <ProductPhoto
            src={item.imageUrl ?? images[item.image]}
            alt={item.source ? item.title : `Illustrative ${item.title}`}
          />
        </Link>
        {isNew(item) ? (
          <span className="flag new">{item.source ? "New to FORME" : "New today"}</span>
        ) : !item.source && item.rarity >= 8 ? (
          <span className="flag rare">Rare find</span>
        ) : null}
        <button
          className={`heart ${saved ? "saved" : ""}`}
          onClick={() => toggleSave(item.id)}
          aria-label={`${saved ? "Unsave" : "Save"} ${item.brand} ${item.title}`}
          aria-pressed={saved}
        >
          <Heart fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="productmeta">
        <ListingMetadata item={item} href={`/items/${item.id}`} />
        {item.source && (!canBrowse(item) || freshness(item).state === "stale") && (
          <p className="listing-status">
            {!canBrowse(item) ? availability(item).label : "Price last observed over 7 days ago"}
          </p>
        )}
        <ListingFeedback
          item={item}
          hidden={data.dismissed.includes(listingKey(item))}
          dismiss={() => dismiss(item)}
          restore={() => restore(listingKey(item))}
          brandPreferences={() => brandPreferences(item.brand)}
        />
        {discover && <Why explanation={reasons.get(listingKey(item))} />}
      </div>
    </article>
  );
}

/** The one reason a piece was recommended; when there is more to say it sits behind a quiet "Why this?". */
function Why({ explanation }: { explanation?: Explanation }) {
  if (!explanation) return null;
  return (
    <div className="why">
      <p className="small">{explanation.reason}</p>
      {explanation.details.length > 0 && (
        <details className="why-details">
          <summary>Why this?</summary>
          <ul>
            {explanation.details.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
