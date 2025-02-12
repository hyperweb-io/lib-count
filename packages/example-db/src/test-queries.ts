import { PoolClient } from "pg";

import { Closing, Gain, Income, Opening, Spending, Trade } from "./types";

const clearTableForYear = async (
  client: PoolClient,
  tableName: string,
  year: number
): Promise<void> => {
  const query = `DELETE FROM ${tableName} WHERE year = $1;`;
  await client.query(query, [year]);
};

export const insertTrades = async (
  client: PoolClient,
  trades: Trade[],
  year: number
): Promise<void> => {
  await clearTableForYear(client, "btx.trade", year);

  const query = `
      INSERT INTO btx.trade (date, action, symbol, volume, currency, account, total, price, fee, fee_currency, year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
    `;

  await Promise.all(
    trades.map((trade) =>
      client.query(query, [
        trade.Date,
        trade.Action,
        trade.Symbol,
        trade.Volume,
        trade.Currency,
        trade.Account,
        trade.Total,
        trade.Price,
        trade.Fee,
        trade.FeeCurrency,
        year,
      ])
    )
  );
};

export const insertIncome = async (
  client: PoolClient,
  incomes: Income[],
  year: number
): Promise<void> => {
  await clearTableForYear(client, "btx.income", year);

  const query = `
      INSERT INTO btx.income (date, action, account, symbol, volume, total, currency, memo, year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;

  await Promise.all(
    incomes.map((income) =>
      client.query(query, [
        income.Date,
        income.Action,
        income.Account,
        income.Symbol,
        income.Volume,
        income.Total,
        income.Currency,
        income.Memo,
        year,
      ])
    )
  );
};

export const insertSpending = async (
  client: PoolClient,
  spendings: Spending[],
  year: number
): Promise<void> => {
  await clearTableForYear(client, "btx.spending", year);

  const query = `
      INSERT INTO btx.spending (date, action, account, symbol, volume, total, currency, memo, year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;

  await Promise.all(
    spendings.map((spending) =>
      client.query(query, [
        spending.Date,
        spending.Action,
        spending.Account,
        spending.Symbol,
        spending.Volume,
        spending.Total,
        spending.Currency,
        spending.Memo,
        year,
      ])
    )
  );
};

export const insertOpenings = async (
  client: PoolClient,
  openings: Opening[],
  year: number
): Promise<void> => {
  await clearTableForYear(client, "btx.opening", year);

  const query = `
      INSERT INTO btx.opening (date, account, symbol, volume, price, currency, fee, total, year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;

  await Promise.all(
    openings.map((opening) =>
      client.query(query, [
        opening.Date,
        opening.Account,
        opening.Symbol,
        opening.Volume,
        opening.Price,
        opening.Currency,
        opening.Fee,
        opening.Total,
        year,
      ])
    )
  );
};

export const insertClosings = async (
  client: PoolClient,
  closings: Closing[],
  year: number
): Promise<void> => {
  await clearTableForYear(client, "btx.closing", year);

  const query = `
      INSERT INTO btx.closing (date, volume, symbol, price, currency, fee, cost, year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `;

  await Promise.all(
    closings.map((closing) =>
      client.query(query, [
        closing.Date,
        closing.Volume,
        closing.Symbol,
        closing.Price,
        closing.Currency,
        closing.Fee,
        closing.Cost,
        year,
      ])
    )
  );
};

export const insertGains = async (
  client: PoolClient,
  gains: Gain[],
  year: number
): Promise<void> => {
  await clearTableForYear(client, "btx.gain", year);

  const query = `
      INSERT INTO btx.gain (
        volume, symbol, date_acquired, date_sold, proceeds, cost_basis, gain, currency, unmatched,
        acquired_account, acquired_id, sold_account, sold_id, year
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);
    `;

  await Promise.all(
    gains.map((gain) =>
      client.query(query, [
        gain.Volume,
        gain.Symbol,
        gain.DateAcquired,
        gain.DateSold,
        gain.Proceeds,
        gain.CostBasis,
        gain.Gain,
        gain.Currency,
        gain.Unmatched ? true : false,
        gain.AcquiredAccount ?? null,
        gain.AcquiredId ?? null,
        gain.SoldAccount ?? null,
        gain.SoldId ?? null,
        year,
      ])
    )
  );
};
