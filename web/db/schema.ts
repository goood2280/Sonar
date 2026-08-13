import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaceState = sqliteTable("workspace_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stateKey: text("state_key").notNull().unique(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});
