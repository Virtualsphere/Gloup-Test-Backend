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

/**
 * Builds an Excel buffer for marketing/user exports.
 * Columns: Number | User Name | Gender (matches parseUsersFromExcel input format).
 *
 * @param {{ phone: string, name?: string|null, gender?: string|null }[]} rows
 * @returns {Buffer}
 */
export function buildUsersExcelBuffer(rows) {
  const sheetRows = [
    ["Number", "User Name", "Gender"],
    ...rows.map((row) => [
      row.phone,
      row.name ?? "",
      row.gender ?? "",
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

/* ---------------------------------------------------------------------- */
/*  Service bulk-upload parsing                                           */
/* ---------------------------------------------------------------------- */

// Normalizes headers so trailing spaces / typos in the template
// ("sevice name ", "service catagory ") don't break parsing.
function normalizeRow(row) {
  const out = {};
  for (const key in row) {
    out[key.trim().toLowerCase()] = row[key];
  }
  return out;
}

// Strips spaces/hyphens/punctuation and lowercases, so "Hair cut -M",
// "haircut - M", and "hair-cut-m" all compare equal.
export function normalizeCategoryKey(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Template stores duration as H.MM, e.g. 1.0 -> 1:00:00, 1.3 -> 1:30:00
export function formatDurationFromDecimal(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (isNaN(num) || num < 0) return null;

  const hours = Math.floor(num);
  const minutes = Math.round((num - hours) * 100); // 0.3 -> 30
  if (minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

export function parseServicesFromExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  return rawRows
    .map((raw, i) => {
      const row = normalizeRow(raw);

      const serviceName = (row["sevice name"] ?? row["service name"] ?? "").toString().trim();
      const categoryRaw = (row["service catagory"] ?? row["service category"] ?? "").toString().trim();
      const durationRaw = row["duration"];
      const amount = row["original price"];
      const discountedAmount = row["offer price"];

      // Only skip silently if literally every substantive field is empty —
      // gender/status/priority are excluded since they're often left at
      // dropdown defaults on unused rows further down the sheet.
      const rowIsCompletelyEmpty = [serviceName, categoryRaw, durationRaw, amount, discountedAmount].every(
        (v) => v === null || v === undefined || v.toString().trim() === ""
      );

      if (rowIsCompletelyEmpty) return null;

      return {
        rowNumber: i + 2, // +2 => header row + 1-indexing
        service_name: serviceName || null,
        duration_raw: durationRaw,
        category_raw: categoryRaw || null,
        gender_raw: (row["gender"] ?? "").toString().trim() || null,
        amount: amount,
        discounted_amount: discountedAmount,
        priority: row["priority"],
        status: (row["status"] ?? "").toString().trim().toLowerCase() || null,
      };
    })
    .filter(Boolean);
}