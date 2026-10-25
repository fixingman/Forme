"use client";
import Link from "next/link";
import { sameBrand } from "@/lib/domain/brands.mjs";
import { useRouter } from "next/navigation";
import { itemStatus } from "@/lib/domain/item-status.mjs";
import { listingGender } from "@/lib/domain/gender.mjs";
import { listingKey } from "@/lib/domain/recommendations.mjs";
import { classifyListing } from "@/lib/domain/classification.mjs";
import { isNew, type Preferences } from "@/lib/preferences";
import { images, type Listing } from "@/lib/catalog";
import { listingCondition, listingSize } from "@/lib/domain/presentation.mjs";
import { ExternalLink, Heart } from "lucide-react";
import ProductPhoto from "../product-photo";
import { ListingPrice } from "../listings/listing-metadata";
import ListingFeedback from "../listing-feedback";
const photo = (item: Listing) => item.imageUrl ?? images[item.image];
export default function ItemDetail({
  item,
  settings,
  toggleSave,
  dismiss,
  restorePiece,
  brandState,
  setBrand,
  excludeBrand,
}: {
  item: Listing;
  settings: Preferences;
  toggleSave: (id: number) => void;
  dismiss: (item: Listing) => void;
  restorePiece: (key: string) => void;
  brandState: (brand: string) => string;
  setBrand: (brand: string, state: string) => void;
  excludeBrand: (brand: string) => void;
}) {
  const router = useRouter();
  return (
    <>
      <button
        className="backlink textbutton"
        onClick={() => {
          if (window.history.state?.idx || window.history.length > 1) router.back();
          else router.push("/discover");
        }}
      >
        ← Back to browsing
      </button>
      <div className="detail">
        <div className="photo">
          <ProductPhoto
            src={photo(item)}
            sourceUrl={item.source ? item.sourceUrl : undefined}
            alt={item.source ? item.title : `Illustrative ${item.title}`}
          />
        </div>
        <div>
          <span className="eyebrow">
            {item.source ? (
              <>
                Vinted
                {isNew(item) && <span className="eyebrow-new">New to FORME</span>}
              </>
            ) : isNew(item) ? (
              "New today"
            ) : (
              `Added ${item.age} days ago · Sample listing`
            )}
          </span>
          <h1>{item.brand}</h1>
          <h2>{item.title}</h2>
          <Translation item={item} />
          <dl className="facts">
            {listingSize(item) && (
              <div>
                <dt>Size</dt>
                <dd>{listingSize(item)}</dd>
              </div>
            )}
            <div>
              <dt>Condition</dt>
              <dd>{listingCondition(item)}</dd>
            </div>
            {!!item.category && (
              <div>
                <dt>Category</dt>
                <dd>{item.category}</dd>
              </div>
            )}
          </dl>
          {!item.source && (
            <p className="detail-style">
              {item.style} · Illustrative rarity {item.rarity}/10
            </p>
          )}
          <div className="detail-price">
            <ListingPrice item={item} />
          </div>
          <StatusLine item={item} />
          <div className="detail-actions">
            <button
              className="btn"
              aria-pressed={settings.saved.includes(item.id)}
              title={settings.saved.includes(item.id) ? "Remove from saved" : undefined}
              onClick={() => toggleSave(item.id)}
            >
              <Heart
                aria-hidden="true"
                fill={settings.saved.includes(item.id) ? "currentColor" : "none"}
              />
              {settings.saved.includes(item.id) ? "Saved" : "Save item"}
            </button>
            {item.sourceUrl && (
              <a
                className="btn light"
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Vinted
                <ExternalLink aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            <ListingFeedback
              item={item}
              showStatus
              hidden={settings.dismissed.includes(listingKey(item))}
              dismiss={() => dismiss(item)}
              restore={() => restorePiece(listingKey(item))}
            />
          </div>
          <div className="brand-pref">
            <span className="brand-pref-label" id="brand-pref-label">
              {item.brand}
            </span>
            <div className="segmented" role="group" aria-labelledby="brand-pref-label">
              {["Following", "Neutral", "Excluded"].map((state) => (
                <button
                  key={state}
                  className={brandState(item.brand) === state ? "on" : ""}
                  aria-pressed={brandState(item.brand) === state}
                  aria-label={
                    state === "Following"
                      ? "Follow brand"
                      : state === "Excluded"
                        ? "Exclude brand"
                        : "Neutral"
                  }
                  onClick={() =>
                    state === "Excluded" ? excludeBrand(item.brand) : setBrand(item.brand, state)
                  }
                >
                  {state === "Following" ? "Follow" : state === "Excluded" ? "Exclude" : "Neutral"}
                </button>
              ))}
            </div>
            {settings.excluded.some((brand) => sameBrand(brand, item.brand)) && (
              <p className="brand-pref-note">
                Hidden from every feed. Change this any time in{" "}
                <Link href="/brands">Your brands</Link>.
              </p>
            )}
          </div>
          {item.source ? (
            <About item={item} />
          ) : (
            <p className="detail-sample-note">
              Illustrative product photo and fictional listing. Live availability, checkout and
              Vinted links will appear when a marketplace integration is connected.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * One status line under the price, only when it tells the reader something: a provider-confirmed state, or a listing not seen
 * for over a week. The everyday "availability not confirmed, last seen <date>" is the default for every listing, so it is not shown.
 */
function StatusLine({ item }: { item: Listing }) {
  const status = itemStatus(item);
  if (!status || status.tone === "neutral") return null;
  return (
    <p className="item-status" data-tone={status.tone} data-state={status.state}>
      <strong>{status.label}</strong>
      {status.detail && <span>{status.detail}</span>}
    </p>
  );
}

/** Translation, said once: a note while the English title is pending, or a quiet "show original" when it was translated. */
function Translation({ item }: { item: Listing }) {
  if (!item.source) return null;
  if (item.titleTranslation === "pending")
    return (
      <p className="translation-note">English title not available yet. Showing the original.</p>
    );
  if (!item.originalTitle || item.originalTitle === item.title) return null;
  return (
    <details className="original-listing">
      <summary>Translated · show original</summary>
      <p>{item.originalTitle}</p>
      {!!item.originalCondition && item.originalCondition !== item.condition && (
        <p>Condition: {item.originalCondition}</p>
      )}
      <p className="small">English wording may differ from the original.</p>
    </details>
  );
}

const DEPARTMENTS: Record<string, string> = {
  men: "Men",
  women: "Women",
  unisex: "Unisex",
  unknown: "Not specified",
};
const DEPARTMENT_EVIDENCE: Record<string, string> = {
  title: "stated in the title",
  provider: "from the listing label",
  "search-filter": "from the Men’s catalog search",
};
/** What FORME knows about the listing and how it knows it, one line per fact, evidence beside the value. */
function About({ item }: { item: Listing }) {
  const gender = listingGender(item),
    category = classifyListing(item);
  const rows: { label: string; value: string; evidence: string }[] = [
    {
      label: "Department",
      value: DEPARTMENTS[gender.gender] ?? "Not specified",
      evidence: DEPARTMENT_EVIDENCE[gender.genderSource] ?? "not provided",
    },
    {
      label: "Category",
      value:
        category.categorySource === "unknown"
          ? "Not classified"
          : category.productGroup.charAt(0).toUpperCase() + category.productGroup.slice(1),
      evidence: category.categorySource === "unknown" ? "" : "inferred from the title",
    },
  ];
  if (item.style)
    rows.push({
      label: "Style",
      value: item.style,
      evidence:
        item.styleSource === "title"
          ? `inferred from “${item.styleEvidence}”`
          : "inferred from the brand",
    });
  if (item.collectibleSignals?.length)
    rows.push({
      label: "Mentions",
      value: item.collectibleSignals.join(", "),
      evidence: "in the title, not a rarity rating",
    });
  return (
    <section className="about" aria-labelledby="about-title">
      <h3 id="about-title">About this listing</h3>
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <span className="v">{row.value}</span>
              {row.evidence && <span className="s">{row.evidence}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="about-note">
        Brand and condition are marketplace labels, not independently authenticated. Category and
        style are FORME’s inference.
      </p>
    </section>
  );
}
