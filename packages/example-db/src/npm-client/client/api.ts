import { APIClient, APIClientOptions } from "@interweb/fetch-api-client";

import { NPMResponse, NPMObject } from "../types";

export interface SearchOpts {
  type: "author" | "maintainer" | "publisher";
  username: string;
  size?: number;
  from?: number;
}

const MAX_SIZE = 250; // npm's max size per request

export const defaultNpmRegistryClientopts: APIClientOptions = {
  restEndpoint: "https://registry.npmjs.org",
};

export interface NPMRegistryClientOpts extends APIClientOptions {}

export class NPMRegistryClient extends APIClient {
  private dataDir: string;
  // https://registry.npmjs.org
  constructor(options: NPMRegistryClientOpts) {
    super({
      restEndpoint: options.restEndpoint,
    });
  }

  private createSearchUrl(opts: SearchOpts): string {
    const { type, username, size = MAX_SIZE, from = 0 } = opts;
    const searchQualifier = `${type}:${username}`;
    return `/-/v1/search?text=${encodeURIComponent(searchQualifier)}&size=${size}&from=${from}`;
  }

  public async search(opts: SearchOpts): Promise<NPMResponse> {
    return await this.get<NPMResponse>(this.createSearchUrl(opts));
  }

  public async getAllSearchResults(opts: SearchOpts): Promise<NPMResponse> {
    // Get first batch and total count
    const firstBatch = await this.search({
      ...opts,
      size: MAX_SIZE,
      from: 0,
    });

    const totalResults = firstBatch.total;
    const allResults = [...firstBatch.objects];

    // If we have more results, fetch them
    if (totalResults > MAX_SIZE) {
      const remainingBatches = Math.ceil((totalResults - MAX_SIZE) / MAX_SIZE);

      for (let i = 1; i <= remainingBatches; i++) {
        const from = i * MAX_SIZE;
        const batch = await this.search({
          ...opts,
          size: MAX_SIZE,
          from,
        });
        allResults.push(...batch.objects);
      }
    }

    return {
      objects: allResults,
      total: totalResults,
      time: firstBatch.time,
    };
  }

  public async creationDate(packageName: string): Promise<string> {
    const res = await this.get<any>(`/${packageName}`);
    if (!res.time.created) {
      throw new Error(`package issue: ${packageName}}`);
    }
    const date = new Date(res.time.created);
    const formattedDate = date.toISOString().split("T")[0];
    return formattedDate;
  }

  public async processSearches(searchOpts: SearchOpts[]): Promise<NPMResponse> {
    const packageMap = new Map<string, NPMObject>();
    let totalCount = 0;
    let lastTime = "";

    for (const opts of searchOpts) {
      const data = await this.getAllSearchResults(opts);
      totalCount += data.total;
      lastTime = data.time;

      // Dedupe by package name
      for (const obj of data.objects) {
        packageMap.set(obj.package.name, obj);
      }
    }

    return {
      objects: Array.from(packageMap.values()),
      total: totalCount,
      time: lastTime,
    };
  }
}
