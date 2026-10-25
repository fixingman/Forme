"use client";
import { createContext, useContext } from "react";
import type { Preferences } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";
export type FeedWindow = { shown: number; scrollY: number };
/** One clear reason for a recommendation, plus optional different reasons for "Why this?". */
export type Explanation = { reason: string; details: string[] };
export const FeedContext = createContext<{
  data: Preferences;
  mode: string;
  windows: Map<string, FeedWindow>;
  list: Listing[];
  reasons: Map<string, Explanation>;
  toggleSave: (id: number) => void;
  addSuggestion: (name: string) => void;
  dismiss: (item: Listing) => void;
  recordVisible?: (item: Listing) => void;
  restore: (key: string) => void;
  brandPreferences: (brand: string) => void;
} | null>(null);

export function useFeed() {
  const value = useContext(FeedContext);
  if (!value) throw Error("Feed components require FeedContext");
  return value;
}
