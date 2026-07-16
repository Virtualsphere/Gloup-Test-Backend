// core/utils/excelParser.js
import XLSX from "xlsx";

/**
 * Parses an uploaded Excel buffer into an array of recipient objects.
 * Expects columns: "Number", "User Name", "Gender" (case-insensitive fallbacks included)
 * since that's the format the marketing team's sheet uses.
 *
 * @param {Buffer} buffer - raw excel file buffer (e.g. from multer's file.buffer)
 * @returns {{ phone: string, name: string|null, gender: string }[]}
 */
export function parseUsersFromExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  // defval: null -> keeps empty cells as null instead of dropping the key
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  const recipients = rows
    .map((row) => {
      const rawPhone =
        row["Number"] ?? row["number"] ?? row["Phone"] ?? row["phone"] ?? null;

      const rawName =
        row["User Name"] ?? row["Name"] ?? row["name"] ?? row["user_name"] ?? null;

      const rawGender =
        row["Gender"] ?? row["gender"] ?? "";

      // Excel often stores numbers as floats (e.g. 8056880490.0) - normalize to a clean digit string
      const phone =
        rawPhone === null || rawPhone === undefined
          ? null
          : String(rawPhone).trim().replace(/\.0$/, "");

      const gender = String(rawGender || "").trim();

      return {
        phone,
        name: rawName ? String(rawName).trim() : null,
        // "NULL" shows up literally in some rows of the source sheet - treat it as unspecified
        gender: gender.toLowerCase() === "null" ? "" : gender,
      };
    })
    // Drop rows with no usable phone number at all
    .filter((r) => r.phone);

  return recipients;
}