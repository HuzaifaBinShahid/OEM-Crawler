/** Thrown when the user stops the scraper (e.g. during detail list phase). */
export class ScraperCancelledError extends Error {
  constructor() {
    super('Scraper was stopped by the user.');
    this.name = 'ScraperCancelledError';
  }
}

/** Thrown when active scraping exceeds the allowed time (not while awaiting user selection). */
export class ScraperTimeoutError extends Error {
  constructor() {
    super('Scraper exceeded the allowed time.');
    this.name = 'ScraperTimeoutError';
  }
}
