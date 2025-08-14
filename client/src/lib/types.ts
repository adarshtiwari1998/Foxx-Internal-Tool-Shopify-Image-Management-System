export interface Store {
  id: string;
  name: string;
  storeUrl: string;
  accessToken: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface ProductOperation {
  id: string;
  storeId: string;
  productId?: string;
  variantId?: string;
  sku?: string;
  operationType: 'replace' | 'add' | 'update';
  imageUrl?: string;
  altText?: string;
  previewUrl?: string;
  liveUrl?: string;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
  metadata?: any;
  createdAt: string;
}

export interface ImageUploadResult {
  url: string;
  filename: string;
  size: number;
}
