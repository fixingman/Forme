import { guard, currentAccess } from "./session";
import { localAccess } from "./local-access";
import { supabaseConfig } from "./auth-policy.mjs";
import { learningService } from "./learning.mjs";
import { localLearningStore, hostedLearningStore } from "./learning-store.mjs";
const denied = (error: string, status: number) => ({
  denied: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }),
});
/** Shared owner/account boundary for the learning journal and local advisory analysis. */
export async function learningContext(request: Request) {
  const checked = await guard(request, { owner: true });
  if (!checked.ok) return { denied: checked.response };
  const account = supabaseConfig() ? await currentAccess() : null;
  if (account?.access.state === "uninvited") return denied("Owner access required.", 403);
  const allowed = account?.access.state === "allowed" ? account.access : null;
  if (allowed && !allowed.owner) return denied("Owner access required.", 403);
  if (!allowed && !localAccess(request)) return denied("Sign in required.", 401);
  const owner = allowed?.userId ?? "local",
    canTrain = localAccess(request);
  const repository =
    allowed && account?.supabase
      ? () => hostedLearningStore(account.supabase!)
      : () => localLearningStore(process.cwd(), owner);
  return {
    owner,
    canTrain,
    service: learningService({
      owner,
      repository,
      canTrain,
      auto: process.env.FORME_LEARNING_AUTO !== "0",
    }),
  };
}
