import { APIClient, APIClientOptions } from "@interweb/fetch-api-client";

import {
  DateNumberFormat,
  DateRangeFormat,
  DateRangeMode,
  NpmDownloadResponse,
} from "../types";

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

  private formatDate([year, month, day]: DateNumberFormat): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  private createDownloadRangeUrl(
    startDate: DateNumberFormat,
    endDate: DateNumberFormat,
    packageName: string
  ): string {
    const start = this.formatDate(startDate);
    const end = this.formatDate(endDate);
    return `/downloads/range/${start}:${end}/${packageName}`;
  }

  public async download(opts: {
    startDate: DateNumberFormat;
    endDate: DateNumberFormat;
    packageName: string;
  }): Promise<NpmDownloadResponse> {
    return await this.get<NpmDownloadResponse>(
      this.createDownloadRangeUrl(
        opts.startDate,
        opts.endDate,
        opts.packageName
      )
    );
  }

  public async getDownloadsForDateRange(
    packageName: string,
    startDate: string,
    endDate: string
  ): Promise<NpmDownloadResponse> {
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
