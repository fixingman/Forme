"use client";
import HomePage from "./pages/home-page";
import DiscoverPage from "./pages/discover-page";
import BrandsPage from "./pages/brands-page";
import StylesPage from "./pages/styles-page";
import ToolsPage from "./pages/tools-page";
import SettingsPage from "./pages/settings-page";

import Link from "next/link";
import PreferencesDialog, { type Modal } from "./preferences-dialog";
import AppShell from "./layout/app-shell";
import Dialog from "./ui/dialog";
import { Header, Empty, ListingSkeleton } from "./ui/page-states";
import { FeedContext } from "./listings/feed-context";
import Grid from "./listings/listing-grid";
import { ProductRail } from "./listings/feed-sections";
import ItemDetail from "./pages/item-detail";
import { canBrowse } from "@/lib/domain/data-trust.mjs";
import Welcome from "./welcome";

import { loadListings, type ListingSnapshot } from "@/lib/load-listings";
import RefreshControls from "./refresh-controls";
import FeedFreshness from "./feed-freshness";
import { useListingUpdates } from "@/lib/use-listing-updates";
import { feedbackSnapshot } from "@/lib/domain/taste-profile.mjs";
import RankingPreview from "./ranking-preview";
import UndoToast from "./undo-toast";
import DislikeReasonDialog from "./dislike-reason";
import LearningDashboard from "./learning-dashboard";
import { useLearning, type DislikeReason } from "@/lib/use-learning";
import { orderEligible } from "@/lib/domain/learning.mjs";
import { matchesGender } from "@/lib/domain/gender.mjs";
import { recommendListings, listingKey } from "@/lib/domain/recommendations.mjs";
import { groupedSizing } from "@/lib/domain/sizes.mjs";
import { passesListingReview } from "@/lib/domain/listing-review.mjs";
import { sameBrand } from "@/lib/domain/brands.mjs";
import { useProfileSync } from "@/lib/use-profile-sync";
import type { Backup } from "@/lib/settings-backup";
import { englishListing } from "@/lib/domain/listing-language.mjs";
import { Mail, SlidersHorizontal, Plus, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { catalog, items, type Listing } from "@/lib/catalog";
import {
  digestListings,
  initialPreferences,
  isNew,
  matchesStyle,
  normalizePreferences,
  searchListings,
  suggestionRules,
  visibleListings,
  type Preferences,
  type Search as SavedSearch,
} from "@/lib/preferences";

type FeedbackUndo =
  | { kind: "piece"; key: string }
  | {
      kind: "brand";
      brand: string;
      previous: "Following" | "Neutral" | "Excluded";
    };

export default function Forme() {
  const windows = useRef(new Map<string, import("./listings/feed-context").FeedWindow>());
  const pathname = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const [data, setData] = useState<Preferences>(initialPreferences),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const [mode, setMode] = useState<"live" | "demo">("live"),
    [snapshot, setSnapshot] = useState<ListingSnapshot | null>(null),
    [feedError, setFeedError] = useState("");
  const [savedListings, setSavedListings] = useState<Listing[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false),
    [retrying, setRetrying] = useState(false),
    [refreshOpen, setRefreshOpen] = useState(false);
  const [reasonKey, setReasonKey] = useState<string | null>(null);
  const [feedbackUndo, setFeedbackUndo] = useState<FeedbackUndo | null>(null);
  // The Undo toast clears itself (see undo-toast.tsx); hidden pieces and brands stay restorable from Settings → Hidden pieces and Your brands.
  useEffect(() => {
    try {
      setMode(localStorage.getItem("forme-data-mode") === "demo" ? "demo" : "live");
      setSavedListings(JSON.parse(localStorage.getItem("forme-saved-listings") ?? "[]"));
    } catch {}
    const controller = new AbortController();
    loadListings(controller.signal)
      .then(setSnapshot)
      .catch((error) => {
        if (!controller.signal.aborted)
          setFeedError(error.message ?? "Live listings could not be loaded. Please try again.");
      });
    return () => controller.abort();
  }, []);
  async function reloadListings() {
    setSnapshot(await loadListings());
    setFeedError("");
  }
  async function retryListings() {
    setRetrying(true);
    try {
      await reloadListings();
    } catch (error) {
      setFeedError((error as Error).message);
    } finally {
      setRetrying(false);
    }
  }
  function switchMode(value: "live" | "demo") {
    setMode(value);
    try {
      localStorage.setItem("forme-data-mode", value);
    } catch {}
  }
  const [collapsed, setCollapsed] = useState(false),
    [styleMenu, setStyleMenu] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null),
    [toast, setToast] = useState(""),
    [brandQuery, setBrandQuery] = useState(""),
    [brandTab, setBrandTab] = useState("All"),
    [menu, setMenu] = useState(false),
    [formError, setFormError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      let preferences = initialPreferences;
      try {
        const raw = localStorage.getItem("forme-v2") ?? localStorage.getItem("forme-v1");
        if (raw) {
          preferences = normalizePreferences(JSON.parse(raw));
          if (
            localStorage.getItem("forme-onboarding-pending") === "1" &&
            localStorage.getItem("forme-onboarding-complete") !== "1"
          )
            setNeedsSetup(true);
        } else if (localStorage.getItem("forme-onboarding-complete") !== "1") {
          localStorage.setItem("forme-onboarding-pending", "1");
          preferences = normalizePreferences({
            ...initialPreferences,
            following: [],
            excluded: [],
            styles: [],
            searches: [],
            saved: [],
          });
          setNeedsSetup(true);
        }
        setCollapsed(localStorage.getItem("forme-sidebar") === "collapsed");
      } catch {
        setStorageError(
          "Saved preferences could not be read. This session starts with the sample preferences.",
        );
      }
      try {
        const response = await fetch("/api/size-profile", {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2000)]),
          cache: "no-store",
        });
        if (response.ok) {
          const { profile, genderProfile } = await response.json();
          if (
            genderProfile &&
            typeof genderProfile.id === "string" &&
            localStorage.getItem("forme-gender-profile") !== genderProfile.id
          ) {
            preferences = normalizePreferences({
              ...preferences,
              gender: genderProfile.preference,
            });
            try {
              localStorage.setItem("forme-gender-profile", genderProfile.id);
            } catch {}
          }
          if (
            profile &&
            typeof profile.id === "string" &&
            localStorage.getItem("forme-size-profile") !== profile.id
          ) {
            preferences = normalizePreferences({
              ...preferences,
              sizing: profile.sizing,
            });
            try {
              localStorage.setItem("forme-size-profile", profile.id);
            } catch {}
          } else if (profile && !preferences.sizing.groups) {
            preferences = normalizePreferences({
              ...preferences,
              sizing: groupedSizing(preferences.sizing, profile.sizing?.groups?.clothing ?? []),
            });
          }
        }
      } catch {}
      if (!controller.signal.aborted) {
        setData(preferences);
        setReady(true);
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("forme-v2", JSON.stringify(data));
      } catch {
        setStorageError(
          "Browser storage is unavailable. Your changes will last for this session only.",
        );
      }
  }, [data, ready]);
  useEffect(() => {
    if (ready && needsSetup && pathname !== "/welcome") router.replace("/welcome");
  }, [ready, needsSetup, pathname, router]);
  useEffect(() => {
    setModal(null);
    setMenu(false);
    setStyleMenu(false);
    setRefreshOpen(false);
    setFormError("");
  }, [pathname]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menu]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("forme-sidebar", next ? "collapsed" : "expanded");
    } catch {}
  }
  function restoreSettings(backup: Backup) {
    const writes: Record<string, string> = {
      "forme-v2": JSON.stringify(backup.settings),
      "forme-saved-listings": JSON.stringify(backup.savedListings),
      "forme-data-mode": backup.display.mode,
      "forme-sidebar": backup.display.collapsed ? "collapsed" : "expanded",
    };
    const previous: Record<string, string | null> = {};
    try {
      for (const key of Object.keys(writes)) previous[key] = localStorage.getItem(key);
      for (const [key, value] of Object.entries(writes)) localStorage.setItem(key, value);
    } catch {
      for (const [key, value] of Object.entries(previous)) {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch {}
      }
      throw new Error(
        "Browser storage could not save the import. Your active settings were not changed.",
      );
    }
    setFeedbackUndo(null);
    setData(backup.settings);
    setSavedListings(backup.savedListings);
    setMode(backup.display.mode);
    setCollapsed(backup.display.collapsed);
    setStorageError("");
  }
  // Account sync keeps this browser's display choices (sidebar, demo/live); only preferences and saved items travel.
  const sync = useProfileSync({
    data,
    savedListings,
    ready,
    mode,
    collapsed,
    apply: (backup) => restoreSettings({ ...backup, display: { mode, collapsed } }),
    notify: setToast,
  });
  const update = (patch: Partial<Preferences>) =>
    setData((previous) => ({ ...previous, ...patch }));
  const open = (value: Modal) => {
    setFormError("");
    setModal(value);
  };
  function dismiss(item: Listing) {
    const key = listingKey(item);
    const eventId = learning.record(key, "dismiss", item, "unspecified");
    setData((previous) => ({
      ...previous,
      dismissed: [...previous.dismissed.filter((value) => value !== key), key].slice(-1000),
      tasteFeedback: [
        ...(previous.tasteFeedback ?? []).filter((row) => row.key !== key),
        {
          ...feedbackSnapshot(item),
          reason: "unspecified" as const,
          hiddenAt: new Date().toISOString(),
          ...(eventId ? { feedbackEventId: eventId } : {}),
        },
      ].slice(-200),
    }));
    setToast("");
    setFeedbackUndo({ kind: "piece", key });
  }
  function restorePiece(key: string) {
    learning.record(key, "restore");
    setData((previous) => ({
      ...previous,
      dismissed: previous.dismissed.filter((value) => value !== key),
    }));
    setFeedbackUndo(null);
    setToast("Piece restored");
  }
  function undoFeedback() {
    if (feedbackUndo?.kind === "piece") restorePiece(feedbackUndo.key);
    if (feedbackUndo?.kind === "brand") {
      const { brand, previous: state } = feedbackUndo;
      setBrand(brand, state);
      setFeedbackUndo(null);
    }
  }
  function excludeBrand(brand: string) {
    const previous = brandState(brand);
    setBrand(brand, "Excluded");
    setToast("");
    setFeedbackUndo({ kind: "brand", brand, previous });
    setModal(null);
  }

  useListingUpdates(mode === "live", (value) => {
    setSnapshot(value);
    setFeedError("");
  });
  const source: Listing[] = useMemo(
    () =>
      mode === "demo"
        ? items
        : (snapshot?.items.filter(passesListingReview).map((item) => englishListing(item)) ?? []),
    [mode, snapshot],
  );
  const allListings = useMemo(
    () => [
      ...source,
      ...savedListings
        .filter(passesListingReview)
        .map((item) => englishListing(item))
        .filter(
          (item) =>
            !source.some((row) => row.id === item.id) &&
            (mode === "live" ? !!item.source : !item.source),
        ),
    ],
    [source, savedListings, mode],
  );
  const baselineRecommendations = useMemo(
    () => recommendListings(source, data, { signals: allListings }),
    [source, data, allListings],
  );
  const learning = useLearning({
    settings: data,
    savedListings,
    items: source,
    identity:
      mode === "live" ? (sync.account?.email ?? (sync.state === "off" ? "local" : null)) : null,
    discover: pathname === "/discover",
    enabled: mode === "live",
  });
  const recommendations = useMemo(
    () =>
      learning.selectedKeys
        ? orderEligible(baselineRecommendations, learning.selectedKeys)
        : baselineRecommendations,
    [baselineRecommendations, learning.selectedKeys],
  );
  function changeReason(key: string, reason: DislikeReason) {
    const previous = data.tasteFeedback?.find((row) => row.key === key),
      item = allListings.find((row) => listingKey(row) === key);
    const eventId = previous?.feedbackEventId;
    const fresh = eventId
      ? learning.record(key, "reason", undefined, reason, eventId)
      : item
        ? learning.record(key, "dismiss", item, reason)
        : undefined;
    setData((value) => {
      const rows = value.tasteFeedback ?? [];
      if (rows.some((row) => row.key === key))
        return {
          ...value,
          tasteFeedback: rows.map((row) =>
            row.key === key
              ? { ...row, reason, ...(!eventId && fresh ? { feedbackEventId: fresh } : {}) }
              : row,
          ),
        };
      // A piece hidden before its details were remembered has no row yet: create one so the reason is not lost.
      const created = {
        ...(item ? feedbackSnapshot(item) : { key, brand: "", traits: [], style: "" }),
        reason,
        ...(fresh ? { feedbackEventId: fresh } : {}),
      };
      return { ...value, tasteFeedback: [...rows, created].slice(-200) };
    });
    setReasonKey(null);
    setToast("Reason saved. You can change it in Hidden pieces.");
  }
  const recommendationReasons = useMemo(
    () =>
      new Map(
        recommendations.map((entry) => [
          listingKey(entry.item),
          learning.selectedName === "current"
            ? { reason: entry.reason, details: entry.details }
            : {
                reason: "Within your preferences · learned ordering",
                details: ["Current preference context: " + entry.reason, ...entry.details],
              },
        ]),
      ),
    [recommendations, learning.selectedName],
  );
  const genderHidden = source.filter((item) => !matchesGender(item, data.gender)).length;
  const list = visibleListings(data, source).filter(canBrowse),
    fresh = list.filter(isNew),
    followed = list
      .filter((item) => data.following.some((brand) => sameBrand(brand, item.brand)))
      .sort((a, b) => a.age - b.age),
    rare = list.filter((item) => item.rarity >= 8).sort((a, b) => b.rarity - a.rarity);
  const selectedStyle = params.get("style") ?? "All";
  const toggleSave = (id: number) => {
    const item = allListings.find((row) => row.id === id);
    if (item) learning.record(listingKey(item), data.saved.includes(id) ? "unsave" : "save", item);
    const next = savedListings.filter((row) => row.id !== id);
    if (!data.saved.includes(id) && item) next.push(item);
    setSavedListings(next);
    try {
      localStorage.setItem("forme-saved-listings", JSON.stringify(next));
    } catch {
      setStorageError("The saved listing could not be stored in this browser.");
    }
    setData((previous) => ({
      ...previous,
      saved: previous.saved.includes(id)
        ? previous.saved.filter((value) => value !== id)
        : [...previous.saved, id],
    }));
  };
  const brandState = (brand: string) =>
    data.excluded.some((value) => sameBrand(value, brand))
      ? "Excluded"
      : data.following.some((value) => sameBrand(value, brand))
        ? "Following"
        : "Neutral";
  function setBrand(brand: string, state: string) {
    setFeedbackUndo(null);
    setData((previous) => ({
      ...previous,
      following: [
        ...previous.following.filter((value) => !sameBrand(value, brand)),
        ...(state === "Following" ? [brand] : []),
      ],
      excluded: [
        ...previous.excluded.filter((value) => !sameBrand(value, brand)),
        ...(state === "Excluded" ? [brand] : []),
      ],
    }));
    setToast(`${brand} · ${state}`);
  }
  function addSuggestion(name: string) {
    update({
      styles: [...data.styles, name],
      styleRules: { ...data.styleRules, [name]: suggestionRules[name] },
    });
    setToast(`${name} added to My Styles`);
  }
  const searchId = pathname.startsWith("/searches/") ? Number(pathname.split("/")[2]) : null;
  const activeSearch = data.searches.find((search) => search.id === searchId);
  const activeItem = pathname.startsWith("/items/")
    ? allListings.find((item) => item.id === Number(pathname.split("/")[2]))
    : undefined;
  const freshnessStatus =
    mode === "live" && snapshot ? (
      <FeedFreshness
        snapshot={snapshot}
        refresh={
          typeof window !== "undefined" && window.location.hostname === "127.0.0.1"
            ? () => setRefreshOpen(true)
            : undefined
        }
      />
    ) : null;
  let content: React.ReactNode;
  if (pathname === "/") {
    content = (
      <HomePage
        data={data}
        mode={mode}
        list={list}
        allListings={allListings}
        followed={followed}
        fresh={fresh}
      />
    );
  } else if (pathname === "/discover") {
    content = (
      <DiscoverPage
        data={data}
        mode={mode}
        recommendations={recommendations}
        list={list}
        selectedStyle={selectedStyle}
        activeEngine={learning.selectedName}
        setStyleMenu={setStyleMenu}
      />
    );
  } else if (pathname === "/following")
    content = (
      <>
        <Header title="Following" description="Keep up with the brands you already love.">
          <Link className="btn light" href="/brands">
            Manage brands
          </Link>
        </Header>
        <div className="feed-meta">
          {data.following.length} followed brands · {followed.length} matching pieces
        </div>
        {followed.length ? (
          <Grid values={followed} />
        ) : (
          <Empty
            title={
              data.following.length
                ? "No pieces from your brands right now"
                : "Follow your favorites"
            }
            action={
              <>
                <Link className="btn" href="/brands">
                  {data.following.length ? "Review brands" : "Find brands to follow"}
                </Link>
                {data.following.length > 0 && (
                  <Link className="btn light" href="/settings">
                    Review preferences
                  </Link>
                )}
              </>
            }
          >
            {data.following.length
              ? "Your brands are still followed. Try reviewing your preferences or explore Discover."
              : "Build your own feed by following the brands you want to keep up with."}
          </Empty>
        )}
      </>
    );
  else if (pathname === "/rare")
    content = (
      <>
        <Header
          title="Rare Finds"
          description="Archive silhouettes and standout pieces worth a closer look."
        />
        <div className="notice">
          {mode === "live"
            ? "Live rarity classification is not available yet."
            : "Rarity scores are illustrative, manually assigned to sample listings. They do not represent verified market scarcity."}
        </div>
        <Grid values={rare} />
      </>
    );
  else if (pathname === "/saved") {
    const saved = visibleListings(data, allListings).filter((item) => data.saved.includes(item.id));
    content = (
      <>
        <Header title="Saved Items" description="Keep the pieces you want to come back to." />
        <div className="feed-meta">
          {saved.length} saved {saved.length === 1 ? "piece" : "pieces"}
          {data.saved.length > saved.length
            ? ` · ${data.saved.length - saved.length} hidden or outside this collection`
            : ""}
        </div>
        {saved.length ? (
          <Grid values={saved} />
        ) : (
          <Empty
            title={
              data.saved.length
                ? "Your saved pieces are still saved"
                : "A place for your next finds"
            }
            action={
              <Link className="btn" href={data.saved.length ? "/settings" : "/discover"}>
                {data.saved.length ? "Review preferences" : "Explore Discover"}
              </Link>
            }
          >
            {data.saved.length
              ? "Your current preferences or collection hide these pieces. Changing a filter will not remove them."
              : "Tap the heart on any piece to save it here."}
          </Empty>
        )}
      </>
    );
  } else if (pathname === "/drops") {
    const digest = digestListings(data, source);
    content = (
      <>
        <Header
          title="Daily digest"
          description="Your delivery preview: today’s matches from the sources you choose."
        >
          <Link className="btn light" href="/tools?preview=digest#experiments">
            Digest settings
          </Link>
        </Header>
        <div className="digest-summary">
          <Mail />
          <div>
            <strong>{digest.length} new pieces in one daily summary</strong>
            <p>
              Combines followed brands, saved searches and styles enabled in Settings. Items may
              also appear in your feeds.
            </p>
            <p className="small">
              Delivery preview · {data.digestTime} · Scheduled delivery is not connected
            </p>
          </div>
        </div>
        <Grid values={digest} />
      </>
    );
  } else if (pathname === "/searches")
    content = (
      <>
        <Header
          title="Saved Searches"
          description="Matching pieces from the searches you’ve saved."
        >
          <button className="btn" onClick={() => open({ kind: "search" })}>
            <Plus /> New search
          </button>
        </Header>
        {data.searches.map((search) => (
          <ProductRail
            key={search.id}
            search={search}
            values={searchListings(list, search).sort((a, b) => a.age - b.age)}
          />
        ))}
        {!data.searches.length && (
          <Empty
            title="Keep a good search going"
            action={
              <button className="btn light" onClick={() => open({ kind: "search" })}>
                Create your first search
              </button>
            }
          >
            Save keywords, a brand or a price limit and check matching pieces here.
          </Empty>
        )}
      </>
    );
  else if (activeSearch) {
    const matches = searchListings(list, activeSearch);
    content = (
      <>
        <Link className="backlink" href="/searches">
          ← All saved searches
        </Link>
        <Header
          title={activeSearch.name}
          description={`${matches.length} matching pieces · ${matches.filter(isNew).length} ${mode === "live" ? "new this week" : "new today"}`}
        >
          <button
            className="btn light"
            onClick={() => open({ kind: "search", id: activeSearch.id })}
          >
            Edit search
          </button>
        </Header>
        <Grid values={matches.sort((a, b) => a.age - b.age)} />
      </>
    );
  } else if (pathname === "/styles")
    content = (
      <StylesPage
        data={data}
        mode={mode}
        source={source}
        list={list}
        open={open}
        update={update}
        setToast={setToast}
      />
    );
  else if (pathname === "/brands") {
    content = (
      <BrandsPage
        data={data}
        source={source}
        brandQuery={brandQuery}
        setBrandQuery={setBrandQuery}
        brandTab={brandTab}
        setBrandTab={setBrandTab}
        brandState={brandState}
        setBrand={setBrand}
      />
    );
  } else if (pathname === "/settings")
    content = (
      <SettingsPage
        data={data}
        allListings={allListings}
        mode={mode}
        collapsed={collapsed}
        savedListings={savedListings}
        restoreSettings={restoreSettings}
        restorePiece={restorePiece}
        sync={sync}
        editReason={setReasonKey}
        reset={() => open({ kind: "reset" })}
      />
    );
  else if (pathname === "/tools/learning")
    content = (
      <LearningDashboard
        settings={data}
        savedListings={savedListings}
        items={source}
        identity={
          mode === "live" ? (sync.account?.email ?? (sync.state === "off" ? "local" : null)) : null
        }
        historyCleared={() =>
          setData((value) => ({
            ...value,
            tasteFeedback: (value.tasteFeedback ?? []).map(({ feedbackEventId, ...row }) => row),
          }))
        }
      />
    );
  else if (pathname === "/tools/ranking-preview")
    content =
      mode === "live" ? (
        <RankingPreview settings={data} savedListings={savedListings} />
      ) : (
        <>
          <Header
            title="Ranking preview"
            description="Choose Vinted under Collection tools to compare existing listings."
          />
          <Link href="/tools" className="btn light">
            Collection tools
          </Link>
        </>
      );
  else if (pathname === "/tools")
    content = (
      <ToolsPage
        data={data}
        allListings={allListings}
        mode={mode}
        collapsed={collapsed}
        savedListings={savedListings}
        restoreSettings={restoreSettings}
        restorePiece={restorePiece}
        reloadListings={reloadListings}
        switchMode={switchMode}
        snapshot={snapshot}
        genderHidden={genderHidden}
        previewDigest={params.get("preview") === "digest"}
        update={update}
        editReason={setReasonKey}
      />
    );
  else if (activeItem)
    content = (
      <ItemDetail
        item={activeItem}
        settings={data}
        toggleSave={toggleSave}
        dismiss={dismiss}
        restorePiece={restorePiece}
        brandState={brandState}
        setBrand={setBrand}
        excludeBrand={(brand) => open({ kind: "exclude-brand", brand })}
      />
    );
  else
    content = (
      <>
        <Header
          title="This piece or page isn’t available."
          description="The link may be old, or the item may no longer be in your collection."
        />
        <Link className="btn" href="/">
          Return Home
        </Link>
      </>
    );

  function saveSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "").trim();
    if (!name) {
      setFormError("Enter a search name.");
      return;
    }
    if (!["keyword", "brand", "size", "max"].some((key) => String(values.get(key) ?? "").trim())) {
      setFormError("Add a keyword, brand, size or price limit to your search.");
      return;
    }
    const id = modal?.kind === "search" ? modal.id : undefined;
    const search: SavedSearch = {
      id: id ?? Date.now(),
      name,
      keyword: String(values.get("keyword") ?? "").trim(),
      brand: String(values.get("brand") ?? "").trim(),
      size: String(values.get("size") ?? "").trim(),
      max: String(values.get("max") ?? ""),
      alerts: values.get("alerts") === "on",
    };
    update({
      searches: id
        ? data.searches.map((value) => (value.id === id ? search : value))
        : [...data.searches, search],
    });
    setModal(null);
    router.push(`/searches/${search.id}`);
    setToast("Search saved");
  }
  function saveStyle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget),
      name = String(values.get("name") ?? "").trim(),
      rules = values.getAll("rules").map(String),
      old = modal?.kind === "style" ? modal.name : undefined;
    if (!name || !rules.length) {
      setFormError("Give your style a name and select at least one aesthetic.");
      return;
    }
    if (data.styles.some((style) => style !== old && style.toLowerCase() === name.toLowerCase())) {
      setFormError("You already have a style with that name.");
      return;
    }
    const styleRules = { ...data.styleRules };
    if (old) delete styleRules[old];
    styleRules[name] = rules;
    update({
      styles: old
        ? data.styles.map((style) => (style === old ? name : style))
        : [...data.styles, name],
      styleRules,
    });
    setModal(null);
    setToast("Style saved. Your Discover filters are updated.");
  }
  function finishSetup(value: Preferences) {
    setData(normalizePreferences(value));
    setNeedsSetup(false);
    try {
      localStorage.setItem("forme-onboarding-complete", "1");
      localStorage.removeItem("forme-onboarding-pending");
    } catch {
      setStorageError(
        "Your setup will last for this session only because browser storage is unavailable.",
      );
    }
    router.replace("/discover");
  }
  function leaveSetup() {
    setNeedsSetup(false);
    try {
      localStorage.setItem("forme-onboarding-complete", "1");
      localStorage.removeItem("forme-onboarding-pending");
    } catch {}
  }
  if (!ready)
    return (
      <div className="loading" aria-live="polite">
        FORME · Loading your edit…
      </div>
    );
  if (pathname === "/welcome")
    return (
      <Welcome
        settings={data}
        brands={[
          ...new Set([
            "Our Legacy",
            "Acne Studios",
            "Lemaire",
            "Studio Nicholson",
            "Auralee",
            "Margaret Howell",
            "COS",
            "Arket",
            ...catalog,
            ...source.map((item) => item.brand),
          ]),
        ]}
        sizeLabels={source.map((item) => item.size)}
        finish={finishSetup}
        leave={leaveSetup}
      />
    );
  const isShopping =
    ["/", "/discover", "/following", "/searches", "/saved"].includes(pathname) ||
    pathname.startsWith("/searches/");
  return (
    <FeedContext.Provider
      value={{
        data,
        mode,
        windows: windows.current,
        recordVisible: learning.visible,
        list,
        reasons: recommendationReasons,
        toggleSave,
        addSuggestion,
        dismiss,
        restore: restorePiece,
        brandPreferences: (brand) => open({ kind: "exclude-brand", brand }),
      }}
    >
      <AppShell
        pathname={pathname}
        collapsed={collapsed}
        toggleSidebar={toggleSidebar}
        settings={data}
        mode={mode}
        freshnessStatus={freshnessStatus}
        filtersOpen={modal?.kind === "sizes"}
        openFilters={() => open({ kind: "sizes" })}
        menu={menu}
        setMenu={setMenu}
      >
        {storageError && (
          <div className="notice" role="alert">
            {storageError}
          </div>
        )}
        {mode === "live" && (learning.pending > 0 || learning.error) && (
          <p className="small notice" role="status">
            {learning.pending > 0
              ? `Feedback kept on this device · ${learning.pending} pending.`
              : "Learning sync is unavailable."}
            {learning.error
              ? " Learning sync will retry when connected."
              : " Waiting for learning sync."}{" "}
            <Link href="/tools/learning">Learning details</Link>
          </p>
        )}
        {mode === "demo" && (
          <div className="demo-indicator" role="status">
            Demo · illustrative listings <Link href="/tools">Change source</Link>
          </div>
        )}
        {mode === "live" && feedError && (
          <div className="notice error-notice" role="alert">
            <span>{feedError}</span>
            <button className="btn light" disabled={retrying} onClick={() => void retryListings()}>
              {retrying ? "Trying again…" : "Retry listings"}
            </button>
          </div>
        )}
        {isShopping && mode === "live" && !snapshot && !feedError ? <ListingSkeleton /> : content}
      </AppShell>
      {refreshOpen && (
        <Dialog
          title="Find new pieces"
          className="refresh-modal"
          close={() => setRefreshOpen(false)}
        >
          <RefreshControls
            compact
            initialScope={
              pathname === "/discover"
                ? "discover"
                : pathname === "/following"
                  ? "following"
                  : "personal"
            }
            settings={data}
            savedListings={savedListings}
            refreshed={reloadListings}
            close={() => setRefreshOpen(false)}
          />
        </Dialog>
      )}
      {styleMenu && (
        <Dialog title="Your Discover filters" close={() => setStyleMenu(false)}>
          <p className="style-menu-intro">
            Edit your style preferences. Styles appear as Discover filters when matching pieces have
            been classified.
          </p>
          <div className="style-menu-list">
            {data.styles.map((style) => (
              <div key={style}>
                <span>{style}</span>
                <div>
                  <button
                    className="textbutton"
                    onClick={() => {
                      setStyleMenu(false);
                      open({ kind: "style", name: style });
                    }}
                  >
                    Edit<span className="sr-only"> {style}</span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${style}`}
                    onClick={() =>
                      update({
                        styles: data.styles.filter((value) => value !== style),
                      })
                    }
                  >
                    <X />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn"
            onClick={() => {
              setStyleMenu(false);
              open({ kind: "style" });
            }}
          >
            <Plus /> Create style
          </button>
        </Dialog>
      )}
      {modal && (
        <PreferencesDialog
          modal={modal}
          data={data}
          source={source}
          formError={formError}
          close={() => setModal(null)}
          update={update}
          notify={setToast}
          saveSearch={saveSearch}
          saveStyle={saveStyle}
          brandState={brandState}
          excludeBrand={excludeBrand}
          deleteSearch={(id) => {
            update({ searches: data.searches.filter((search) => search.id !== id) });
            setModal(null);
            router.push("/searches");
            setToast("Search deleted");
          }}
          reset={() => {
            setFeedbackUndo(null);
            setData(structuredClone(initialPreferences));
            setModal(null);
            router.push("/");
            setToast("Preferences reset");
          }}
        />
      )}
      {reasonKey && (
        <DislikeReasonDialog
          reason={data.tasteFeedback?.find((row) => row.key === reasonKey)?.reason}
          close={() => setReasonKey(null)}
          change={(reason) => changeReason(reasonKey, reason)}
        />
      )}
      <div className="toast-stack">
        {feedbackUndo && (
          <UndoToast
            key={
              feedbackUndo.kind === "piece"
                ? `piece:${feedbackUndo.key}`
                : `brand:${feedbackUndo.brand}`
            }
            message={
              feedbackUndo.kind === "piece"
                ? "Piece hidden from your feeds."
                : `${feedbackUndo.brand} hidden from your feeds.`
            }
            undoLabel={feedbackUndo.kind === "piece" ? "Undo Not for me" : "Undo brand exclusion"}
            onReason={
              feedbackUndo.kind === "piece"
                ? () => {
                    setReasonKey(feedbackUndo.key);
                    setFeedbackUndo(null);
                  }
                : undefined
            }
            onUndo={undoFeedback}
            onDismiss={() => setFeedbackUndo(null)}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </FeedContext.Provider>
  );
}
