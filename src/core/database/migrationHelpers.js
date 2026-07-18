/**
 * Shared helpers for idempotent MySQL migrations.
 * Safe to re-run on DBs where changes were applied manually earlier.
 */

export async function columnExists(queryInterface, tableName, columnName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    { replacements: [tableName, columnName] }
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

export async function getColumnType(queryInterface, tableName, columnName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COLUMN_TYPE AS columnType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    { replacements: [tableName, columnName] }
  );
  return rows?.[0]?.columnType || null;
}

export async function addColumnIfMissing(
  queryInterface,
  tableName,
  columnName,
  columnDefinitionSql
) {
  if (await columnExists(queryInterface, tableName, columnName)) {
    console.log(
      `[migrate] skip: ${tableName}.${columnName} already exists`
    );
    return false;
  }
  await queryInterface.sequelize.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDefinitionSql}`
  );
  console.log(`[migrate] added: ${tableName}.${columnName}`);
  return true;
}

export async function dropColumnIfExists(queryInterface, tableName, columnName) {
  if (!(await columnExists(queryInterface, tableName, columnName))) {
    console.log(
      `[migrate] skip drop: ${tableName}.${columnName} does not exist`
    );
    return false;
  }
  await queryInterface.sequelize.query(
    `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``
  );
  console.log(`[migrate] dropped: ${tableName}.${columnName}`);
  return true;
}
