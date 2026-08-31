export class FetchBudgetExceededError extends Error {
  constructor(max: number) {
    super(`Fetch budget of ${max} requests per render exceeded.`);
    this.name = "FetchBudgetExceededError";
  }
}

/**
 * Caps the number of outbound fetches a single render may perform. Trivially
 * satisfied while only the target page is fetched (one call); starts to
 * matter once link forwarding can trigger further fetches within a render.
 */
export class FetchBudget {
  private used = 0;

  constructor(private readonly max: number = 20) {}

  use(): void {
    this.used += 1;
    if (this.used > this.max) {
      throw new FetchBudgetExceededError(this.max);
    }
  }
}
