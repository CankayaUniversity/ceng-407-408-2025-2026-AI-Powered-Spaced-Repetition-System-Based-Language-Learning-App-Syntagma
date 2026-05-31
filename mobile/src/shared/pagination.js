export async function collectPagedContent(fetchPage, { maxPages = 100 } = {}) {
  const all = [];
  let page = 0;
  let hasMore = true;

  while (hasMore && page < maxPages) {
    const data = await fetchPage(page);
    const content = Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data)
        ? data
        : [];

    all.push(...content);

    if (Array.isArray(data?.content)) {
      const totalPages = Number.isFinite(data?.totalPages) ? data.totalPages : null;
      const isLast = data?.last === true || (totalPages != null ? page >= totalPages - 1 : false);
      hasMore = !isLast;
    } else {
      hasMore = false;
    }

    page += 1;
  }

  return all;
}
