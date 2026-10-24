'use client';

import {Ellipsis} from 'lucide-react';
import type {Listing} from '@/lib/catalog';

export default function ListingFeedback({item,hidden=false,dismiss,restore,brandPreferences}: {
 item:Listing;hidden?:boolean;dismiss:()=>void;restore:()=>void;brandPreferences:()=>void;
}) {
 return <div className="listing-feedback">
  <button className="textbutton" onClick={hidden?restore:dismiss} aria-label={hidden?`Restore ${item.title}`:`Not for me: ${item.title}`}>{hidden?'Restore piece':'Not for me'}</button>
  <button className="icon-button feedback-more" onClick={brandPreferences} aria-label={`Brand preferences for ${item.brand}`} aria-haspopup="dialog"><Ellipsis aria-hidden="true"/></button>
 </div>;
}
