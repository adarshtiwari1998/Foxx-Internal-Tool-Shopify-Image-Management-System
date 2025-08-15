import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ShopifyService } from "./services/shopify";
import { insertStoreSchema, insertProductOperationSchema, insertBatchOperationSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import JSZip from "jszip";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for ZIP files
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
        sku: z.string().optional(),
        existingImageId: z.string().optional(),
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
        
        console.log('Processing image operation:', {
          operationType: data.operationType,
          productId: data.productId,
          variantId: data.variantId,
          imageUrl: data.imageUrl.substring(0, 50) + '...',
          sku: data.sku
        });

        if (data.operationType === 'add' && data.productId) {
          // Add new image to product
          console.log('Adding new image to product:', data.productId);
          result = await shopify.addImageToProduct(data.productId, data.imageUrl, data.altText);
        } else if (data.operationType === 'replace') {
          // For replace operation, use the new method that handles variant images properly
          console.log('Replacing variant image for:', data.variantId);
          if (data.productId) {
            // Pass the existing image ID from the request data if available
            result = await shopify.replaceVariantImage(data.variantId, data.productId, data.imageUrl, data.altText, data.existingImageId);
          } else {
            // Fallback: create new image and update variant
            console.log('Fallback: uploading image and updating variant');
            const uploadedImage = await shopify.uploadImage(data.imageUrl, data.altText);
            await shopify.updateProductVariantImage(data.variantId, uploadedImage.id);
            result = uploadedImage;
          }
        }

        // Get updated product info for generating URLs
        let productVariant = null;
        let previewUrl = '';
        let liveUrl = '';

        if (data.sku) {
          productVariant = await shopify.searchProductBySku(data.sku);
        }

        if (productVariant) {
          if (productVariant.product.status === 'DRAFT') {
            try {
              const generatedPreviewUrl = await shopify.generatePreviewLink(productVariant.product.id);
              previewUrl = generatedPreviewUrl || '';
            } catch (previewError) {
              console.warn('Failed to generate preview link:', previewError);
            }
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
          productVariant, // Include updated product data
        });

      } catch (shopifyError: any) {
        console.error('Shopify operation error:', {
          message: shopifyError.message,
          operationType: data.operationType,
          variantId: data.variantId,
          productId: data.productId,
          error: shopifyError.toString()
        });
        
        // Update operation as failed
        await storage.updateProductOperation(operation.id, {
          status: 'error',
          errorMessage: shopifyError.message,
        });

        throw shopifyError;
      }

    } catch (error: any) {
      console.error('Route error:', error);
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
            const generatedPreviewUrl = await shopify.generatePreviewLink(productVariant.product.id);
            previewUrl = generatedPreviewUrl || '';
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

  // Delete individual operation
  app.delete("/api/operations/:id", async (req, res) => {
    try {
      const success = await storage.deleteOperation(req.params.id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ message: "Operation not found" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Bulk delete operations
  app.post("/api/operations/bulk-delete", async (req, res) => {
    try {
      const schema = z.object({
        operationIds: z.array(z.string()),
      });
      
      const { operationIds } = schema.parse(req.body);
      
      const results = await Promise.all(
        operationIds.map(id => storage.deleteOperation(id))
      );
      
      const deletedCount = results.filter(Boolean).length;
      
      res.json({ 
        success: true, 
        deletedCount,
        total: operationIds.length 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Clear all operations
  app.delete("/api/operations", async (req, res) => {
    try {
      const deletedCount = await storage.clearAllOperations();
      res.json({ 
        success: true, 
        deletedCount 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Batch processing routes
  app.post("/api/products/batch-search", async (req, res) => {
    try {
      const schema = z.object({
        skus: z.array(z.string()).max(30),
      });

      const { skus } = schema.parse(req.body);
      
      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      const shopify = new ShopifyService({
        storeUrl: activeStore.storeUrl,
        accessToken: activeStore.accessToken,
      });

      const results = await Promise.all(
        skus.map(async (sku) => {
          try {
            const product = await shopify.searchProductBySku(sku);
            return {
              sku,
              status: product ? 'found' : 'not_found',
              product: product || undefined,
            };
          } catch (error: any) {
            return {
              sku,
              status: 'error',
              error: error.message,
            };
          }
        })
      );

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to search products",
        error: error.toString()
      });
    }
  });

  app.post("/api/products/batch-operation", upload.any(), async (req: any, res) => {
    try {
      const skus = JSON.parse(req.body.skus);
      const operationType = req.body.operationType;
      const uploadMethod = req.body.uploadMethod;
      const altText = req.body.altText || '';
      const dimensions = req.body.dimensions ? JSON.parse(req.body.dimensions) : undefined;
      
      // Parse uploaded files
      const singleFile = req.files?.find((f: any) => f.fieldname === 'singleFile');
      const zipFile = req.files?.find((f: any) => f.fieldname === 'zipFile');
      
      // Parse individual files
      const individualFiles: {[sku: string]: any} = {};
      if (uploadMethod === 'individual') {
        req.files?.forEach((file: any) => {
          if (file.fieldname.startsWith('individualFile_')) {
            const index = file.fieldname.split('_')[1];
            const sku = req.body[`individualSku_${index}`];
            if (sku) {
              individualFiles[sku] = file;
            }
          }
        });
      }

      const activeStore = await storage.getActiveStore();
      if (!activeStore) {
        return res.status(400).json({ message: "No active store configured" });
      }

      // Create batch operation record
      const batchName = `${operationType === 'replace' ? 'Replace' : 'Add'} Images - ${new Date().toLocaleString()}`;
      const batch = await storage.createBatchOperation({
        storeId: activeStore.id,
        name: batchName,
        operationType,
        totalItems: skus.length.toString(),
        metadata: {
          skus,
          uploadMethod,
          altText,
          dimensions,
        },
      });

      // Process images based on upload method
      let imageFiles: { [sku: string]: Buffer } = {};

      if (uploadMethod === 'zip' && zipFile) {
        // Extract ZIP file
        const zipBuffer = zipFile.buffer;
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(zipBuffer);
        
        // Extract files and match by SKU
        for (const [filename, file] of Object.entries(zipContent.files)) {
          if (!file.dir && /\.(jpg|jpeg|png|webp)$/i.test(filename)) {
            const baseName = filename.split('.')[0];
            const matchingSku = skus.find((sku: string) => 
              baseName.toLowerCase() === sku.toLowerCase()
            );
            
            if (matchingSku) {
              imageFiles[matchingSku] = await file.async('nodebuffer');
            }
          }
        }
      } else if (uploadMethod === 'single' && singleFile) {
        // Use single file for all SKUs
        const singleFileBuffer = singleFile.buffer;
        skus.forEach((sku: string) => {
          imageFiles[sku] = singleFileBuffer;
        });
      } else if (uploadMethod === 'individual' && Object.keys(individualFiles).length > 0) {
        // Use individual files for each SKU
        Object.entries(individualFiles).forEach(([sku, file]) => {
          imageFiles[sku] = file.buffer;
        });
      }

      // Start async processing
      processBatchOperations(batch.id, skus, imageFiles, operationType, altText, dimensions, activeStore);

      res.json(batch);
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to start batch operation",
        error: error.toString()
      });
    }
  });

  app.get("/api/batch-operations/:id", async (req, res) => {
    try {
      const batch = await storage.getBatchOperation(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Batch operation not found" });
      }
      res.json(batch);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Async batch processing function
async function processBatchOperations(
  batchId: string,
  skus: string[],
  imageFiles: { [sku: string]: Buffer },
  operationType: string,
  altText: string,
  dimensions: any,
  activeStore: any
) {
  try {
    await storage.updateBatchOperation(batchId, { status: 'processing' });
    
    const shopify = new ShopifyService({
      storeUrl: activeStore.storeUrl,
      accessToken: activeStore.accessToken,
    });

    let completed = 0;
    let failed = 0;

    for (const sku of skus) {
      try {
        // Search for product by SKU
        const productVariant = await shopify.searchProductBySku(sku);
        
        if (!productVariant) {
          failed++;
          await storage.createProductOperation({
            storeId: activeStore.id,
            batchId,
            sku,
            operationType,
            status: 'error',
            errorMessage: 'Product not found',
            metadata: { sku },
          });
          continue;
        }

        // Check if we have an image for this SKU
        const imageBuffer = imageFiles[sku];
        if (!imageBuffer) {
          failed++;
          await storage.createProductOperation({
            storeId: activeStore.id,
            batchId,
            productId: productVariant.product.id,
            variantId: productVariant.id,
            sku,
            operationType,
            status: 'error',
            errorMessage: 'No image provided for this SKU',
            metadata: { sku },
          });
          continue;
        }

        // For now, create a mock image URL since we need actual file upload implementation
        const mockImageUrl = `https://example.com/batch-uploads/${batchId}/${sku}.jpg`;

        // Create operation record
        const operation = await storage.createProductOperation({
          storeId: activeStore.id,
          batchId,
          productId: productVariant.product.id,
          variantId: productVariant.id,
          sku,
          operationType,
          imageUrl: mockImageUrl,
          altText,
          status: 'pending',
          metadata: {
            sku,
            dimensions,
            filename: `${sku}_${dimensions?.width || 'auto'}x${dimensions?.height || 'auto'}_${productVariant.product.title.split(' ').slice(0, 3).join('_')}.jpg`
          },
        });

        // Simulate processing (in real implementation, upload to CDN and then to Shopify)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Update operation as completed
        await storage.updateProductOperation(operation.id, {
          status: 'success',
          liveUrl: mockImageUrl,
        });

        completed++;
      } catch (error: any) {
        failed++;
        await storage.createProductOperation({
          storeId: activeStore.id,
          batchId,
          sku,
          operationType,
          status: 'error',
          errorMessage: error.message,
          metadata: { sku },
        });
      }

      // Update batch progress
      await storage.updateBatchOperation(batchId, {
        completedItems: (completed + failed).toString(),
        failedItems: failed.toString(),
      });
    }

    // Mark batch as completed
    await storage.updateBatchOperation(batchId, {
      status: completed > 0 ? 'completed' : 'error',
      completedItems: (completed + failed).toString(),
      failedItems: failed.toString(),
    });

  } catch (error: any) {
    await storage.updateBatchOperation(batchId, {
      status: 'error',
      completedItems: '0',
      failedItems: skus.length.toString(),
    });
  }
}
