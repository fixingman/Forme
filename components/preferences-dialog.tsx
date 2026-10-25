"use client";
import Link from "next/link";
import Dialog from "./ui/dialog";
import GlobalFilters from "./global-filters";
import { catalog, type Listing } from "@/lib/catalog";
import { baseStyles, suggestionRules, type Preferences } from "@/lib/preferences";
export type Modal =
  | { kind: "search"; id?: number }
  | { kind: "style"; name?: string }
  | { kind: "reset" }
  | { kind: "sizes" }
  | { kind: "exclude-brand"; brand: string };

export default function PreferencesDialog({
  modal,
  data,
  source,
  formError,
  close,
  update,
  notify,
  saveSearch,
  saveStyle,
  brandState,
  excludeBrand,
  deleteSearch,
  reset,
}: {
  modal: Modal;
  data: Preferences;
  source: Listing[];
  formError: string;
  close: () => void;
  update: (patch: Partial<Preferences>) => void;
  notify: (message: string) => void;
  saveSearch: (event: React.FormEvent<HTMLFormElement>) => void;
  saveStyle: (event: React.FormEvent<HTMLFormElement>) => void;
  brandState: (brand: string) => string;
  excludeBrand: (brand: string) => void;
  deleteSearch: (id: number) => void;
  reset: () => void;
}) {
  const editSearch =
    modal.kind === "search" ? data.searches.find((search) => search.id === modal.id) : undefined;
  const editStyle = modal.kind === "style" ? modal.name : undefined;
  return (
    <Dialog
      className={
        modal.kind === "sizes"
          ? "filter-modal"
          : modal.kind === "exclude-brand"
            ? "brand-feedback-modal"
            : undefined
      }
      title={
        modal.kind === "search"
          ? `${editSearch ? "Edit" : "Create"} saved search`
          : modal.kind === "style"
            ? `${editStyle ? "Edit" : "Create"} style`
            : modal.kind === "sizes"
              ? "My sizes & departments"
              : modal.kind === "exclude-brand"
                ? `Hide ${modal.brand}?`
                : "Reset your preferences?"
      }
      close={close}
    >
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {modal.kind === "exclude-brand" ? (
        <>
          <p>
            Hide pieces from {modal.brand} across all your feeds.
            {brandState(modal.brand) === "Following"
              ? " You’ll also stop following this brand."
              : ""}{" "}
            Your saved pieces will stay saved.
          </p>
          <div className="inline">
            <button className="btn" onClick={() => excludeBrand(modal.brand)}>
              Not interested in {modal.brand}
            </button>
            <button className="btn light" onClick={close}>
              Cancel
            </button>
          </div>
          <p className="small section-note">
            Change this any time in{" "}
            <Link href="/brands" onClick={close}>
              Your brands → Excluded
            </Link>
            .
          </p>
        </>
      ) : modal.kind === "sizes" ? (
        <GlobalFilters
          cancel={close}
          settings={data}
          labels={source
            .map((item) => item.size)
            .filter((label) => label && label !== "Not provided")}
          apply={(filters) => {
            update(filters);
            close();
            notify("Filters applied to all feeds.");
          }}
        />
      ) : modal.kind === "search" ? (
        <form onSubmit={saveSearch}>
          <div className="field">
            <label htmlFor="search-name">Search name</label>
            <input
              id="search-name"
              name="name"
              required
              maxLength={80}
              defaultValue={editSearch?.name}
            />
          </div>
          <div className="field">
            <label htmlFor="search-keyword">Keywords (all words must match)</label>
            <input
              id="search-keyword"
              name="keyword"
              defaultValue={editSearch?.keyword}
              placeholder="e.g. leather jacket"
            />
          </div>
          <div className="field">
            <label htmlFor="search-brand">Brand (optional, exact name)</label>
            <input
              id="search-brand"
              name="brand"
              list="search-brand-catalog"
              defaultValue={editSearch?.brand}
            />
            <datalist id="search-brand-catalog">
              {catalog.map((brand) => (
                <option key={brand} value={brand} />
              ))}
            </datalist>
          </div>
          <div className="two">
            <div className="field">
              <label htmlFor="search-size">Size (optional)</label>
              <input id="search-size" name="size" defaultValue={editSearch?.size} placeholder="M" />
            </div>
            <div className="field">
              <label htmlFor="search-max">Maximum price, SEK</label>
              <input
                id="search-max"
                name="max"
                type="number"
                min="0"
                step="1"
                defaultValue={editSearch?.max}
                placeholder="2500"
              />
            </div>
          </div>
          <input type="hidden" name="alerts" value={editSearch?.alerts ? "on" : ""} />
          <div className="inline">
            <button className="btn" type="submit">
              {editSearch ? "Save changes" : "Create search"}
            </button>
            {editSearch && (
              <button
                type="button"
                className="btn danger"
                onClick={() => deleteSearch(editSearch.id)}
              >
                Delete search
              </button>
            )}
          </div>
        </form>
      ) : modal.kind === "style" ? (
        <form onSubmit={saveStyle}>
          <div className="field">
            <label htmlFor="style-name">Style name</label>
            <input
              id="style-name"
              name="name"
              required
              maxLength={50}
              defaultValue={editStyle}
              placeholder="e.g. Everyday minimal"
            />
          </div>
          <fieldset>
            <legend>Include pieces from these aesthetics</legend>
            {baseStyles.map((style) => (
              <label className="checkline" key={style}>
                <input
                  name="rules"
                  type="checkbox"
                  value={style}
                  defaultChecked={
                    editStyle
                      ? (
                          data.styleRules[editStyle] ??
                          suggestionRules[editStyle] ?? [editStyle]
                        ).includes(style)
                      : false
                  }
                />
                {style}
              </label>
            ))}
          </fieldset>
          <button className="btn" type="submit">
            Save style
          </button>
        </form>
      ) : (
        <>
          <p>Your saved items, searches, brands and styles will return to the sample defaults.</p>
          <div className="inline reset">
            <button className="btn danger" onClick={reset}>
              Reset preferences
            </button>
            <button className="btn light" onClick={close}>
              Keep my preferences
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
