import { DateNumberFormat, DateRangeMode, DateString } from "../types";

export function generateDailyDates(
  startDate: DateString
): Array<DateNumberFormat> {
  const dates: Array<DateNumberFormat> = [];
  const currentDate = new Date(startDate);
  const endDate = new Date();

  while (currentDate <= endDate) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
    const day = currentDate.getDate();
    dates.push([year, month, day]);

    // Move to the next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

export function formatRange(start: Date, end: Date): string {
  const formattedStartDate = formatDate(start);
  const formattedEndDate = formatDate(end);
  return `${formattedStartDate}:${formattedEndDate}`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]; // Converts the date to "YYYY-MM-DD" format
}

export function getDateRange(date: DateNumberFormat, mode: DateRangeMode) {
  const [year, month, day] = date;
  const startDate = new Date(year, month - 1, day); // months are 0-indexed in JavaScript
  let endDate;

  switch (mode) {
    case "monthly":
      endDate = new Date(year, month, 0); // Automatically gets the last day of the given month
      break;
    case "weekly":
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // Adding 6 days to include a full week starting from day 1
      break;
    case "daily":
      endDate = new Date(startDate);
      break;
  }

  return formatRange(startDate, endDate);
}

export function getTodaysDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // getMonth returns 0-11, adding 1 adjusts to 1-12
  const day = today.getDate();

  // Pad the month and day with leading zeros if they are less than 10
  const formattedMonth = month < 10 ? `0${month}` : month.toString();
  const formattedDay = day < 10 ? `0${day}` : day.toString();

  return `${year}-${formattedMonth}-${formattedDay}`;
}
