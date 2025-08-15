import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const stores = pgTable("stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  storeUrl: text("store_url").notNull().unique(),
  accessToken: text("access_token").notNull(),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const productOperations = pgTable("product_operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: varchar("store_id").references(() => stores.id),
  productId: text("product_id"),
  variantId: text("variant_id"),
  sku: text("sku"),
  operationType: text("operation_type").notNull(), // 'replace', 'add', 'update'
  imageUrl: text("image_url"),
  altText: text("alt_text"),
  previewUrl: text("preview_url"),
  liveUrl: text("live_url"),
  status: text("status").default('pending'), // 'pending', 'success', 'error'
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  batchId: varchar("batch_id"), // For grouping batch operations
  createdAt: timestamp("created_at").defaultNow(),
});

export const batchOperations = pgTable("batch_operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: varchar("store_id").references(() => stores.id),
  name: text("name").notNull(),
  operationType: text("operation_type").notNull(), // 'replace', 'add'
  totalItems: text("total_items").notNull(),
  completedItems: text("completed_items").default('0'),
  failedItems: text("failed_items").default('0'),
  status: text("status").default('pending'), // 'pending', 'processing', 'completed', 'error'
  metadata: jsonb("metadata"), // Store SKU list, upload method, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertStoreSchema = createInsertSchema(stores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductOperationSchema = createInsertSchema(productOperations).omit({
  id: true,
  createdAt: true,
});

export const insertBatchOperationSchema = createInsertSchema(batchOperations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type ProductOperation = typeof productOperations.$inferSelect;
export type InsertProductOperation = z.infer<typeof insertProductOperationSchema>;
export type BatchOperation = typeof batchOperations.$inferSelect;
export type InsertBatchOperation = z.infer<typeof insertBatchOperationSchema>;

// Keep existing user schema for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
