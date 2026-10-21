'use client';
import Link from 'next/link';
import type {Account,SyncState} from '@/lib/use-profile-sync';
const label:Record<SyncState,string>={off:'',loading:'Checking your account…','signed-out':'Not signed in',saved:'All changes saved to your account',saving:'Saving…',offline:'Offline — changes are kept here and will sync when you’re back'};
export default function AccountPanel({sync}:{sync:{state:SyncState;account:Account;retry:()=>void}}){
 if(sync.state==='off')return null;
 return <section className="panel" aria-labelledby="account-title"><h3 id="account-title">Account</h3>
  {sync.account?<><p>Signed in as <strong>{sync.account.email}</strong>{sync.account.role==='owner'?' · owner':''}</p><p className="small" role="status">{label[sync.state]}</p>
   <div className="inline">{sync.state==='offline'&&<button className="btn light" onClick={sync.retry}>Try again</button>}
   <form method="post" action="/auth/signout"><button className="btn light" type="submit">Sign out</button></form></div></>
  :<><p className="small" role="status">{label[sync.state]}. Sign in to keep your preferences and saved items in step across your phone and computer.</p><Link className="btn light" href="/login">Sign in</Link></>}
 </section>;
}
