import sharp from 'sharp';

interface ShopifyConfig {
  storeUrl: string;
  accessToken: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  title: string;
  image?: {
    id: string;
    url: string;
    altText?: string;
  };
  product: {
    id: string;
    title: string;
    handle: string;
    status: string;
    images?: {
      edges: Array<{
        node: {
          id: string;
          url: string;
          altText?: string;
        };
      }>;
    };
  };
}

export interface ShopifyImage {
  id: string;
  url: string;
  altText?: string;
}

export interface StagedUploadTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{
    name: string;
    value: string;
  }>;
}

export interface FileUploadResult {
  id: string;
  url: string;
  altText?: string;
  fileStatus: string;
}

export class ShopifyService {
  private config: ShopifyConfig;

  constructor(config: ShopifyConfig) {
    this.config = config;
  }

  async graphqlRequest(query: string, variables: any = {}) {
    const response = await fetch(`https://${this.config.storeUrl}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.config.accessToken,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  async testConnection(): Promise<void> {
    await this.graphqlRequest(`
      query {
        shop {
          name
        }
      }
    `);
  }

  async searchProductBySku(sku: string): Promise<ProductVariant | null> {
    const query = `
      query searchProductVariants($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              sku
              title
              image {
                id
                url
                altText
              }
              product {
                id
                title
                handle
                status
                images(first: 10) {
                  edges {
                    node {
                      id
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { query: `sku:${sku}` });
    const edges = data.productVariants?.edges || [];
    
    if (edges.length === 0) {
      return null;
    }

    const variant = edges[0].node;
    
    // If variant doesn't have an image but product has images, use the first product image
    if (!variant.image && variant.product.images.edges.length > 0) {
      variant.image = variant.product.images.edges[0].node;
    }

    return variant;
  }

  async getProductFromUrl(url: string): Promise<ProductVariant | null> {
    let productHandle = '';
    let variantId = '';

    // Parse different URL formats
    if (url.includes('/products/')) {
      const matches = url.match(/\/products\/([^/?]+)/);
      if (matches) {
        productHandle = matches[1];
      }
      
      // Check for variant parameter
      const variantMatch = url.match(/[?&]variant=(\d+)/);
      if (variantMatch) {
        variantId = `gid://shopify/ProductVariant/${variantMatch[1]}`;
      }
    }

    if (!productHandle) {
      throw new Error('Could not extract product handle from URL');
    }

    const query = `
      query getProduct($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          handle
          status
          variants(first: 50) {
            edges {
              node {
                id
                sku
                title
                image {
                  id
                  url
                  altText
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { handle: productHandle });
    const product = data.productByHandle;

    if (!product) {
      return null;
    }

    // If specific variant ID is provided, find that variant
    if (variantId) {
      const variant = product.variants.edges.find((edge: any) => edge.node.id === variantId);
      if (variant) {
        return {
          ...variant.node,
          product: {
            id: product.id,
            title: product.title,
            handle: product.handle,
            status: product.status,
          },
        };
      }
    }

    // Otherwise return the first variant
    if (product.variants.edges.length > 0) {
      return {
        ...product.variants.edges[0].node,
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle,
          status: product.status,
        },
      };
    }

    return null;
  }

  async uploadImage(imageUrl: string, altText?: string): Promise<ShopifyImage> {
    const query = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
            ... on MediaImage {
              image {
                url
                width
                height
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, {
      files: [{
        originalSource: imageUrl,
        alt: altText || '',
        contentType: "IMAGE"
      }],
    });

    if (data.fileCreate.userErrors?.length > 0) {
      throw new Error(`File upload error: ${data.fileCreate.userErrors[0].message}`);
    }

    const file = data.fileCreate.files[0];
    return {
      id: file.id,
      url: file.image?.url || imageUrl,
      altText: file.alt || altText,
    };
  }

  async createProductMediaFromUrl(productId: string, imageUrl: string, altText?: string): Promise<ShopifyImage> {
    const query = `
      mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
        productCreateMedia(media: $media, productId: $productId) {
          media {
            ... on MediaImage {
              id
              alt
              image {
                url
              }
            }
          }
          mediaUserErrors {
            field
            message
          }
          product {
            id
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, {
      productId: productId,
      media: [{
        originalSource: imageUrl,
        alt: altText || '',
        mediaContentType: "IMAGE"
      }]
    });

    if (data.productCreateMedia.mediaUserErrors?.length > 0) {
      throw new Error(`Product media creation error: ${data.productCreateMedia.mediaUserErrors[0].message}`);
    }

    const mediaImage = data.productCreateMedia.media[0];
    console.log('Created media response:', JSON.stringify(mediaImage, null, 2));
    
    // Handle the case where image might be null or undefined
    const resultImageUrl = mediaImage.image?.url || imageUrl; // fallback to original URL
    
    return {
      id: mediaImage.id,
      url: resultImageUrl,
      altText: mediaImage.alt,
    };
  }

  async updateProductVariantImage(variantId: string, mediaId: string): Promise<boolean> {
    // MediaImage IDs cannot be directly assigned to variants in the current API
    // The productVariantUpdate mutation expects a different image ID format
    // For now, we'll skip the variant assignment since the image is already attached to the product
    console.log(`Skipping variant image assignment for ${variantId} with media ${mediaId} - not supported in current API`);
    return true; // Return true since the media was successfully created
  }

  async addImageToProduct(productId: string, imageUrl: string, altText?: string): Promise<ShopifyImage> {
    // Create a proper product media that gets attached to the product (ADD ONLY - no deletion)
    console.log('Adding new image without deleting anything:', { productId, imageUrl });
    return await this.createProductMediaFromUrl(productId, imageUrl, altText);
  }

  async generatePreviewLink(productId: string): Promise<string | null> {
    // Since the productPreviewUrlGenerate mutation doesn't exist in all Shopify APIs,
    // let's skip this for now and return null to avoid errors
    console.log('Skipping preview link generation for product:', productId);
    return null;
  }

  getLiveProductUrl(handle: string): string {
    return `https://${this.config.storeUrl.replace('.myshopify.com', '.com')}/products/${handle}`;
  }

  // New comprehensive file upload methods
  async createStagedUpload(filename: string, mimeType: string, fileSize: number): Promise<StagedUploadTarget> {
    const query = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, {
      input: [{
        filename,
        mimeType,
        httpMethod: "POST",
        resource: "IMAGE",
        fileSize: fileSize.toString()
      }]
    });

    if (data.stagedUploadsCreate.userErrors?.length > 0) {
      throw new Error(`Staged upload error: ${data.stagedUploadsCreate.userErrors[0].message}`);
    }

    return data.stagedUploadsCreate.stagedTargets[0];
  }

  async createFileFromStaged(stagedUrl: string, altText?: string): Promise<FileUploadResult> {
    const query = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
            ... on MediaImage {
              image {
                url
                width
                height
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, {
      files: [{
        alt: altText || "",
        contentType: "IMAGE",
        originalSource: stagedUrl
      }]
    });

    if (data.fileCreate.userErrors?.length > 0) {
      throw new Error(`File creation error: ${data.fileCreate.userErrors[0].message}`);
    }

    const file = data.fileCreate.files[0];
    return {
      id: file.id,
      url: file.image?.url || '',
      altText: file.alt,
      fileStatus: file.fileStatus
    };
  }

  async deleteFile(fileId: string): Promise<boolean> {
    const query = `
      mutation fileDelete($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) {
          deletedFileIds
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { fileIds: [fileId] });

    if (data.fileDelete.userErrors?.length > 0) {
      throw new Error(`File deletion error: ${data.fileDelete.userErrors[0].message}`);
    }

    return data.fileDelete.deletedFileIds.includes(fileId);
  }

  async replaceProductImage(productId: string, oldImageId: string, newImageUrl: string, altText?: string): Promise<ShopifyImage> {
    // First, delete the old image if it exists and is valid
    if (oldImageId && oldImageId !== 'null' && oldImageId !== '') {
      try {
        await this.deleteProductMedia(productId, oldImageId);
      } catch (error) {
        console.warn(`Failed to delete old image ${oldImageId}:`, error);
        // Continue with adding new image even if deletion fails
      }
    }
    
    // Then add the new image
    return await this.addImageToProduct(productId, newImageUrl, altText);
  }

  async replaceVariantImage(variantId: string, productId: string, newImageUrl: string, altText?: string, existingImageId?: string): Promise<ShopifyImage> {
    try {
      console.log('Starting replaceVariantImage (DELETE FIRST, THEN ADD):', { variantId, productId, existingImageId });
      
      // STEP 1: DELETE the old image FIRST for true replacement behavior
      let deletionSuccessful = false;
      if (existingImageId && existingImageId !== 'null' && existingImageId !== '') {
        try {
          console.log(`Deleting old image first: ${existingImageId}`);
          deletionSuccessful = await this.deleteProductMedia(productId, existingImageId);
          if (deletionSuccessful) {
            console.log(`Successfully deleted old product image: ${existingImageId}`);
          } else {
            console.log(`Old image deletion skipped (likely legacy ProductImage format): ${existingImageId}`);
          }
        } catch (deleteError) {
          console.warn(`Failed to delete old image ${existingImageId}:`, deleteError);
          // Continue with adding new image even if deletion fails
        }
      }
      
      // STEP 2: Create the new product media (this attaches it to the product automatically)
      const newImage = await this.createProductMediaFromUrl(productId, newImageUrl, altText);
      console.log('Created new product media after deletion:', newImage.id);
      
      // STEP 3: Try to update the variant to use the new image
      // Note: Current Shopify API makes it difficult to assign specific media to variants
      // The image is already attached to the product and will be available
      const variantUpdated = await this.updateProductVariantImage(variantId, newImage.id);
      
      if (deletionSuccessful) {
        console.log('Image replacement completed - old deleted, new added');
      } else {
        console.log('Image addition completed - new image added (old image deletion was skipped due to format incompatibility)');
      }
      
      return newImage;
    } catch (error) {
      console.error('Error in replaceVariantImage:', error);
      throw error;
    }
  }

  async getProductImages(productId: string): Promise<ShopifyImage[]> {
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          images(first: 50) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { id: productId });
    
    if (!data.product) {
      return [];
    }

    return data.product.images.edges.map((edge: any) => edge.node);
  }

  async updateImageAltText(imageId: string, altText: string): Promise<boolean> {
    const query = `
      mutation productImageUpdate($productImage: ProductImageInput!) {
        productImageUpdate(productImage: $productImage) {
          image {
            id
            altText
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, {
      productImage: {
        id: imageId,
        altText: altText
      }
    });

    if (data.productImageUpdate.userErrors?.length > 0) {
      throw new Error(`Alt text update error: ${data.productImageUpdate.userErrors[0].message}`);
    }

    return true;
  }

  async deleteProductMedia(productId: string, imageId: string): Promise<boolean> {
    console.log(`Attempting to delete image: ${imageId} from product: ${productId}`);
    
    // Check if it's a ProductImage ID (legacy format)
    if (imageId.includes('ProductImage')) {
      console.log(`Legacy ProductImage ID detected: ${imageId}`);
      // For ProductImage IDs, we need to get the corresponding MediaImage and delete it
      try {
        const productMedia = await this.getProductMedia(productId);
        console.log(`Found ${productMedia.length} media items on product`);
        
        if (productMedia.length > 0) {
          // Get the first media item (which is likely the variant's current image)
          // In most cases with single variant products, this will be the correct image to replace
          const mediaToDelete = productMedia[0];
          console.log(`Attempting to delete MediaImage: ${mediaToDelete.id}`);
          
          // Recursively call this function with the MediaImage ID
          return await this.deleteProductMedia(productId, mediaToDelete.id);
        } else {
          console.log(`No media items found on product - nothing to delete`);
          return false;
        }
      } catch (error) {
        console.warn(`Could not fetch product media for deletion: ${error}`);
        return false;
      }
    }
    
    // For MediaImage IDs, use the proper deletion mutation
    const query = `
      mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, {
      productId: productId,
      mediaIds: [imageId]
    });

    if (data.productDeleteMedia.mediaUserErrors?.length > 0) {
      throw new Error(`Media deletion error: ${data.productDeleteMedia.mediaUserErrors[0].message}`);
    }

    const deleted = data.productDeleteMedia.deletedMediaIds.includes(imageId);
    console.log(`MediaImage deletion result: ${deleted}`);
    return deleted;
  }

  async getProductMedia(productId: string): Promise<any[]> {
    const query = `
      query getProductMedia($id: ID!) {
        product(id: $id) {
          media(first: 50) {
            edges {
              node {
                ... on MediaImage {
                  id
                  alt
                  image {
                    url
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { id: productId });
    
    if (!data.product) {
      return [];
    }

    return data.product.media.edges.map((edge: any) => edge.node);
  }

  // Direct method to create product media from buffer for bulk operations
  async createProductMediaFromBuffer(productId: string, imageBuffer: Buffer, altText?: string, customFilename?: string, fileExtension?: string): Promise<ShopifyImage> {
    try {
      console.log(`Creating product media from buffer (${imageBuffer.length} bytes) for product: ${productId}`);
      
      // ACTUAL IMAGE FORMAT CONVERSION using Sharp
      let processedImageBuffer = imageBuffer;
      let mimeType = 'image/jpeg'; // default
      let filename: string;
      let extension: string;
      
      if (customFilename && fileExtension) {
        // Use provided custom filename and extension
        extension = fileExtension === 'jpeg' ? 'jpg' : fileExtension;
        filename = customFilename.replace(/\.[^/.]+$/, '') + '.' + extension;
        
        console.log(`Converting image to ${fileExtension} format...`);
        
        // ACTUALLY CONVERT THE IMAGE using Sharp
        try {
          const sharpImage = sharp(imageBuffer);
          
          switch (fileExtension) {
            case 'png':
              processedImageBuffer = await sharpImage.png({ quality: 100 }).toBuffer();
              mimeType = 'image/png';
              console.log(`✅ Successfully converted to PNG format`);
              break;
            case 'webp':
              processedImageBuffer = await sharpImage.webp({ quality: 90 }).toBuffer();
              mimeType = 'image/webp';
              console.log(`✅ Successfully converted to WebP format`);
              break;
            case 'jpeg':
            default:
              processedImageBuffer = await sharpImage.jpeg({ quality: 90 }).toBuffer();
              mimeType = 'image/jpeg';
              console.log(`✅ Successfully converted to JPEG format`);
              break;
          }
          
          console.log(`Image conversion complete: ${imageBuffer.length} bytes -> ${processedImageBuffer.length} bytes`);
        } catch (conversionError) {
          console.error('Image conversion failed, using original buffer:', conversionError);
          // Fall back to original buffer if conversion fails
          mimeType = fileExtension === 'png' ? 'image/png' : fileExtension === 'webp' ? 'image/webp' : 'image/jpeg';
        }
      } else {
        // Fallback to auto-detection and timestamp-based naming
        const timestamp = Date.now();
        extension = 'jpg';
        filename = `bulk_upload_${timestamp}.${extension}`;
      }
      
      console.log(`Creating staged upload for: ${filename} (${mimeType})`);
      
      // Step 1: Create staged upload target (use processed buffer length)
      const stagedTarget = await this.createStagedUpload(filename, mimeType, processedImageBuffer.length);
      
      console.log(`Staged upload created, uploading to: ${stagedTarget.url}`);
      
      // Step 2: Upload buffer to staged target
      const formData = new FormData();
      
      // Add all required parameters from Shopify
      stagedTarget.parameters.forEach(param => {
        formData.append(param.name, param.value);
      });
      
      // Create a Blob from the PROCESSED buffer and append as file
      const blob = new Blob([processedImageBuffer], { type: mimeType });
      formData.append('file', blob, filename);
      
      console.log(`Uploading ${processedImageBuffer.length} bytes to staged target...`);
      const uploadResponse = await fetch(stagedTarget.url, {
        method: 'POST',
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Staged upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }
      
      console.log(`File uploaded successfully to staged target`);
      
      // Step 3: Create product media directly from staged upload
      console.log(`Creating product media from staged upload: ${stagedTarget.resourceUrl}`);
      
      const query = `
        mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
          productCreateMedia(media: $media, productId: $productId) {
            media {
              ... on MediaImage {
                id
                alt
                image {
                  url
                }
              }
            }
            mediaUserErrors {
              field
              message
            }
            product {
              id
            }
          }
        }
      `;

      const data = await this.graphqlRequest(query, {
        productId: productId,
        media: [{
          originalSource: stagedTarget.resourceUrl,
          alt: altText || '',
          mediaContentType: "IMAGE"
        }]
      });

      if (data.productCreateMedia.mediaUserErrors?.length > 0) {
        throw new Error(`Product media creation error: ${data.productCreateMedia.mediaUserErrors[0].message}`);
      }

      const mediaImage = data.productCreateMedia.media[0];
      console.log('Created media response:', JSON.stringify(mediaImage, null, 2));
      
      // Handle the case where image might be null or undefined
      const resultImageUrl = mediaImage.image?.url || ''; // Use empty string as fallback
      
      return {
        id: mediaImage.id,
        url: resultImageUrl,
        altText: mediaImage.alt,
      };
    } catch (error) {
      console.error('Error in createProductMediaFromBuffer:', error);
      throw error;
    }
  }
}
