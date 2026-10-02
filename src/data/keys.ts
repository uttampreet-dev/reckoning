/** File-system and URL safe name for a ticker: "M&M" -> "M_M", "BAJAJ-AUTO" stays as it is. */
export const fileKey = (symbol: string) => symbol.toUpperCase().replace(/[^A-Z0-9-]/g, "_");
