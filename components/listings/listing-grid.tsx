"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Listing } from "@/lib/catalog";
import { useFeed } from "./feed-context";
import Card from "./listing-card";
import { Empty } from "../ui/page-states";

const BATCH_SIZE = 24;
export default function Grid({ values, id = "main" }: { values: Listing[]; id?: string }) {
  const { data, mode } = useFeed(),
    pathname = usePathname(),
    params = useSearchParams();
  // User navigation/filter intent starts its own window. Feedback, ranking changes and fresh
  // observations deliberately do not: removing one piece must not collapse an expanded feed.
  const viewKey = JSON.stringify([pathname, params.toString(), mode, data.gender, data.sizing, id]);
  return <ListingWindow key={viewKey} viewKey={viewKey} values={values} />;
}
function ListingWindow({ values, viewKey }: { values: Listing[]; viewKey: string }) {
  const { windows } = useFeed();
  const [shown, setShown] = useState(() => windows.get(viewKey)?.shown ?? BATCH_SIZE);
  const [manual, setManual] = useState(false),
    sentinel = useRef<HTMLDivElement>(null);
  const initialPosition = useRef(windows.get(viewKey)?.scrollY ?? 0);
  useLayoutEffect(() => {
    const previous = windows.get(viewKey);
    windows.set(viewKey, { shown, scrollY: previous?.scrollY ?? 0 });
  }, [shown, viewKey, windows]);
  useLayoutEffect(() => {
    // The layout persists across routes, so both expanded depth and position are available
    // before returning from an item. No preferences or listing data enter browser storage.
    const frame = requestAnimationFrame(() => {
      if (initialPosition.current > 0) window.scrollTo(0, initialPosition.current);
    });
    const remember = () => {
      const entry = windows.get(viewKey);
      if (entry) entry.scrollY = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remember);
    };
  }, [viewKey, windows]);
  useEffect(() => {
    if (shown >= values.length) return;
    if (typeof IntersectionObserver === "undefined") {
      setManual(true);
      return;
    }
    let advanced = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!advanced && entries.some((entry) => entry.isIntersecting)) {
          advanced = true;
          observer.disconnect();
          setShown((count) => count + BATCH_SIZE);
        }
      },
      { rootMargin: "0px 0px 500px 0px" },
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [shown, values.length]);
  return values.length ? (
    <>
      <div className="grid">
        {values.slice(0, shown).map((item) => (
          <Card key={item.id} item={item} />
        ))}
      </div>
      {shown < values.length && (
        <div ref={sentinel} className="load-more" data-testid="feed-load-more">
          {manual ? (
            <button className="btn light" onClick={() => setShown((count) => count + BATCH_SIZE)}>
              Show more
            </button>
          ) : (
            <span className="sr-only">More pieces appear as you scroll.</span>
          )}
        </div>
      )}
    </>
  ) : (
    <Empty
      title="No matching pieces yet."
      action={
        <Link className="btn light" href="/settings">
          Review preferences
        </Link>
      }
    >
      Try another style or review your preferences. Your saved choices have not changed.
    </Empty>
  );
}
