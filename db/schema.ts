import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const imports = sqliteTable(
  "imports",
  {
    id: text("id").primaryKey(),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    rowCount: integer("row_count").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_imports_created_at").on(table.createdAt)],
);

export const routes = sqliteTable(
  "routes",
  {
    id: text("id").primaryKey(),
    importId: text("import_id").references(() => imports.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    route: text("route").notNull(),
    vehicle: text("vehicle").notNull(),
    driver: text("driver").notNull(),
    origin: text("origin").notNull().default(""),
    destination: text("destination").notNull().default(""),
    startOdometer: real("start_odometer"),
    endOdometer: real("end_odometer"),
    km: real("km").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    liters: real("liters").notNull(),
    dieselPrice: real("diesel_price").notNull(),
    revenue: real("revenue").notNull(),
    otherCosts: real("other_costs").notNull().default(0),
    operationalStatus: text("operational_status").notNull().default("Concluída"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_routes_date").on(table.date),
    index("idx_routes_import_id").on(table.importId),
  ],
);

export const apiRateLimits = sqliteTable(
  "api_rate_limits",
  {
    bucketKey: text("bucket_key").primaryKey(),
    scope: text("scope").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    resetAt: integer("reset_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_api_rate_limits_reset_at").on(table.resetAt)],
);
