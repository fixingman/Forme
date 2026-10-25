"use client";
import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { sizeKey, groupedSizing } from "@/lib/domain/sizes.mjs";
import type { Sizing, SizeGroups } from "@/lib/preferences";
const letters = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
const sizeGroups = [
  {
    key: "clothing",
    name: "Clothing · EU labels",
    labels: Array.from({ length: 17 }, (_, i) => `EU ${32 + i * 2}`),
  },
  {
    key: "waist",
    name: "Waist · W labels",
    labels: Array.from({ length: 21 }, (_, i) => `W${24 + i}`),
  },
  {
    key: "shoes",
    name: "Shoes · EU labels",
    labels: Array.from({ length: 31 }, (_, i) => `EU ${34 + i * 0.5}`),
  },
];
const groupNames = { clothing: "Clothing", waist: "Waist", shoes: "Shoes", other: "Unassigned" };
export default function MySizes({
  value,
  save,
  submitLabel = "Save my sizes",
  allowAllSizes = false,
  before,
  cancel,
}: {
  value: Sizing;
  labels: string[];
  save: (value: Sizing) => void;
  submitLabel?: string;
  allowAllSizes?: boolean;
  before?: ReactNode;
  cancel?: () => void;
}) {
  const [groups, setGroups] = useState<SizeGroups>(() => groupedSizing(value).groups as SizeGroups),
    [customGroup, setCustomGroup] = useState<keyof SizeGroups>("clothing");
  const [matchSelected, setMatchSelected] = useState(value.selected.length ? value.enabled : true);
  const selected = [...new Set(Object.values(groups).flat())];
  const [oneSize, setOneSize] = useState(value.includeOneSize),
    [unspecified, setUnspecified] = useState(value.includeUnspecified),
    [custom, setCustom] = useState(""),
    [error, setError] = useState("");
  function toggle(label: string, group: keyof SizeGroups) {
    const active = groups[group].some((item) => sizeKey(item) === sizeKey(label));
    if (!active && Object.values(groups).flat().length >= 50) {
      setError("Choose up to 50 size labels.");
      return;
    }
    setGroups((previous) => ({
      ...previous,
      [group]: active
        ? previous[group].filter((item) => sizeKey(item) !== sizeKey(label))
        : [...previous[group], label],
    }));
    setError("");
  }
  function add() {
    const label = custom.trim();
    if (!label || label.length > 40) {
      setError("Enter a size label, up to 40 characters.");
      return;
    }
    if (!groups[customGroup].some((item) => sizeKey(item) === sizeKey(label)))
      toggle(label, customGroup);
    setCustom("");
  }
  return (
    <form
      className="size-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (custom.trim()) {
          setError("Add your typed size before applying, or clear the field.");
          return;
        }
        save({
          enabled: selected.length > 0 && (!allowAllSizes || matchSelected),
          selected,
          groups,
          includeOneSize: oneSize,
          includeUnspecified: unspecified,
        });
      }}
    >
      <div className="size-form-body">
        {before}
        <div className="size-section-heading">
          <h3>Sizes</h3>
          <p>Choose the labels you wear. Clothing and shoes stay separate.</p>
        </div>
        {allowAllSizes && (
          <fieldset className="size-match-mode">
            <legend>Size matching</legend>
            <label>
              <input
                type="radio"
                name="size-matching"
                aria-label="My selected sizes"
                checked={matchSelected}
                onChange={() => setMatchSelected(true)}
              />
              <span>My sizes</span>
            </label>
            <label>
              <input
                type="radio"
                name="size-matching"
                checked={!matchSelected}
                onChange={() => setMatchSelected(false)}
              />
              <span>All sizes</span>
            </label>
          </fieldset>
        )}
        <section className="size-selection-summary" aria-label="Your size selection">
          <div className="size-selection-heading">
            <h4>Your selection</h4>
            {selected.length > 0 && (
              <button
                type="button"
                className="textbutton"
                onClick={() => {
                  setGroups({ clothing: [], waist: [], shoes: [], other: [] });
                  setCustom("");
                  setError("");
                }}
              >
                Clear sizes
              </button>
            )}
          </div>
          {selected.length ? (
            <div className="selected-sizes" aria-label="Selected size labels">
              {(Object.entries(groups) as [keyof SizeGroups, string[]][]).flatMap(
                ([group, values]) =>
                  values.map((label) => (
                    <button
                      type="button"
                      className="chip active"
                      key={`${group}:${label}`}
                      aria-label={`Remove size ${label} (${group})`}
                      onClick={() => toggle(label, group)}
                    >
                      {label}
                      <span className="selected-size-category">{groupNames[group]}</span>
                      <X aria-hidden="true" />
                    </button>
                  )),
              )}
            </div>
          ) : (
            <p className="small">No sizes selected. All sizes will be shown.</p>
          )}
          {allowAllSizes && !matchSelected && selected.length > 0 && (
            <p className="small">Showing all sizes. Your selection is kept for later.</p>
          )}
        </section>
        <fieldset className="size-letters">
          <legend>Clothing · letter sizes</legend>
          <div className="size-options">
            {letters.map((label) => (
              <button
                type="button"
                className={`chip ${groups.clothing.some((item) => sizeKey(item) === sizeKey(label)) ? "active" : ""}`}
                aria-pressed={groups.clothing.some((item) => sizeKey(item) === sizeKey(label))}
                onClick={() => toggle(label, "clothing")}
                key={label}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="size-groups">
          {sizeGroups.map((group) => (
            <details key={group.name}>
              <summary>
                <span>{group.name}</span>
                <span className="size-group-count">
                  {groups[group.key as keyof SizeGroups].length || "Choose"}
                </span>
              </summary>
              <div className="size-options">
                {group.labels.map((label) => (
                  <button
                    type="button"
                    key={label}
                    className={`chip ${groups[group.key as keyof SizeGroups].some((item) => sizeKey(item) === sizeKey(label)) ? "active" : ""}`}
                    aria-pressed={groups[group.key as keyof SizeGroups].some(
                      (item) => sizeKey(item) === sizeKey(label),
                    )}
                    onClick={() => toggle(label, group.key as keyof SizeGroups)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
        <details className="custom-size-section">
          <summary>Add another size</summary>
          <p className="small">Missing a label? Add it exactly as the seller writes it.</p>
          <div className="field">
            <label htmlFor="custom-size-category">Category</label>
            <select
              id="custom-size-category"
              aria-label="Custom size category"
              value={customGroup}
              onChange={(event) => setCustomGroup(event.target.value as keyof SizeGroups)}
            >
              <option value="clothing">Clothing</option>
              <option value="waist">Waist</option>
              <option value="shoes">Shoes</option>
              <option value="other">Unassigned</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="custom-size">Size label</label>
            <div className="size-add">
              <input
                id="custom-size"
                value={custom}
                maxLength={40}
                autoComplete="off"
                placeholder="e.g. W31, EU 50 or 42.5"
                onChange={(event) => setCustom(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    add();
                  }
                }}
              />
              <button type="button" className="btn light" onClick={add} aria-label="Add size">
                <Plus aria-hidden="true" /> Add
              </button>
            </div>
          </div>
        </details>
        <fieldset className="size-extra-options">
          <legend>Also include</legend>
          <label className="checkline">
            <input
              type="checkbox"
              aria-label="Include one-size and adjustable pieces"
              checked={oneSize}
              onChange={(event) => setOneSize(event.target.checked)}
            />
            One-size and adjustable pieces
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              aria-label="Include listings without a size or known category"
              checked={unspecified}
              onChange={(event) => setUnspecified(event.target.checked)}
            />
            Pieces with missing size information
          </label>
        </fieldset>
        <details className="size-matching-help">
          <summary>How matching works</summary>
          <p className="small">
            We match seller labels, including combinations such as M / 38 / 10. Clothing and shoe
            sizes are separate; size conversions are not guessed. Unassigned labels do not filter a
            known category. Saved searches may have their own size rules.
          </p>
        </details>
      </div>
      <div className="size-form-footer">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="size-footer-actions">
          <span className="small" aria-live="polite">
            {(allowAllSizes && !matchSelected) || !selected.length
              ? "All sizes"
              : `${selected.length} size ${selected.length === 1 ? "label" : "labels"} selected`}
          </span>
          <div>
            {cancel && (
              <button type="button" className="btn light" onClick={cancel}>
                Cancel
              </button>
            )}
            <button className="btn" type="submit">
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
