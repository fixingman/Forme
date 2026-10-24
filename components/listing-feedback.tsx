'use client';

import {Ellipsis} from 'lucide-react';
import type {Listing} from '@/lib/catalog';

/**
 * "Not for me" for one piece, with Restore once it is hidden. On cards a "…" opens the brand preferences dialog
 * (`brandPreferences`); the item page already shows the full brand control, so it omits that and shows a status line instead.
 */
export default function ListingFeedback({item,hidden=false,dismiss,restore,brandPreferences,showStatus=false}: {
 item:Listing;hidden?:boolean;dismiss:()=>void;restore:()=>void;brandPreferences?:()=>void;showStatus?:boolean;
}) {
 return <div className="listing-feedback">
  <button className="textbutton" onClick={hidden?restore:dismiss} aria-label={hidden?`Restore ${item.title}`:`Not for me: ${item.title}`}>{hidden?'Restore piece':'Not for me'}</button>
  {showStatus&&hidden&&<span className="feedback-status" role="status">Hidden from your feeds</span>}
  {brandPreferences&&<button className="icon-button feedback-more" onClick={brandPreferences} aria-label={`Brand preferences for ${item.brand}`} aria-haspopup="dialog"><Ellipsis aria-hidden="true"/></button>}
 </div>;
}
