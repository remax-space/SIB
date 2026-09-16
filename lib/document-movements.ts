/** Returns source pages, never an AI reconstruction of a procedural movement. */
export function locateMovement(pages: string[], number: string) {
  const markers = /\b(?:movimento|movimentação|mov\.?|evento|ev\.?)\s*(?:n[º°o.]?\s*)?[:#-]?\s*(\d+)(?:\.(\d+))?\b/gi
  const hits = new Set<number>()
  let continuing = false
  pages.forEach((page, index) => {
    const matches = [...page.matchAll(markers)]
    if (matches.some((match) => Number(match[1]) === Number(number))) {
      hits.add(index)
      // Continue only when all explicit identifiers on this page agree.
      // Mixed identifiers may be an index or citations, not a document boundary.
      continuing = matches.every((match) => Number(match[1]) === Number(number))
    } else if (matches.length) {
      continuing = false
    } else if (continuing) {
      hits.add(index)
    }
  })
  return [...hits].map((index) => ({ page: index + 1, text: pages[index] }))
}
