# Local core experience

Current behavior reviewed 24 October 2026. For architecture, verification evidence and remaining release work, see [project state](project-state.md).

## Customer flow

A browser without existing preferences starts in `/welcome`: brands, departments, then grouped sizes. Users can explore first or restore a settings backup. Setup commits choices only on completion; unfinished setup resumes on return. Step navigation supports browser Back and Forward. Existing v1/v2 preferences bypass onboarding and remain intact; setup can be revisited from Settings.

Primary navigation is Home, Discover, Following, Saved Searches and Saved Items, with Brands, My Styles and Settings beneath. Mobile has four main destinations plus More. Desktop collapse remains persistent and icon links keep accessible names. One global My sizes button beside Saved Items in the top navigation opens departments and sizes together. Opening or cancelling does not alter preferences; Apply filters commits both choices. All sizes is an explicit choice inside the panel and retains saved labels. Separate per-page department labels, size toggles and size-edit icons have been removed.

Home presents actual newly collected personal arrivals and observed price changes, rather than rebranding the initial stock as new. Saved-search summaries lead to the full matching feeds. Following covers followed brands. Live Discover ranks related brands outside those follows, explains the actual rule and supports save, Not for me, Undo and restoration from Settings. Feeds share department, category-aware sizes and brand exclusions; empty states never silently weaken preferences or delete saved items.

Grid feeds start with 24 pieces and reveal further batches automatically near the bottom, without a Show more counter. This only reveals existing listings; a plain Show more fallback remains for browsers without IntersectionObserver.

Product cards share metadata typography, show SEK once as `kr`, retain actual condition labels and use an accessible fallback when a photo fails. Detail pages retain original text, source links and listing freshness context. Data loading has a visible skeleton, an actionable retry on failure, and no implicit switch to fictional data. Browsing and retries only read the local API/static snapshot; they do not collect paid provider data.

Saved searches require an actual keyword, brand, size or price criterion. Their names are labels, not inferred matching rules. Imported legacy searches retain their criteria; a broad price-only search can still match a broad range of pieces. Creating a search or following a brand does not immediately fetch fresh marketplace results.

Styles remain editable preferences. Live Discover only exposes style chips with classified matches. Style ideas are preset rules, not a live AI model. No rarity or style labels are invented to fill empty feeds.

## Settings and collection tools

Settings contains a pointer to the global shopping filters, hidden-item restoration, brands/styles shortcuts and JSON backup/import. Existing localStorage keys, saved snapshots, v1 migration and backup format remain compatible.

`/tools` holds Demo/Vinted switching, collection coverage, refresh credit previews/caps, local profile checkpoints and feedback diagnostics. It is reached through Settings → Collection tools. Experimental rarity and digest previews remain available there; their legacy routes still work. They are outside primary shopping navigation. Paid collection and the ranking preview are loopback-only and enforce owner access when authentication is required. Hosted browsing cannot start these local jobs.

## Verification and remaining boundaries

The production build and TypeScript checks pass. Browser coverage includes existing navigation, preference migration, saves, searches, exclusions, sizes/departments, history, backup/import and explicit cost controls, plus first-time setup/resume, clean navigation, retry/photo fallback and mobile setup/search validation. Data tests cover normalization, ranking, observations, collection safeguards and budgets. Desktop and 390px mobile screenshots were reviewed against the existing live collection and personal preferences.

This work makes no paid provider or translation calls. Existing provider credits, listing history and personal backups are not reset. Supabase auth, profile sync and published listing reads exist. Remaining release work includes hosted deployment, real two-device verification, data-quality/freshness improvements and monitoring. Collection remains local by design. See [current remaining work](project-state.md#remaining-work).
