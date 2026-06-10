import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb, closeDb } from "./client.ts";

await migrate(getDb(), { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
await closeDb();
console.log("✓ migrations applied");
