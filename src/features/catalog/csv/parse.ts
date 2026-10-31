// A small CSV reader (RFC 4180): quoted cells, doubled quotes, commas and line breaks inside quotes,
// CRLF or LF, and the byte-order mark Excel adds. Pure, so it is unit-tested; it never throws on
// malformed input, it reports it.

export type CsvParse = { rows: string[][]; error?: string };

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

export function parseCsv(input: string): CsvParse {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellStarted = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
    cellStarted = false;
  };
  const endRow = () => {
    endCell();
    // A completely empty line (one empty cell) is skipped.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && !cellStarted) {
      quoted = true;
      cellStarted = true;
    } else if (c === '"') {
      return { rows, error: `A quote in the middle of a cell (row ${rows.length + 1}). Put the whole cell in quotes and double any quote inside it.` };
    } else if (c === ",") endCell();
    else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (c === "\n") endRow();
    else {
      cell += c;
      cellStarted = true;
    }
    if (rows.length > MAX_CSV_ROWS + 1) return { rows, error: `The file has more than ${MAX_CSV_ROWS} rows. Split it into smaller files.` };
  }
  if (quoted) return { rows, error: "A quote was opened and never closed." };
  if (cell !== "" || row.length > 0) endRow();
  return { rows };
}

/** A cell that a spreadsheet could run as a formula gets a leading apostrophe on export. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Undoes the export guard: "'=cmd" read back is "=cmd". A plain "-" (clear this field) is left alone. */
export function uncsvGuard(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
