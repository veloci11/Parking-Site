import { db } from "./db";
import { ApiError } from "./security";
export function ensureConversationBlocks() {
  db().exec(
    "CREATE TABLE IF NOT EXISTS conversation_blocks(conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL,PRIMARY KEY(conversation_id,user_id))",
  );
}
const pairPredicate =
  "((c.buyer_id=? AND c.seller_id=?) OR (c.buyer_id=? AND c.seller_id=?))";
function pairBlocks(first: string, second: string) {
  ensureConversationBlocks();
  return db()
    .prepare(
      `SELECT b.user_id FROM conversation_blocks b JOIN conversations c ON c.id=b.conversation_id WHERE ${pairPredicate}`,
    )
    .all(first, second, second, first);
}
export function conversationBlockState(conversationId: string, userId: string) {
  const c = db()
    .prepare("SELECT buyer_id,seller_id FROM conversations WHERE id=?")
    .get(conversationId);
  if (!c || ![c.buyer_id, c.seller_id].includes(userId))
    throw new ApiError(403, "Action non autorisée.", "FORBIDDEN");
  const rows = pairBlocks(String(c.buyer_id), String(c.seller_id));
  return {
    blockedByMe: rows.some((r) => r.user_id === userId),
    blocked: rows.length > 0,
  };
}
export function removeOwnPairBlocks(conversationId: string, userId: string) {
  conversationBlockState(conversationId, userId);
  const c = db()
    .prepare("SELECT buyer_id,seller_id FROM conversations WHERE id=?")
    .get(conversationId)!;
  db()
    .prepare(
      `DELETE FROM conversation_blocks WHERE user_id=? AND conversation_id IN(SELECT c.id FROM conversations c WHERE ${pairPredicate})`,
    )
    .run(userId, c.buyer_id, c.seller_id, c.seller_id, c.buyer_id);
}
function blockedError() {
  throw new ApiError(
    409,
    "Cet interlocuteur est bloqué. Les nouveaux messages, contacts et demandes de visite sont désactivés.",
    "CONVERSATION_BLOCKED",
  );
}
export function assertContactOpen(first: string, second: string) {
  if (pairBlocks(first, second).length) blockedError();
}
export function assertConversationOpen(conversationId: string, userId: string) {
  if (conversationBlockState(conversationId, userId).blocked) blockedError();
}
