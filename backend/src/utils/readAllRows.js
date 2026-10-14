// A factory creates a fresh, identically scoped and ordered query per page.
export async function readAllRows(queryFactory, pageSize = 1000) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await queryFactory().range(start, start + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}
