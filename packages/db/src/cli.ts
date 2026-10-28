import { Db } from "./db.ts";
import { migrate } from "./migrate.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const db = new Db({ connectionString: url, caCert: process.env.DATABASE_CA_CERT, max: 1 });
try {
  const applied = await migrate(db);
  console.log(applied.length ? `applied ${applied.join(", ")}` : "database is up to date");
} finally {
  await db.end();
}
