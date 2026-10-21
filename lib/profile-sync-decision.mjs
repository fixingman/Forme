/**
 * What this browser should do when it learns the server's profile state.
 * `marker` is what this browser last synced ({user, rev, dirty}) or null; `remote` is {revision} or null.
 *
 *  push-initial   server has nothing for this account: upload what this browser has.
 *  noop           already in step.
 *  push           this browser has unsynced edits on top of the server's latest revision.
 *  pull           server is newer and this browser has no unsynced edits: adopt it quietly.
 *  pull-conflict  server is newer AND this browser has unsynced edits: server wins, local copy is kept aside.
 *  adopt-first    a browser that has never synced this account meets an existing profile: server wins, local copy kept aside.
 */
export function decideSync({marker,remote,user}){
 if(!remote)return 'push-initial';
 const mine=marker&&marker.user===user&&Number.isInteger(marker.rev)?marker:null;
 if(!mine)return 'adopt-first';
 if(mine.rev===remote.revision)return mine.dirty?'push':'noop';
 if(mine.rev<remote.revision)return mine.dirty?'pull-conflict':'pull';
 return 'adopt-first';// this browser claims a newer revision than the server has: the server was reset, so trust the server
}
export const syncMessage={
 'pull-conflict':'Your account was updated on another device. Those changes were applied; your unsynced edits here were kept aside.',
 'adopt-first':'Loaded the preferences saved in your account. This browser’s earlier copy was kept aside.',
 conflict:'Your account was updated on another device. Those changes were applied.'
};
