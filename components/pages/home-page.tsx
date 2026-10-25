"use client";
import Link from "next/link";
import type { Listing } from "@/lib/catalog";
import type { Preferences } from "@/lib/preferences";
import { Header, Empty } from "../ui/page-states";
import Grid from "../listings/listing-grid";
import { Search, ChevronRight } from "lucide-react";
import { homeActivity } from "@/lib/domain/home-activity.mjs";
import { isNew, searchListings } from "@/lib/preferences";
import { Section } from "../listings/feed-sections";
export default function Page({
  data,
  mode,
  list,
  allListings,
  followed,
  fresh,
}: {
  data: Preferences;
  mode: string;
  list: Listing[];
  allListings: Listing[];
  followed: Listing[];
  fresh: Listing[];
}) {
  const activity = homeActivity(list, data, Date.now(), {
    signals: allListings,
  });
  const searchUpdates = data.searches.map((search) => ({
    search,
    hits: searchListings(mode === "live" ? list : fresh, search),
  }));
  return (
    <>
      <Header
        title="Home"
        description={
          mode === "live"
            ? "New finds and price changes from your collection."
            : "The latest from your brands and searches."
        }
      />
      {mode === "live" ? (
        <>
          <section className="feed-section">
            <div className="sectionhead">
              <div>
                <h2>New to FORME</h2>
                <p className="small">Newly found for your edit in the last 7 days.</p>
              </div>
              <Link className="textlink" href="/discover">
                Explore Discover →
              </Link>
            </div>
            {activity.arrivals.length ? (
              <Grid values={activity.arrivals.slice(0, 4)} />
            ) : (
              <div className="quiet-empty home-caught-up">
                <div>
                  <strong>You’re up to date</strong>
                  <p>New finds matching your preferences will appear here.</p>
                </div>
                <Link className="btn light" href={data.following.length ? "/following" : "/brands"}>
                  {data.following.length ? "Browse your brands" : "Choose your brands"}
                </Link>
              </div>
            )}
          </section>
          <section className="feed-section">
            <div className="sectionhead">
              <div>
                <h2>Price changes</h2>
                <p className="small">
                  Observed changes in the last 7 days, with saved pieces first.
                </p>
              </div>
            </div>
            {activity.changes.length ? (
              <Grid values={activity.changes.slice(0, 8)} />
            ) : (
              <p className="quiet-empty">
                No observed price changes yet. Save pieces you like to keep them close.
              </p>
            )}
          </section>
        </>
      ) : (
        <Section
          title="New from your brands"
          description={`${followed.filter(isNew).length} new pieces from brands you follow`}
          href="/following"
          values={followed.filter(isNew)}
        />
      )}
      <section className="feed-section">
        <div className="sectionhead">
          <h2>Your search updates</h2>
          <Link className="textlink" href="/searches">
            All searches →
          </Link>
        </div>
        <div className="search-updates">
          {searchUpdates.map(({ search, hits }) => (
            <Link key={search.id} className="search-update" href={`/searches/${search.id}`}>
              <Search />
              <div>
                <strong>{search.name}</strong>
                <p>
                  {hits.length
                    ? `${hits.length} ${mode === "demo" ? "new " : ""}${hits.length === 1 ? "match" : "matches"}`
                    : "No current matches"}
                </p>
              </div>
              <ChevronRight />
            </Link>
          ))}
        </div>
        {!searchUpdates.length && (
          <Empty>
            <Link href="/searches">Create a saved search →</Link>
          </Empty>
        )}
      </section>
    </>
  );
}
