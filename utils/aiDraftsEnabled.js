/** AI drafts stay off unless AI_DRAFTS_ENABLED=true in env. */
export function isAiDraftsEnabled() {
    return String(process.env.AI_DRAFTS_ENABLED || '').trim().toLowerCase() === 'true';
}
