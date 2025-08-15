import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ShopifyService } from "./services/shopify";
import { insertStoreSchema, insertProductOperationSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Store management routes
  app.post("/api/stores", async (req, res) => {
    try {
      const storeData = insertStoreSchema.parse(req.body);
      
      // Test connection before saving
      const shopify = new ShopifyService({
        storeUrl: storeData.storeUrl,
        accessToken: storeData.accessToken,
      });

      // Simple test query to verify credentials
      await shopify.testConnection();

      const store = await storage.createStore(storeData);
      res.json(store);
    } catch (error: any) {
      res.status(400).json({ 
        message: error.message || "Failed to create store configuration",
        error: error.toString()
      });
    }
  });

  app.get("/api/stores", async (req, res) => {
    try {
      const stores = await storage.getAllStores();
      res.json(stores);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/stores/:id/activate", async (req, res) => {
    try {
      await storage.setActiveStore(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/stores/active", async (req, res) => {
    try {
      const store = await storage.getActiveStore();
      res.json(store);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Product search routes
  app.get("/api/products/search", async (req, res) => {
    try {
      const { query, type } = req.query;
      
      if (!query) {
        return res.status(400).json({ message: "Query parameter is required" });
      }

      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      let productVariant = null;

      if (type === 'url') {
        productVariant = await shopify.getProductFromUrl(query as string);
      } else {
        productVariant = await shopify.searchProductBySku(query as string);
      }

      if (!productVariant) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(productVariant);
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to search product",
        error: error.toString()
      });
    }
  });

  // Image management routes
  app.post("/api/images/upload", upload.single('image'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // For now, we'll return a mock URL since we need to implement actual file storage
      // In a real implementation, you would upload to a CDN or file storage service
      const mockImageUrl = `https://example.com/uploads/${Date.now()}-${req.file.originalname}`;
      
      res.json({ 
        url: mockImageUrl,
        filename: req.file.originalname,
        size: req.file.size
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/products/update-image", async (req, res) => {
    try {
      const schema = z.object({
        variantId: z.string(),
        imageUrl: z.string().url(),
        altText: z.string().optional(),
        operationType: z.enum(['replace', 'add']),
        productId: z.string().optional(),
      });

      const data = schema.parse(req.body);
      
      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      // Create operation record
      const operationData = {
        storeId: activeStore.id,
        variantId: data.variantId,
        productId: data.productId,
        operationType: data.operationType,
        imageUrl: data.imageUrl,
        altText: data.altText,
        status: 'pending' as const,
      };

      const operation = await storage.createProductOperation(operationData);

      try {
        let result;
        
        if (data.operationType === 'add' && data.productId) {
          // Add new image to product
          result = await shopify.addImageToProduct(data.productId, data.imageUrl, data.altText);
        } else if (data.operationType === 'replace') {
          // Upload image and update variant
          const uploadedImage = await shopify.uploadImage(data.imageUrl, data.altText);
          await shopify.updateProductVariantImage(data.variantId, uploadedImage.id);
          result = uploadedImage;
        }

        // Get product info for generating URLs
        const productVariant = await shopify.searchProductBySku(req.body.sku || '');
        let previewUrl = '';
        let liveUrl = '';

        if (productVariant) {
          if (productVariant.product.status === 'DRAFT') {
            previewUrl = await shopify.generatePreviewLink(productVariant.product.id);
          } else {
            liveUrl = shopify.getLiveProductUrl(productVariant.product.handle);
          }
        }

        // Update operation as successful
        await storage.updateProductOperation(operation.id, {
          status: 'success',
          previewUrl,
          liveUrl,
          metadata: result,
        });

        res.json({
          success: true,
          operation: {
            ...operation,
            status: 'success',
            previewUrl,
            liveUrl,
          },
          result,
        });

      } catch (shopifyError: any) {
        // Update operation as failed
        await storage.updateProductOperation(operation.id, {
          status: 'error',
          errorMessage: shopifyError.message,
        });

        throw shopifyError;
      }

    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to update product image",
        error: error.toString()
      });
    }
  });

  // New unified file upload routes
  app.post("/api/files/staged-upload", async (req, res) => {
    try {
      const schema = z.object({
        filename: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
      });

      const data = schema.parse(req.body);
      
      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      const stagedTarget = await shopify.createStagedUpload(data.filename, data.mimeType, data.fileSize);
      res.json(stagedTarget);
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to create staged upload",
        error: error.toString()
      });
    }
  });

  app.post("/api/files/create-from-staged", async (req, res) => {
    try {
      const schema = z.object({
        stagedUrl: z.string().url(),
        altText: z.string().optional(),
      });

      const data = schema.parse(req.body);
      
      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      const file = await shopify.createFileFromStaged(data.stagedUrl, data.altText);
      res.json(file);
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to create file from staged upload",
        error: error.toString()
      });
    }
  });

  app.get("/api/products/:id/images", async (req, res) => {
    try {
      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      const images = await shopify.getProductImages(req.params.id);
      res.json(images);
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to get product images",
        error: error.toString()
      });
    }
  });

  app.delete("/api/files/:id", async (req, res) => {
    try {
      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      const success = await shopify.deleteFile(req.params.id);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to delete file",
        error: error.toString()
      });
    }
  });

  app.patch("/api/images/:id/alt-text", async (req, res) => {
    try {
      const schema = z.object({
        altText: z.string(),
      });

      const data = schema.parse(req.body);
      
      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      const success = await shopify.updateImageAltText(req.params.id, data.altText);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to update alt text",
        error: error.toString()
      });
    }
  });

  // Enhanced image operation route for comprehensive workflow
  app.post("/api/products/image-operation", async (req, res) => {
    try {
      const schema = z.object({
        inputType: z.enum(['sku', 'url', 'direct_image']),
        inputValue: z.string(),
        operationType: z.enum(['replace', 'add']),
        imageSource: z.string().url(),
        altText: z.string().optional(),
        copyExistingAlt: z.boolean().optional(),
        targetImageId: z.string().optional(), // For replace operations
        dimensions: z.object({
          width: z.number(),
          height: z.number()
        }).optional(),
        filename: z.string().optional(),
      });

      const data = schema.parse(req.body);
      
      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      let productVariant = null;
      let altTextToUse = data.altText || '';

      // Step 1: Get product data based on input type
      if (data.inputType === 'sku') {
        productVariant = await shopify.searchProductBySku(data.inputValue);
      } else if (data.inputType === 'url') {
        productVariant = await shopify.getProductFromUrl(data.inputValue);
      }

      if (!productVariant && data.inputType !== 'direct_image') {
        return res.status(404).json({ message: "Product not found" });
      }

      // Step 2: Handle alt text copying
      if (data.copyExistingAlt && productVariant?.image?.altText) {
        altTextToUse = productVariant.image.altText;
      }

      // Create operation record
      const operationData = {
        storeId: activeStore.id,
        variantId: productVariant?.id,
        productId: productVariant?.product.id,
        operationType: data.operationType,
        imageUrl: data.imageSource,
        altText: altTextToUse,
        status: 'pending' as const,
        metadata: {
          inputType: data.inputType,
          inputValue: data.inputValue,
          copyExistingAlt: data.copyExistingAlt,
          dimensions: data.dimensions,
          filename: data.filename,
        },
      };

      const operation = await storage.createProductOperation(operationData);

      try {
        let result;
        
        if (data.operationType === 'replace' && productVariant) {
          if (data.targetImageId) {
            // Replace specific image
            result = await shopify.replaceProductImage(
              productVariant.product.id, 
              data.targetImageId, 
              data.imageSource, 
              altTextToUse
            );
          } else if (productVariant.image) {
            // Replace variant image
            result = await shopify.replaceProductImage(
              productVariant.product.id, 
              productVariant.image.id, 
              data.imageSource, 
              altTextToUse
            );
          }
        } else if (data.operationType === 'add' && productVariant) {
          // Add new image to product
          result = await shopify.addImageToProduct(
            productVariant.product.id, 
            data.imageSource, 
            altTextToUse
          );
        }

        // Generate preview/live URLs
        let previewUrl = '';
        let liveUrl = '';

        if (productVariant) {
          if (productVariant.product.status === 'DRAFT') {
            previewUrl = await shopify.generatePreviewLink(productVariant.product.id);
          } else {
            liveUrl = shopify.getLiveProductUrl(productVariant.product.handle);
          }
        }

        // Update operation as successful
        await storage.updateProductOperation(operation.id, {
          status: 'success',
          previewUrl,
          liveUrl,
          metadata: { ...operationData.metadata, result },
        });

        res.json({
          success: true,
          operation: {
            ...operation,
            status: 'success',
            previewUrl,
            liveUrl,
          },
          result,
          productVariant,
        });

      } catch (shopifyError: any) {
        // Update operation as failed
        await storage.updateProductOperation(operation.id, {
          status: 'error',
          errorMessage: shopifyError.message,
        });

        throw shopifyError;
      }

    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to perform image operation",
        error: error.toString()
      });
    }
  });

  // Operations history
  app.get("/api/operations", async (req, res) => {
    try {
      const operations = await storage.getRecentProductOperations(20);
      res.json(operations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
