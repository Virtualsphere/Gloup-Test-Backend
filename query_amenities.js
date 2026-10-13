import { connection } from './src/core/database/connection.js';

async function run() {
  const data = await connection.query('SELECT * FROM Aminities', { type: connection.QueryTypes.SELECT });
  console.log(data);
  process.exit(0);
}
run();
