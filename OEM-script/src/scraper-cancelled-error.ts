/** Thrown when the user stops the scraper (e.g. during detail list phase). */
export class ScraperCancelledError extends Error {
  constructor() {
    super('Scraper was stopped by the user.');
    this.name = 'ScraperCancelledError';
  }
}
