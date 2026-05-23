const DEFAULT_LIMIT = 4;
const MAX_QUERY_TERMS = 12;
const MAX_PASSAGE_CHARS = 700;

export class SimpleRetrieverService {
  search(query, documents = [], { limit = DEFAULT_LIMIT } = {}) {
    const terms = tokenize(query);
    if (!terms.length || !documents.length) return [];

    return documents
      .map((document) => scoreDocument(document, terms))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ document, score, matchedTerms }) => ({
        id: document.id,
        title: document.title,
        content: createPassage(document.content, matchedTerms),
        source: document.source,
        score,
        matchedTerms
      }));
  }
}

function scoreDocument(document, terms) {
  const haystack = `${document.title || ''}\n${document.content || ''}`.toLowerCase();
  const matchedTerms = [];
  let score = 0;

  for (const term of terms) {
    const occurrences = countOccurrences(haystack, term);
    if (occurrences > 0) {
      matchedTerms.push(term);
      score += occurrences;
      if (String(document.title || '').toLowerCase().includes(term)) score += 2;
    }
  }

  return { document, score, matchedTerms };
}

function tokenize(query) {
  return Array.from(new Set(
    String(query || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
      .slice(0, MAX_QUERY_TERMS)
  ));
}

function countOccurrences(text, term) {
  let count = 0;
  let index = text.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function createPassage(content, matchedTerms) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_PASSAGE_CHARS) return text;

  const lower = text.toLowerCase();
  const firstHit = matchedTerms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] || 0;
  const start = Math.max(0, firstHit - 120);
  return `${start > 0 ? '...' : ''}${text.slice(start, start + MAX_PASSAGE_CHARS)}...`;
}
