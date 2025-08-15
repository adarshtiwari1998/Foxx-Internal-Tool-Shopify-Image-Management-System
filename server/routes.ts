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
      const singleFile = (req.files as any)?.singleFile?.[0];
      const zipFile = (req.files as any)?.zipFile?.[0];
      
      // Parse individual files - improved handling
      const individualFiles: {[sku: string]: any} = {};
      if (uploadMethod === 'individual') {
        console.log(`Processing individual files for ${skus.length} SKUs...`);
        
        // Check if files were uploaded using the individual file input method
        if (req.files && Array.isArray(req.files)) {
          // Handle when files are uploaded with specific field names
          for (let i = 0; i < 30; i++) {
            const fieldName = `individualFile_${i}`;
            const file = (req.files as any).find((f: any) => f.fieldname === fieldName);
            const sku = req.body[`individualSku_${i}`];
            if (file && sku) {
              console.log(`Found individual file for SKU ${sku}: ${file.originalname}`);
              individualFiles[sku] = file;
            }
          }
        } else if (req.files) {
          // Handle when files are uploaded as object with field names as keys
          Object.keys(req.files).forEach(fieldName => {
            if (fieldName.startsWith('individualFile_')) {
              const index = fieldName.replace('individualFile_', '');
              const file = (req.files as any)[fieldName][0];
              const sku = req.body[`individualSku_${index}`];
              if (file && sku) {
                console.log(`Found individual file for SKU ${sku}: ${file.originalname}`);
                individualFiles[sku] = file;
              }
            }
          });
        }
        
        console.log(`Individual files processed: ${Object.keys(individualFiles).length} files for SKUs: [${Object.keys(individualFiles).join(', ')}]`);
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
        console.log(`Processing ZIP file: ${zipFile.originalname} (${zipFile.size} bytes)`);
        const zipBuffer = zipFile.buffer;
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(zipBuffer);
        
        console.log(`ZIP extracted successfully. Found ${Object.keys(zipContent.files).length} files.`);
        
        // Log all files in ZIP for debugging
        console.log('=== ZIP CONTENTS DEBUG ===');
        Object.keys(zipContent.files).forEach(filename => {
          const file = zipContent.files[filename];
          console.log(`File: "${filename}" | Dir: ${file.dir}`);
        });
        console.log('=== AVAILABLE SKUs ===');
        console.log(`SKUs to match: [${skus.join(', ')}]`);
        console.log('========================');
        
        // Extract files and match by SKU with flexible matching (ignore extensions)
        for (const [filename, file] of Object.entries(zipContent.files)) {
          if (!file.dir && /\.(jpg|jpeg|png|webp)$/i.test(filename)) {
            // Get filename without path and extension
            const fileBaseName = filename.split('/').pop()?.split('.')[0] || '';
            console.log(`Processing file: "${filename}" -> base: "${fileBaseName}"`);
            
            // Use the SAME matching logic as ZIP preview
            let matchingSku = skus.find((sku: string) => {
              return matchSkuToFilename(sku, fileBaseName);
            });
            
            if (matchingSku) {
              console.log(`✅ SUCCESS: Matched file "${filename}" to SKU "${matchingSku}"`);
              imageFiles[matchingSku] = await file.async('nodebuffer');
            } else {
              console.error(`❌ FAILED: Could not match file "${filename}" (base: "${fileBaseName}") to any SKU: [${skus.join(', ')}]`);
            }
          } else {
            console.log(`Skipping non-image file: "${filename}"`);
          }
        }
        
        console.log(`ZIP processing complete. Matched ${Object.keys(imageFiles).length} images to SKUs out of ${skus.length} requested SKUs.`);
        if (Object.keys(imageFiles).length === 0) {
          console.warn('No images were matched! This will cause all operations to fail.');
        }
      } else if (uploadMethod === 'single' && singleFile) {
        // Use single file for all SKUs
        const singleFileBuffer = singleFile.buffer;
        skus.forEach((sku: string) => {
          imageFiles[sku] = singleFileBuffer;
        });
      } else if (uploadMethod === 'individual' && Object.keys(individualFiles).length > 0) {
        // Use individual files for each SKU
        console.log(`Processing individual files for ${Object.keys(individualFiles).length} SKUs...`);
        Object.entries(individualFiles).forEach(([sku, file]) => {
          if (file && file.buffer) {
            console.log(`Adding image buffer for SKU ${sku}: ${file.originalname} (${file.size} bytes)`);
            imageFiles[sku] = file.buffer;
          } else {
            console.warn(`Invalid file object for SKU ${sku}:`, file);
          }
        });
        console.log(`Individual files processed: ${Object.keys(imageFiles).length} image buffers ready`);
      }

      // Start async processing
      processBatchOperations(batch.id, skus, imageFiles, operationType, uploadMethod, altText, dimensions, activeStore);

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

  // ZIP preview route
  app.post("/api/files/zip-preview", upload.single('zipFile'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No ZIP file provided" });
      }

      if (!req.file.originalname.toLowerCase().endsWith('.zip')) {
        return res.status(400).json({ message: "File must be a ZIP archive" });
      }

      // Parse SKUs from request body if provided
      const skus = req.body.skus ? JSON.parse(req.body.skus) : [];
      console.log('ZIP preview with SKUs:', skus);

      const zipBuffer = req.file.buffer;
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipBuffer);
      
      const files = [];
      for (const [filename, file] of Object.entries(zipContent.files)) {
        if (!file.dir && /\.(jpg|jpeg|png|webp)$/i.test(filename)) {
          // Get the actual uncompressed file size
          const uncompressedSize = await file.async('uint8array').then(data => data.length);
          const fileBaseName = filename.split('/').pop()?.split('.')[0] || '';
          
          // Check if this file matches any SKU using the same logic as batch operation
          let matchingSku = null;
          if (skus.length > 0) {
            matchingSku = skus.find((sku: string) => {
              return matchSkuToFilename(sku, fileBaseName);
            });
          }
          
          files.push({
            filename: filename,
            basename: fileBaseName,
            size: uncompressedSize,
            extension: filename.split('.').pop()?.toLowerCase() || '',
            matchingSku: matchingSku || null,
            matches: !!matchingSku
          });
        }
      }

      // Count matches
      const matchedFiles = files.filter(f => f.matches);
      const unmatchedFiles = files.filter(f => !f.matches);
      
      res.json({
        totalFiles: Object.keys(zipContent.files).length,
        imageFiles: files,
        zipName: req.file.originalname,
        zipSize: req.file.size,
        matchedCount: matchedFiles.length,
        unmatchedCount: unmatchedFiles.length,
        providedSkus: skus
      });
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to preview ZIP file",
        error: error.toString()
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to escape regex special characters
function escapeRegex(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Unified SKU matching function used by both ZIP preview and batch operation
function matchSkuToFilename(sku: string, fileBaseName: string): boolean {
  const skuClean = sku.toLowerCase().trim();
  const fileClean = fileBaseName.toLowerCase().trim();
  
  console.log(`  Matching: "${fileClean}" vs SKU "${skuClean}"`);
  
  // Exact match (ignore case)
  if (fileClean === skuClean) {
    console.log(`    ✓ EXACT MATCH`);
    return true;
  }
  
  // Remove common separators and match
  const skuNormalized = skuClean.replace(/[-_\s]/g, '');
  const fileNormalized = fileClean.replace(/[-_\s]/g, '');
  if (fileNormalized === skuNormalized) {
    console.log(`    ✓ NORMALIZED MATCH`);
    return true;
  }
  
  // Check if filename starts with SKU (good for files like "SKU-001_image1.jpg")
  if (fileClean.startsWith(skuClean)) {
    console.log(`    ✓ STARTS WITH MATCH`);
    return true;
  }
  
  // Check if filename contains the full SKU surrounded by separators or at start/end
  try {
    const regex = new RegExp(`(^|[-_\s])${escapeRegex(skuClean)}([-_\s]|$)`, 'i');
    if (regex.test(fileClean)) {
      console.log(`    ✓ REGEX MATCH`);
      return true;
    }
  } catch (e) {
    console.warn(`    Regex error for SKU ${skuClean}:`, e);
  }
  
  console.log(`    ✗ NO MATCH`);
  return false;
}

// Async batch processing function
async function processBatchOperations(
  batchId: string,
  skus: string[],
  imageFiles: { [sku: string]: Buffer },
  operationType: string,
  uploadMethod: string,
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
          const errorMessage = uploadMethod === 'zip' 
            ? `No matching image found in ZIP for SKU "${sku}". Make sure the image filename matches or contains the SKU.`
            : uploadMethod === 'individual'
            ? `No individual image file provided for SKU "${sku}".`
            : `No image provided for SKU "${sku}".`;
            
          console.warn(`Skipping SKU ${sku}: ${errorMessage}`);
          
          await storage.createProductOperation({
            storeId: activeStore.id,
            batchId,
            productId: productVariant.product.id,
            variantId: productVariant.id,
            sku,
            operationType,
            status: 'error',
            errorMessage,
            metadata: { 
              sku: sku,
              uploadMethod: uploadMethod,
              availableImages: Object.keys(imageFiles),
              totalImagesInBatch: Object.keys(imageFiles).length
            },
          });
          continue;
        }

        // Create operation record first
        const operation = await storage.createProductOperation({
          storeId: activeStore.id,
          batchId,
          productId: productVariant.product.id,
          variantId: productVariant.id,
          sku,
          operationType,
          status: 'pending',
          metadata: {
            sku: sku,
            dimensions: dimensions,
            filename: `${sku}_${dimensions?.width || 'auto'}x${dimensions?.height || 'auto'}_${productVariant.product.title.split(' ').slice(0, 3).join('_')}.jpg`
          },
        });

        try {
          // Use Shopify's staged upload system to upload the file
          const filename = `${sku}_${Date.now()}.jpg`;
          const mimeType = 'image/jpeg';
          
          console.log(`Processing ${operationType} operation for SKU: ${sku}`);
          console.log(`Creating staged upload for ${filename}...`);
          
          // Step 1: Create staged upload target
          const stagedTarget = await shopify.createStagedUpload(filename, mimeType, imageBuffer.length);
          
          // Step 2: Upload file to staged URL using Node.js compatible approach
          const FormData = require('form-data');
          const formData = new FormData();
          
          stagedTarget.parameters.forEach(param => {
            formData.append(param.name, param.value);
          });
          formData.append('file', imageBuffer, {
            filename: filename,
            contentType: mimeType
          });
          
          const uploadResponse = await fetch(stagedTarget.url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders(),
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`Staged upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
          }
          
          // Step 3: Create file from staged upload
          const fileResult = await shopify.createFileFromStaged(stagedTarget.resourceUrl, altText);
          const imageUrl = fileResult.url;
          
          console.log(`Successfully uploaded file to Shopify: ${imageUrl}`);
          
          let result;
          let previewUrl = '';
          let liveUrl = '';
          
          if (operationType === 'replace' && productVariant) {
            // Get existing image ID from the variant/product (handle GraphQL edges format)
            const existingImageId = productVariant.image?.id || (productVariant.product?.images?.edges?.[0]?.node?.id);
            
            console.log(`Replacing image for variant ${productVariant.id}, existing image: ${existingImageId}`);
            result = await shopify.replaceVariantImage(
              productVariant.id, 
              productVariant.product.id, 
              imageUrl, 
              altText,
              existingImageId
            );
          } else if (operationType === 'add' && productVariant) {
            console.log(`Adding new image to product ${productVariant.product.id}`);
            result = await shopify.addImageToProduct(
              productVariant.product.id, 
              imageUrl, 
              altText
            );
          }
          
          // Generate preview/live URLs
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
          
          // Update operation as successful
          await storage.updateProductOperation(operation.id, {
            status: 'success',
            imageUrl: result?.url || imageUrl,
            altText,
            previewUrl,
            liveUrl,
            metadata: { ...operation.metadata, result },
          });
          
          console.log(`Successfully ${operationType}d image for SKU: ${sku}`);
        } catch (shopifyError: any) {
          console.error(`Shopify error for SKU ${sku}:`, shopifyError);
          
          // Update operation as failed
          await storage.updateProductOperation(operation.id, {
            status: 'error',
            errorMessage: shopifyError.message,
          });
          
          throw shopifyError;
        }

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
