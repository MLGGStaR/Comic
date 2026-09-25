// Domain types shared by the API client, the collection store and the views.

/** issue = a single comic; collection = trade paperback / hardcover / omnibus */
export type Format = 'issue' | 'collection';

/** Everything a grid, row or list needs to draw a comic without refetching. */
export interface ComicLite {
  id: string;
  title: string; // "Absolute Batman #2", "Absolute Batman Vol. 1: The Zoo"
  series: string | null; // "Absolute Batman"
  seriesId: string | null;
  number: string | null; // "2" — strings: "1.MU", "½", "0"
  format: Format;
  formatLabel?: string | null; // "Comic", "Trade Paperback", "Hardcover"…
  publisher: string | null;
  releaseDate: string | null; // YYYY-MM-DD
  cover: string | null;
  price: number | null; // cover price, USD
  pulls?: number | null; // popularity signal from the data source
  rating?: number | null; // community rating, 0–5
  consensus?: number | null; // % of readers who liked it (League of Comic Geeks)
}

export interface Variant {
  id: string; // catalogue id, or "custom:<uuid>" for a collector's photo
  name: string; // "Cover B Jim Lee Card Stock Variant"
  cover: string | null;
  price?: number | null;
  ratio?: string | null; // "1:25"
  custom?: boolean; // a cover the catalogue doesn't have, added from a photo
  by?: string | null; // who added it (custom covers)
}

export interface Creator {
  name: string;
  role: string; // "Writer", "Artist", "Cover Artist"…
}

export interface Review {
  source: string; // "League of Comic Geeks", "Longbox", critic outlet…
  user?: string | null;
  avatar?: string | null;
  rating?: number | null; // 0–5
  text: string;
  date?: string | null;
  url?: string | null;
  critic?: boolean;
}

export interface ComicDetail extends ComicLite {
  description?: string | null;
  creators: Creator[];
  pages?: number | null;
  upc?: string | null;
  isbn?: string | null;
  focDate?: string | null;
  variants: Variant[];
  reviews: Review[];
  ratingCount?: number | null;
  criticScore?: number | null; // 0–10
  criticCount?: number | null;
  userScore?: number | null; // 0–10, Comic Book Roundup readers
  userCount?: number | null;
  prev?: ComicLite | null;
  next?: ComicLite | null;
  sku?: string | null;
  foc?: string | null; // "Sep 28" (upcoming only)
  url?: string | null; // source page
  reviewsUrl?: string | null;
  characters?: string[];
  genres?: string[];
}

export interface SeriesDetail {
  id: string;
  title: string;
  publisher: string | null;
  years: string | null; // "2024 – Present"
  cover: string | null;
  description?: string | null;
  issues: ComicLite[];
  collections: ComicLite[];
  url?: string | null;
}

/** One comic in a user's collection. Flags are independent: you can own
 *  something you haven't read, or read something you don't own. */
export interface Entry {
  comicId: string;
  owned: boolean;
  read: boolean;
  wishlist: boolean;
  rating: number | null;
  readAt: string | null; // YYYY-MM-DD
  review: string | null;
  variants: OwnedVariant[]; // the covers owned; empty + owned = cover not picked yet
  paid: number | null; // what you paid, total
  value: number | null; // your own value override
  est: number | null; // latest market estimate for the copies you own
  meta: ComicLite;
  addedAt: string;
  updatedAt: string;
}

export interface OwnedVariant {
  id: string; // the comic's own id = main cover; variant id; "custom:<uuid>"
  name: string;
  cover: string | null;
  price?: number | null; // that cover's cover price, when known
  grade?: Grade | null; // slabbed copy: who graded it and the grade; absent = raw
}

export type GradeCompany = 'CGC' | 'CBCS' | 'PGX' | 'Other';
export interface Grade {
  by: GradeCompany;
  grade: number; // 0.5 – 10
}

export interface SearchResult {
  top: SearchHit | null;
  more: SearchHit[];
}

export type SearchHit =
  | { kind: 'comic'; comic: ComicLite }
  | { kind: 'series'; series: { id: string; title: string; publisher: string | null; years: string | null; cover: string | null; count?: number | null } };
