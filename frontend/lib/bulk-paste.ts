/** Parsing for the "Bulk add rooms" dialog (see
 * features/projects/BulkAddRoomsDialog.tsx) — turning a block of text
 * pasted from a spreadsheet into { room, apartment } rows.
 *
 * Two input shapes are supported, auto-detected from the pasted text
 * itself rather than asked about up front:
 *
 * 1. Two columns (copied straight out of a sheet with a Room column and an
 *    Apartment column) — clipboard paste from a spreadsheet preserves a
 *    tab between cells, so any line containing a tab is split on it.
 * 2. One column, apartment number folded into the room name — e.g.
 *    "Kitchen 101" — which is how this team's sheets are usually laid
 *    out. A trailing number (optionally with a letter, e.g. "103A") is
 *    peeled off the end of the line as the apartment.
 *
 * Either way this is a *first guess*, not a commit — BulkAddRoomsDialog
 * shows every row in an editable preview before anything is created, so a
 * wrong guess (a room that's legitimately just called "Bedroom 2" with no
 * apartment) costs a click to fix rather than a bad room getting created.
 */

export interface ParsedBulkRow {
  room: string;
  apartment: string; // "" means no apartment
}

const TRAILING_NUMBER_RE = /^(.*\S)\s+(\d+[A-Za-z]?)$/;
const BARE_NUMBER_RE = /^\d+[A-Za-z]?$/;

/** "101" -> "Apartment 101"; anything already more than a bare number
 * (e.g. a full second column already reading "Apartment 101" or "Unit 5B")
 * is left exactly as typed. */
function normaliseApartmentName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  return BARE_NUMBER_RE.test(trimmed) ? `Apartment ${trimmed}` : trimmed;
}

export function parseBulkRoomText(text: string, detectApartments: boolean): ParsedBulkRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const hasTabs = lines.some((l) => l.includes("\t"));

  return lines.map((line) => {
    if (hasTabs) {
      const [roomPart, aptPart = ""] = line.split("\t");
      return { room: roomPart.trim(), apartment: normaliseApartmentName(aptPart) };
    }
    if (detectApartments) {
      const match = TRAILING_NUMBER_RE.exec(line);
      if (match) {
        return { room: match[1].trim(), apartment: normaliseApartmentName(match[2]) };
      }
    }
    return { room: line, apartment: "" };
  });
}
