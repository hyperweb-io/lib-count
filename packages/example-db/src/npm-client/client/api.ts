import { APIClient, APIClientOptions } from "@interweb/fetch-api-client";

import { NPMResponse, NPMObject } from "../types";

export interface Search {
  type: "author" | "maintainer" | "publisher";
  username: string;
  size?: number;
}

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

  createSearchUrl(opts: Search): string {
    return `/-/v1/search?text=${opts.type}:${opts.username}&size=${opts.size}`;
  }

  public async search(opts: Search): Promise<NPMResponse> {
    return await this.get<NPMResponse>(`/-/v1/search`, {
      text: `${opts.type}:${opts.username}`,
      size: opts.size ?? 100000,
    });
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

  public async processSearches(searchOpts: Search[]): Promise<NPMResponse> {
    const packageMap = new Map<string, NPMObject>();
    let totalCount = 0;
    let lastTime = "";

    for (const opts of searchOpts) {
      const data = await this.search(opts);
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
