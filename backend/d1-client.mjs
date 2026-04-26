const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

export class D1Client {
  constructor(options = {}) {
    this.accountId = options.accountId || process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "";
    this.databaseId = options.databaseId || process.env.D1_DATABASE_ID || process.env.IMAGE_WORKBENCH_D1_DATABASE_ID || "";
    this.apiToken = options.apiToken || process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || "";
    this.apiBase = options.apiBase || process.env.CF_API_BASE || CLOUDFLARE_API_BASE;
  }

  get configured() {
    return Boolean(this.accountId && this.databaseId && this.apiToken);
  }

  assertConfigured() {
    if (!this.configured) {
      throw new Error("Missing D1 config. Set CF_ACCOUNT_ID, CF_API_TOKEN, and D1_DATABASE_ID.");
    }
  }

  async query(sql, params = []) {
    this.assertConfigured();
    const url = `${this.apiBase}/accounts/${encodeURIComponent(this.accountId)}/d1/database/${encodeURIComponent(this.databaseId)}/query`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.success === false) {
      const message = cloudflareErrorMessage(data) || `D1 query failed: HTTP ${response.status}`;
      throw new Error(message);
    }
    const result = Array.isArray(data.result) ? data.result[0] : data.result;
    if (result && result.success === false) {
      throw new Error(result.error || "D1 query failed");
    }
    return result || { results: [], meta: {} };
  }
}

function cloudflareErrorMessage(data) {
  if (!data) return "";
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map((error) => error.message || JSON.stringify(error)).join("; ");
  }
  if (data.error) return String(data.error);
  return "";
}
