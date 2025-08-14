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
  };
}

export interface ShopifyImage {
  id: string;
  url: string;
  altText?: string;
}

export class ShopifyService {
  private config: ShopifyConfig;

  constructor(config: ShopifyConfig) {
    this.config = config;
  }

  private async graphqlRequest(query: string, variables: any = {}) {
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

    return edges[0].node;
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
            ... on GenericFile {
              url
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
        altText: altText || '',
      }],
    });

    if (data.fileCreate.userErrors?.length > 0) {
      throw new Error(`File upload error: ${data.fileCreate.userErrors[0].message}`);
    }

    const file = data.fileCreate.files[0];
    return {
      id: file.id,
      url: file.url,
      altText: altText,
    };
  }

  async updateProductVariantImage(variantId: string, imageId: string): Promise<boolean> {
    const query = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            image {
              id
              url
              altText
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
      input: {
        id: variantId,
        imageId: imageId,
      },
    });

    if (data.productVariantUpdate.userErrors?.length > 0) {
      throw new Error(`Variant update error: ${data.productVariantUpdate.userErrors[0].message}`);
    }

    return true;
  }

  async addImageToProduct(productId: string, imageUrl: string, altText?: string): Promise<ShopifyImage> {
    const query = `
      mutation productImageCreate($productId: ID!, $image: ImageInput!) {
        productImageCreate(productId: $productId, image: $image) {
          image {
            id
            url
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
      productId,
      image: {
        src: imageUrl,
        altText: altText || '',
      },
    });

    if (data.productImageCreate.userErrors?.length > 0) {
      throw new Error(`Image creation error: ${data.productImageCreate.userErrors[0].message}`);
    }

    return data.productImageCreate.image;
  }

  async generatePreviewLink(productId: string): Promise<string> {
    const query = `
      mutation productPreviewUrlGenerate($productId: ID!) {
        productPreviewUrlGenerate(productId: $productId) {
          previewUrl
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphqlRequest(query, { productId });

    if (data.productPreviewUrlGenerate.userErrors?.length > 0) {
      throw new Error(`Preview link error: ${data.productPreviewUrlGenerate.userErrors[0].message}`);
    }

    return data.productPreviewUrlGenerate.previewUrl;
  }

  getLiveProductUrl(handle: string): string {
    return `https://${this.config.storeUrl.replace('.myshopify.com', '.com')}/products/${handle}`;
  }
}
