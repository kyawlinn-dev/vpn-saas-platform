export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// Strips characters meaningful to the PostgREST filter-string grammar
// (,.()*) so user-supplied search text can't break out of an ilike pattern
// or inject sibling filter conditions inside an .or() expression.
export function sanitizeSearchTerm(value) {
  return String(value || "")
    .replace(/[,.()*]/g, " ")
    .trim()
    .slice(0, 100);
}
