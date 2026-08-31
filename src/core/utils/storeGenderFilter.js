/**
 * Build a SQL WHERE fragment for Store.store_type.
 *
 * store_type is not normalized in the DB ("Male only", "Unisex", "Men's only", …).
 * male   → men/male salons + unisex
 * female → women/female salons + unisex
 * unisex → only salons marked as Unisex
 */
function storeTypeColumn(column) {
    return `LOWER(TRIM(${column}))`;
}

function strictUnisexMatch(column) {
    const col = storeTypeColumn(column);
    return `${col} IN ('unisex', 'unisex salon')`;
}

function maleTypeMatch(column) {
    const col = storeTypeColumn(column);
    return `(
      ${col} IN ('unisex', 'unisex salon', 'male')
      OR ${col} REGEXP '^male( only)?$'
      OR (
        ${col} REGEXP 'men|gents|mens'
        AND ${col} NOT REGEXP 'women|female|ladies'
      )
    )`;
}

function femaleTypeMatch(column) {
    const col = storeTypeColumn(column);
    return `(
      ${col} IN ('unisex', 'unisex salon', 'female')
      OR ${col} REGEXP '^female( only)?$'
      OR ${col} REGEXP 'women|ladies|womens|woman'
      OR (
        (${col} LIKE '%beauty parlour%' OR ${col} LIKE '%beauty parlor%')
        AND ${col} NOT REGEXP 'men|gents|male'
      )
    )`;
}

export function storeGenderWhereSql(column = "S.store_type", gender = null) {
    if (!gender) {
        return "";
    }

    const g = String(gender).toLowerCase().trim();
    if (!g || g === "all") {
        return "";
    }

    if (g === "male") {
        return `AND ${maleTypeMatch(column)}`;
    }

    if (g === "female") {
        return `AND ${femaleTypeMatch(column)}`;
    }

    if (g === "unisex") {
        return `AND ${strictUnisexMatch(column)}`;
    }

    return "";
}

/** Condition for Sequelize conditions[] arrays (no leading AND). */
export function storeGenderCondition(column = "S.store_type", gender = null) {
    const sql = storeGenderWhereSql(column, gender);
    return sql ? sql.replace(/^AND\s+/i, "") : "";
}

/**
 * Map StoreServicesProvidedFor option names → Store.store_type values
 * that user-app gender filters understand (see maleTypeMatch / femaleTypeMatch).
 *
 * Examples of option names: "Male", "Female", "Unisex", "Men", "Women".
 */
export function deriveStoreTypeFromServiceNames(names = []) {
    const normalized = names
        .map((n) => String(n || "").toLowerCase().trim())
        .filter(Boolean);

    if (!normalized.length) return null;

    const hasUnisex = normalized.some(
        (n) => n.includes("unisex") || n.includes("both") || n === "all"
    );
    const hasMale = normalized.some(
        (n) =>
            (n.includes("male") ||
                n.includes("men") ||
                n.includes("gents") ||
                n.includes("mens")) &&
            !n.includes("female") &&
            !n.includes("women")
    );
    const hasFemale = normalized.some(
        (n) =>
            n.includes("female") ||
            n.includes("women") ||
            n.includes("ladies") ||
            n.includes("woman")
    );

    if (hasUnisex || (hasMale && hasFemale)) return "Unisex";
    if (hasMale) return "Male only";
    if (hasFemale) return "Female only";

    // Fallback: keep first label if it already looks like a store_type
    return names[0] ? String(names[0]).trim() : null;
}

