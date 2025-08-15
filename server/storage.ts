import { 
  stores, 
  productOperations,
  batchOperations,
  type Store, 
  type InsertStore,
  type ProductOperation,
  type InsertProductOperation,
  type BatchOperation,
  type InsertBatchOperation,
  type User, 
  type InsertUser 
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods (keep existing for compatibility)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Store methods
  createStore(store: InsertStore): Promise<Store>;
  updateStore(id: string, store: Partial<InsertStore>): Promise<Store | undefined>;
  getStore(id: string): Promise<Store | undefined>;
  getStoreByUrl(storeUrl: string): Promise<Store | undefined>;
  getAllStores(): Promise<Store[]>;
  setActiveStore(id: string): Promise<void>;
  getActiveStore(): Promise<Store | undefined>;

  // Product operation methods
  createProductOperation(operation: InsertProductOperation): Promise<ProductOperation>;
  updateProductOperation(id: string, operation: Partial<InsertProductOperation>): Promise<ProductOperation | undefined>;
  getProductOperation(id: string): Promise<ProductOperation | undefined>;
  getProductOperationsByStore(storeId: string): Promise<ProductOperation[]>;
  getRecentProductOperations(limit?: number): Promise<ProductOperation[]>;

  // Batch operation methods
  createBatchOperation(batch: InsertBatchOperation): Promise<BatchOperation>;
  updateBatchOperation(id: string, batch: Partial<InsertBatchOperation>): Promise<BatchOperation | undefined>;
  getBatchOperation(id: string): Promise<BatchOperation | undefined>;
  getBatchOperationsByStore(storeId: string): Promise<BatchOperation[]>;
  getBatchOperationsByBatch(batchId: string): Promise<ProductOperation[]>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(stores).where(eq(stores.id, id));
    return user as any; // Type conversion for compatibility
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return undefined; // Not implemented for this use case
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return { id: randomUUID(), ...insertUser } as User; // Not implemented for this use case
  }

  // Store methods
  async createStore(store: InsertStore): Promise<Store> {
    const [newStore] = await db
      .insert(stores)
      .values({
        ...store,
        updatedAt: new Date(),
      })
      .returning();
    return newStore;
  }

  async updateStore(id: string, store: Partial<InsertStore>): Promise<Store | undefined> {
    const [updatedStore] = await db
      .update(stores)
      .set({
        ...store,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, id))
      .returning();
    return updatedStore || undefined;
  }

  async getStore(id: string): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.id, id));
    return store || undefined;
  }

  async getStoreByUrl(storeUrl: string): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.storeUrl, storeUrl));
    return store || undefined;
  }

  async getAllStores(): Promise<Store[]> {
    return await db.select().from(stores).orderBy(desc(stores.updatedAt));
  }

  async setActiveStore(id: string): Promise<void> {
    // First deactivate all stores
    await db.update(stores).set({ isActive: false });
    
    // Then activate the selected store
    await db.update(stores).set({ isActive: true }).where(eq(stores.id, id));
  }

  async getActiveStore(): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.isActive, true));
    return store || undefined;
  }

  // Product operation methods
  async createProductOperation(operation: InsertProductOperation): Promise<ProductOperation> {
    const [newOperation] = await db
      .insert(productOperations)
      .values(operation)
      .returning();
    return newOperation;
  }

  async updateProductOperation(id: string, operation: Partial<InsertProductOperation>): Promise<ProductOperation | undefined> {
    const [updatedOperation] = await db
      .update(productOperations)
      .set(operation)
      .where(eq(productOperations.id, id))
      .returning();
    return updatedOperation || undefined;
  }

  async getProductOperation(id: string): Promise<ProductOperation | undefined> {
    const [operation] = await db.select().from(productOperations).where(eq(productOperations.id, id));
    return operation || undefined;
  }

  async getProductOperationsByStore(storeId: string): Promise<ProductOperation[]> {
    return await db
      .select()
      .from(productOperations)
      .where(eq(productOperations.storeId, storeId))
      .orderBy(desc(productOperations.createdAt));
  }

  async getRecentProductOperations(limit: number = 10): Promise<ProductOperation[]> {
    return await db
      .select()
      .from(productOperations)
      .orderBy(desc(productOperations.createdAt))
      .limit(limit);
  }

  // Batch operation methods
  async createBatchOperation(batch: InsertBatchOperation): Promise<BatchOperation> {
    const [newBatch] = await db
      .insert(batchOperations)
      .values({
        ...batch,
        updatedAt: new Date(),
      })
      .returning();
    return newBatch;
  }

  async updateBatchOperation(id: string, batch: Partial<InsertBatchOperation>): Promise<BatchOperation | undefined> {
    const [updatedBatch] = await db
      .update(batchOperations)
      .set({
        ...batch,
        updatedAt: new Date(),
      })
      .where(eq(batchOperations.id, id))
      .returning();
    return updatedBatch || undefined;
  }

  async getBatchOperation(id: string): Promise<BatchOperation | undefined> {
    const [batch] = await db
      .select()
      .from(batchOperations)
      .where(eq(batchOperations.id, id));
    return batch || undefined;
  }

  async getBatchOperationsByStore(storeId: string): Promise<BatchOperation[]> {
    const batches = await db
      .select()
      .from(batchOperations)
      .where(eq(batchOperations.storeId, storeId))
      .orderBy(desc(batchOperations.createdAt));
    return batches;
  }

  async getBatchOperationsByBatch(batchId: string): Promise<ProductOperation[]> {
    const operations = await db
      .select()
      .from(productOperations)
      .where(eq(productOperations.batchId, batchId))
      .orderBy(desc(productOperations.createdAt));
    return operations;
  }
}

export const storage = new DatabaseStorage();
