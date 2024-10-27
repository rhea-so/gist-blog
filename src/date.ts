export function dateToYYYYMMDD(date: string): string {
  return date.split("T")[0];
}

export function dateToYYYYMMDDHHMMSS(date: string): string {
  return date.replace("T", " ").replace("Z", " ");
}
