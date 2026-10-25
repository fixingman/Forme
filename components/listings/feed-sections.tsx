"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { isNew, suggestionRules, type Search as SavedSearch } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";
import { useFeed } from "./feed-context";
import Card from "./listing-card";
import Grid from "./listing-grid";
import { Empty } from "../ui/page-states";
export function Section({
  title,
  href,
  values,
  description,
}: {
  title: string;
  href: string;
  values: Listing[];
  description?: string;
}) {
  return (
    <section className="feed-section">
      <div className="sectionhead">
        <div>
          <h2>{title}</h2>
          {description && <p className="small">{description}</p>}
        </div>
        <Link className="textlink" href={href}>
          View all →
        </Link>
      </div>
      <Grid values={values.slice(0, 4)} />
    </section>
  );
}
export function Suggestions() {
  const { data, addSuggestion } = useFeed();
  const names = Object.keys(suggestionRules).filter((name) => !data.styles.includes(name));
  return (
    <section className="suggestions">
      <div className="suggestion-label">
        <Sparkles />
        <div>
          <h2>Style ideas</h2>
          <p>Starting points for your personal edit</p>
        </div>
      </div>
      <div className="suggestion-options">
        {names.slice(0, 3).map((name) => (
          <div className="suggestion-option" key={name}>
            <span>{name}</span>
            <button
              className="icon-button"
              onClick={() => addSuggestion(name)}
              aria-label={`Add style ${name}`}
              title={`Add ${name} to My Styles`}
            >
              <Plus />
            </button>
          </div>
        ))}
        {!names.length && <Link href="/styles">Edit your styles →</Link>}
      </div>
    </section>
  );
}
export function ProductRail({ search, values }: { search: SavedSearch; values: Listing[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: false, right: false });
  function measure() {
    const el = ref.current;
    if (el)
      setPosition({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
  }
  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [values.length]);
  return (
    <section className="search-feed">
      <div className="sectionhead">
        <div>
          <Link href={`/searches/${search.id}`}>
            <h2>{search.name}</h2>
          </Link>
          <p>
            {values.length} matches · {values.filter(isNew).length}{" "}
            {values.some((item) => item.source) ? "new this week" : "new today"}
          </p>
        </div>
        <div className="rail-actions">
          <Link className="textlink" href={`/searches/${search.id}`}>
            View search
          </Link>
          {(position.left || position.right) && (
            <>
              <button
                className="icon-button"
                aria-label={`Previous ${search.name} pieces`}
                disabled={!position.left}
                onClick={() =>
                  ref.current?.scrollBy({
                    left: -ref.current.clientWidth * 0.8,
                    behavior: "smooth",
                  })
                }
              >
                <ChevronLeft />
              </button>
              <button
                className="icon-button"
                aria-label={`Next ${search.name} pieces`}
                disabled={!position.right}
                onClick={() =>
                  ref.current?.scrollBy({
                    left: ref.current.clientWidth * 0.8,
                    behavior: "smooth",
                  })
                }
              >
                <ChevronRight />
              </button>
            </>
          )}
        </div>
      </div>
      {values.length ? (
        <div
          ref={ref}
          className="product-rail"
          onScroll={measure}
          tabIndex={0}
          role="region"
          aria-label={`${search.name} matching pieces`}
        >
          {values.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <Empty>
          No matches yet. <Link href={`/searches/${search.id}`}>Edit this search →</Link>
        </Empty>
      )}
    </section>
  );
}
