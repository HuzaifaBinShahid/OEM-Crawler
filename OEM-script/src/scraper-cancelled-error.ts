export class ScraperCancelledError extends Error {
  constructor() {
    super("Scraper was stopped by the user.");
    this.name = "ScraperCancelledError";
  }
}

export class ScraperTimeoutError extends Error {
  constructor() {
    super("Scraper exceeded the allowed time.");
    this.name = "ScraperTimeoutError";
  }
}
