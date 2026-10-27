"use client";
import Link from "next/link";
import type { Preferences } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";
import type { Backup } from "@/lib/settings-backup";
import { Header } from "../ui/page-states";
import { Tags, SlidersHorizontal, ChevronRight } from "lucide-react";
import AccountPanel from "../account-panel";
import HiddenPieces from "../hidden-pieces";
import SettingsTransfer from "../settings-transfer";
import type { useProfileSync } from "@/lib/use-profile-sync";
export default function SettingsPage({
  data,
  allListings,
  mode,
  collapsed,
  savedListings,
  restoreSettings,
  restorePiece,
  editReason,
  recoverHides,
  sync,
  reset,
}: {
  data: Preferences;
  allListings: Listing[];
  mode: "live" | "demo";
  collapsed: boolean;
  savedListings: Listing[];
  restoreSettings: (backup: Backup) => void;
  restorePiece: (key: string) => void;
  editReason?: (key: string) => void;
  recoverHides?: (settings: Preferences) => void;
  sync: ReturnType<typeof useProfileSync>;
  reset: () => void;
}) {
  return (
    <>
      <Header title="Settings" description="Make your edit feel more like you." />
      <AccountPanel sync={sync} />
      <div className="settings-links">
        <Link className="tile" href="/brands">
          <Tags />
          <strong>Your brands</strong>
          <p>
            {data.following.length} followed · {data.excluded.length} excluded
          </p>
          <ChevronRight />
        </Link>
        <Link className="tile" href="/styles">
          <SlidersHorizontal />
          <strong>My Styles</strong>
          <p>{data.styles.length} saved style preferences</p>
          <ChevronRight />
        </Link>
      </div>
      <section className="panel">
        <h3>Shopping filters</h3>
        <p>Manage departments and sizes together using My sizes in the top navigation.</p>
      </section>
      <HiddenPieces
        keys={data.dismissed}
        source={allListings}
        remembered={data.tasteFeedback}
        restore={restorePiece}
        editReason={editReason}
        recover={recoverHides}
      />
      <section className="panel">
        <h3>Your preferences</h3>
        <p>
          Changes save automatically in this browser. Export a backup to keep a copy or move to
          another browser.
        </p>
        <Link className="textlink" href="/welcome">
          Revisit setup →
        </Link>
      </section>
      <SettingsTransfer
        settings={data}
        display={{ mode, collapsed }}
        savedListings={savedListings}
        restore={restoreSettings}
      />
      <section className="panel settings-advanced">
        <h3>More options</h3>
        <Link className="settings-row" href="/tools">
          <span>
            <strong>Collection tools</strong>
            <small>Refresh listings, budgets and recommendation review</small>
          </span>
          <ChevronRight />
        </Link>
        <button className="textbutton danger" onClick={() => reset}>
          Reset preferences
        </button>
      </section>
    </>
  );
}
