"use client";
import Link from "next/link";
import type { Listing } from "@/lib/catalog";
import type { Preferences } from "@/lib/preferences";
import { Header, Empty } from "../ui/page-states";
import Grid from "../listings/listing-grid";
import { matchesStyle, suggestionRules } from "@/lib/preferences";
import { Suggestions } from "../listings/feed-sections";
import type { Modal } from "../preferences-dialog";
export default function StylesPage({
  data,
  mode,
  source,
  list,
  open,
  update,
  setToast,
}: {
  data: Preferences;
  mode: string;
  source: Listing[];
  list: Listing[];
  open: (modal: Modal) => void;
  update: (patch: Partial<Preferences>) => void;
  setToast: (message: string) => void;
}) {
  return (
    <>
      <Header title="My Styles" description="Keep the styles you want your edit to reflect.">
        <button className="btn" onClick={() => open({ kind: "style" })}>
          + Create style
        </button>
      </Header>
      {mode === "live" && !source.some((item) => item.style) && (
        <p className="section-note">
          Your style preferences are saved. Style filters appear in Discover when matching pieces
          are classified.
        </p>
      )}
      <div className="cards">
        {data.styles.map((style) => (
          <div className="tile" key={style}>
            <strong>{style}</strong>
            <p>
              {list.filter((item) => matchesStyle(item, style, data)).length} matching pieces ·{" "}
              {(data.styleRules[style] ?? suggestionRules[style] ?? [style]).join(", ")}
            </p>
            <div className="inline style-actions">
              {mode === "demo" || list.some((item) => matchesStyle(item, style, data)) ? (
                <Link className="btn light" href={`/discover?style=${encodeURIComponent(style)}`}>
                  View feed
                </Link>
              ) : (
                <span className="small">No classified matches yet</span>
              )}
              <button className="btn light" onClick={() => open({ kind: "style", name: style })}>
                Edit
              </button>
              <button
                className="textbutton"
                aria-label={`Remove ${style}`}
                onClick={() => {
                  update({
                    styles: data.styles.filter((value) => value !== style),
                  });
                  setToast(`${style} removed`);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {!data.styles.length && (
        <Empty>Create a style or add a suggestion below to personalize Discover.</Empty>
      )}
      <Suggestions />
    </>
  );
}
