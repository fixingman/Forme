"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus, X } from "lucide-react";
import MySizes from "./my-sizes";
import GenderPreferenceControl from "./gender-preference";
import { sameBrand } from "@/lib/domain/brands.mjs";
import type { Preferences } from "@/lib/preferences";
export default function Welcome({
  settings,
  brands,
  sizeLabels,
  finish,
  leave,
}: {
  settings: Preferences;
  brands: string[];
  sizeLabels: string[];
  finish: (value: Preferences) => void;
  leave: () => void;
}) {
  const router = useRouter(),
    params = useSearchParams();
  const steps = ["brands", "departments", "sizes"],
    requested = params.get("step") ?? "brands",
    step = steps.includes(requested) ? steps.indexOf(requested) : 0;
  const [draft, setDraft] = useState(settings),
    [query, setQuery] = useState("");
  const suggestions = brands
    .filter((brand) => brand.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 12);
  function toggle(brand: string) {
    setDraft((previous) => ({
      ...previous,
      following: previous.following.some((value) => sameBrand(value, brand))
        ? previous.following.filter((value) => !sameBrand(value, brand))
        : [...previous.following, brand],
      excluded: previous.excluded.filter((value) => !sameBrand(value, brand)),
    }));
  }
  function next(index: number) {
    router.push(`/welcome?step=${steps[index]}`, { scroll: true });
  }
  function add() {
    const brand = query.trim();
    if (brand && brand.length <= 100 && !draft.following.some((value) => sameBrand(value, brand)))
      toggle(brand);
    setQuery("");
  }
  return (
    <div className="welcome">
      <header className="welcome-top">
        <span className="logo">FORME</span>
        <button className="textbutton" onClick={() => finish(draft)}>
          Explore first
        </button>
      </header>
      <main className="welcome-main">
        <ol className="setup-steps" aria-label="Setup progress">
          {["Brands", "Departments", "Sizes"].map((label, index) => (
            <li key={label} aria-current={index === step ? "step" : undefined}>
              <span>{index < step ? <Check /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="welcome-heading">
          <p className="eyebrow">Make it yours · {step + 1} of 3</p>
          <h1>
            {step === 0
              ? "Start with the brands you love."
              : step === 1
                ? "Choose your departments."
                : "Find pieces in your sizes."}
          </h1>
          <p>
            {step === 0
              ? "Follow a few favorites. Discover uses them to suggest brands beyond your usual picks."
              : step === 1
                ? "These preferences apply across your feeds. You can change them any time."
                : "Choose the seller’s size labels you want to see. Clothing and shoe sizes stay separate."}
          </p>
        </div>
        {step === 0 ? (
          <>
            <form
              className="setup-brand-search"
              onSubmit={(event) => {
                event.preventDefault();
                add();
              }}
            >
              <label htmlFor="setup-brand-search">Find or add a brand</label>
              <div className="inline">
                <input
                  id="setup-brand-search"
                  type="search"
                  value={query}
                  maxLength={100}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search brands"
                />
                <button className="btn light" type="submit" disabled={!query.trim()}>
                  <Plus /> Add brand
                </button>
              </div>
            </form>
            <div className="setup-brand-options">
              {suggestions.map((brand) => (
                <button
                  className={`chip ${draft.following.some((value) => sameBrand(value, brand)) ? "active" : ""}`}
                  aria-pressed={draft.following.some((value) => sameBrand(value, brand))}
                  type="button"
                  key={brand}
                  onClick={() => toggle(brand)}
                >
                  {brand}
                  {draft.following.some((value) => sameBrand(value, brand)) && <Check />}
                </button>
              ))}
            </div>
            {draft.following.length > 0 && (
              <div className="setup-selected">
                <p>
                  {draft.following.length} followed{" "}
                  {draft.following.length === 1 ? "brand" : "brands"}
                </p>
                <div className="inline">
                  {draft.following.map((brand) => (
                    <button
                      className="chip active"
                      aria-label={`Remove ${brand}`}
                      key={brand}
                      onClick={() => toggle(brand)}
                    >
                      {brand}
                      <X />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="setup-actions">
              <span className="small">Your choices are saved when you finish setup.</span>
              <button className="btn" disabled={!draft.following.length} onClick={() => next(1)}>
                Continue <ArrowRight />
              </button>
            </div>
            <button
              className="textbutton setup-restore"
              onClick={() => {
                leave();
                router.push("/settings#backup");
              }}
            >
              Have a settings backup? Restore it
            </button>
          </>
        ) : step === 1 ? (
          <>
            <GenderPreferenceControl
              value={draft.gender}
              change={(gender) => setDraft({ ...draft, gender })}
            />
            <div className="setup-actions">
              <button className="btn light" onClick={() => next(0)}>
                <ArrowLeft /> Back
              </button>
              <button className="btn" onClick={() => next(2)}>
                Continue <ArrowRight />
              </button>
            </div>
          </>
        ) : (
          <>
            <MySizes
              value={draft.sizing}
              labels={sizeLabels}
              submitLabel="Finish setup"
              save={(sizing) => finish({ ...draft, sizing })}
            />
            <div className="setup-actions">
              <button className="textbutton" onClick={() => next(1)}>
                <ArrowLeft /> Back
              </button>
              <button className="textbutton" onClick={() => finish(draft)}>
                {draft.sizing.selected.length
                  ? "Keep current sizes and finish"
                  : "Skip sizes for now"}
              </button>
            </div>
          </>
        )}
      </main>
      <footer className="welcome-foot">
        Your preferences stay in this browser. You can export a backup in Settings.
      </footer>
    </div>
  );
}
