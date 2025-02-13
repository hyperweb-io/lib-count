import { APIClient, APIClientOptions } from "@interweb/fetch-api-client";

import {
  DateNumberFormat,
  DateRangeFormat,
  DateRangeMode,
  NPMDownloadResponse,
} from "../types";
import { getDateRange } from "../utils";

export interface Download {
  dateRange: DateRangeFormat;
  packageName: string;
}

export interface DownloadOpt {
  startDate: DateNumberFormat;
  range: DateRangeMode;
  packageName: string;
}

export const defaultNpmApiClientOpts: APIClientOptions = {
  restEndpoint: "https://api.npmjs.org/",
};

export interface NPMApiClientOpts extends APIClientOptions {}

export class NPMApiClient extends APIClient {
  constructor(options?: NPMApiClientOpts) {
    super({
      restEndpoint:
        options?.restEndpoint ?? defaultNpmApiClientOpts.restEndpoint,
    });
  }

  createDownloadUrl(opts: Download): string {
    return `/downloads/range/${opts.dateRange}/${opts.packageName}`;
  }

  public async download(opts: DownloadOpt): Promise<NPMDownloadResponse> {
    const downloadRange = getDateRange(opts.startDate, opts.range);
    return await this.get<NPMDownloadResponse>(
      this.createDownloadUrl({
        dateRange: downloadRange,
        packageName: opts.packageName,
      })
    );
  }

  public async getDownloadsForDateRange(
    packageName: string,
    startDate: string,
    endDate: string
  ): Promise<{ downloads: Array<{ downloads: number; day: string }> }> {
    const url = `/downloads/range/${startDate}:${endDate}/${packageName}`;
    return await this.get(url);
  }

  public async getDownloadsSinceCreation(
    packageName: string,
    creationDate: string
  ): Promise<{ downloads: Array<{ downloads: number; day: string }> }> {
    const today = new Date().toISOString().split("T")[0];
    return await this.getDownloadsForDateRange(
      packageName,
      creationDate,
      today
    );
  }
}
