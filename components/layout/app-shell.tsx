"use client";
import Link from "next/link";
import { Heart, SlidersHorizontal, PanelLeftClose, PanelLeftOpen, Menu, X } from "lucide-react";
import {
  navigation as nav,
  shoppingNavigation,
  preferenceNavigation,
  mobileNavigation,
  moreNavigation,
} from "@/lib/navigation";
import type { Preferences } from "@/lib/preferences";
export default function AppShell({
  pathname,
  collapsed,
  toggleSidebar,
  settings,
  mode,
  freshnessStatus,
  filtersOpen,
  openFilters,
  menu,
  setMenu,
  children,
}: {
  pathname: string;
  collapsed: boolean;
  toggleSidebar: () => void;
  settings: Preferences;
  mode: string;
  freshnessStatus: React.ReactNode;
  filtersOpen: boolean;
  openFilters: () => void;
  menu: boolean;
  setMenu: (value: boolean) => void;
  children: React.ReactNode;
}) {
  const currentNav =
    nav.find(([path]) =>
      path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`),
    ) ?? (pathname.startsWith("/tools") ? nav.find(([path]) => path === "/settings") : undefined);
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-brand">
            <Link href="/" className="logo" aria-label="FORME Home">
              {collapsed ? "F" : "FORME"}
            </Link>
            <button
              className="collapse-button icon-button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={toggleSidebar}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </button>
          </div>
          <nav className="nav" aria-label="Main navigation">
            {shoppingNavigation.map(([path, label, Icon]) => (
              <Link
                key={path}
                href={path}
                aria-label={label}
                title={label}
                className={currentNav?.[0] === path ? "active" : ""}
                aria-current={currentNav?.[0] === path ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                <span className="nav-label">{label}</span>
              </Link>
            ))}
            <span className="nav-section-label">Your edit</span>
            {preferenceNavigation.map(([path, label, Icon]) => (
              <Link
                key={path}
                href={path}
                aria-label={label}
                title={label}
                className={currentNav?.[0] === path ? "active" : ""}
                aria-current={currentNav?.[0] === path ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                <span className="nav-label">{label}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <main className="main" id="main-content">
          <div className="topbar">
            <Link href="/" className="mobile-wordmark">
              FORME
            </Link>
            <div className="topright">
              {freshnessStatus}
              <button
                className={`chip global-filter-trigger ${settings.sizing.enabled || settings.gender.selected.length < 3 || !settings.gender.includeUnknown ? "active" : ""}`}
                aria-label="My sizes and departments"
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                onClick={openFilters}
              >
                <SlidersHorizontal aria-hidden="true" />
                <span>My sizes</span>
              </button>
              <Link
                className="chip"
                href="/saved"
                aria-label={`Saved items, ${settings.saved.length}`}
              >
                <Heart /> {settings.saved.length}
              </Link>
            </div>
          </div>
          <div className="content">
            {children}
            <footer className="footnote">
              {mode === "demo" ? "Illustrative sample listings and imagery" : null}
            </footer>
          </div>
        </main>
      </div>
      <nav className="mobilebar" aria-label="Mobile navigation">
        {mobileNavigation.map(([path, label, Icon]) => (
          <Link
            key={path}
            href={path}
            aria-label={label}
            title={label}
            className={currentNav?.[0] === path ? "active" : ""}
            aria-current={currentNav?.[0] === path ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            {label === "Saved Items" ? "Saved" : label === "Saved Searches" ? "Searches" : label}
          </Link>
        ))}
        <button
          className={moreNavigation.some(([path]) => pathname === path) ? "active" : undefined}
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-controls="more-menu"
        >
          <Menu aria-hidden="true" />
          More
        </button>
      </nav>
      {menu && (
        <div className="more-menu" id="more-menu">
          <div className="sectionhead">
            <h2>Your FORME</h2>
            <button
              className="textbutton"
              onClick={() => setMenu(false)}
              aria-label="Close more menu"
            >
              <X />
            </button>
          </div>
          {moreNavigation.map(([path, label, Icon]) => (
            <Link key={path} href={path} onClick={() => setMenu(false)}>
              <Icon aria-hidden="true" /> {label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
