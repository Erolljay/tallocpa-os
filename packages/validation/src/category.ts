/**
 * Map a free-text category or description to a client's chart-of-accounts
 * entry. v1 is deterministic: exact match on the normalized account name or one
 * of its aliases. No fuzzy guessing — an unmatched item is flagged
 * `uncategorized` and shown to the reviewer, never silently mis-posted.
 */

export interface ChartAccount {
  code: string;
  name: string;
  aliases?: string[];
}

export interface CategoryMatch {
  matched: boolean;
  accountCode?: string;
  accountName?: string;
}

/** Lowercase, collapse non-alphanumerics to single spaces, trim. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function mapCategory(
  input: string | null | undefined,
  coa: ChartAccount[],
): CategoryMatch {
  const query = normalize(input ?? "");
  if (query.length === 0) return { matched: false };

  for (const account of coa) {
    if (normalize(account.name) === query) {
      return { matched: true, accountCode: account.code, accountName: account.name };
    }
    for (const alias of account.aliases ?? []) {
      if (normalize(alias) === query) {
        return { matched: true, accountCode: account.code, accountName: account.name };
      }
    }
  }
  return { matched: false };
}
