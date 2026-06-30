/**
 * Keep FCM tokens only for the test user (vikalppaliwal00@gmail.com).
 * Clears User.device_id for everyone else and all Store.deviceId values.
 *
 * Usage:
 *   docker compose exec app node scripts/reset-fcm-tokens-for-test.mjs
 *   docker compose exec app node scripts/reset-fcm-tokens-for-test.mjs vikalppaliwal00@gmail.com
 */
import { connection } from "../src/core/database/connection.js";
import { extractFcmTokens } from "../src/core/utils/fcmTokenService.js";

const TEST_EMAIL = (process.argv[2] || "vikalppaliwal00@gmail.com").trim().toLowerCase();

async function main() {
    await connection.authenticate();

    const [users] = await connection.query(
        `SELECT id, email, device_id FROM User WHERE LOWER(email) = :email LIMIT 1`,
        { replacements: { email: TEST_EMAIL } }
    );

    if (!users.length) {
        console.error(`No user found for email: ${TEST_EMAIL}`);
        process.exit(1);
    }

    const testUser = users[0];
    const tokens = extractFcmTokens(testUser.device_id);
    const keptToken = tokens.length ? tokens[tokens.length - 1] : null;
    const keptDeviceId = keptToken ? JSON.stringify([keptToken]) : null;

    const [userClear] = await connection.query(
        `UPDATE User SET device_id = NULL WHERE id != :id`,
        { replacements: { id: testUser.id } }
    );

    if (keptDeviceId) {
        await connection.query(
            `UPDATE User SET device_id = :deviceId WHERE id = :id`,
            { replacements: { deviceId: keptDeviceId, id: testUser.id } }
        );
    } else {
        console.warn(
            `Warning: ${TEST_EMAIL} has no FCM token — open the app and register deviceId first.`
        );
    }

    const [storeClear] = await connection.query(
        `UPDATE Store SET deviceId = NULL WHERE deviceId IS NOT NULL`
    );

    const [remaining] = await connection.query(
        `SELECT
            (SELECT COUNT(*) FROM User WHERE device_id IS NOT NULL AND device_id != '' AND device_id != '[]') AS users_with_tokens,
            (SELECT COUNT(*) FROM Store WHERE deviceId IS NOT NULL AND deviceId != '' AND deviceId != '[]') AS stores_with_tokens`
    );

    console.log("FCM token reset complete");
    console.log(`Test user: ${TEST_EMAIL} (id ${testUser.id})`);
    console.log(
        `Kept token: ${keptToken ? `${keptToken.slice(0, 20)}...` : "none — register device in app"}`
    );
    console.log(`Users cleared: ${userClear.affectedRows ?? userClear}`);
    console.log(`Stores cleared: ${storeClear.affectedRows ?? storeClear}`);
    console.log(`Remaining users with tokens: ${remaining[0].users_with_tokens}`);
    console.log(`Remaining stores with tokens: ${remaining[0].stores_with_tokens}`);

    await connection.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
