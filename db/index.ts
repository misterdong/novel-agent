import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "postgresql://novel_agent:novel_agent_local@localhost:5432/novel_agent";
const client = postgres(connectionString, { max: 5 });

export const db = drizzle(client, { schema });
