import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Upload, 
  Link, 
  Image, 
  Package, 
  Globe,
  RefreshCw,
  Plus,
  Replace,
  Eye,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Loader2,
  Type
} from "lucide-react";
import type { ProductVariant } from "@/lib/types";

interface ImageOperationResult {
  success: boolean;
  operation: any;
  result: any;
  productVariant?: ProductVariant;
}

export default function UnifiedImageWorkflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Main workflow state
  const [inputType, setInputType] = useState<'sku' | 'url' | 'direct_image'>('sku');
  const [inputValue, setInputValue] = useState('');
  const [productData, setProductData] = useState<ProductVariant | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Image operation state
  const [operationType, setOperationType] = useState<'replace' | 'add'>('replace');
  const [imageSource, setImageSource] = useState('');
  const [altText, setAltText] = useState('');
  const [copyExistingAlt, setCopyExistingAlt] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  
  // Dimension state
  const [imageDimensions, setImageDimensions] = useState({ width: '', height: '' });
  const [useCustomDimensions, setUseCustomDimensions] = useState(false);

  // Results state
  const [operationResult, setOperationResult] = useState<ImageOperationResult | null>(null);

  // Generate proper image filename
  const generateImageFilename = (file?: File) => {
    if (!productData) return file?.name || 'image';
    
    const sku = productData.sku || 'no-sku';
    const productTitle = productData.product.title
      .split(' ')
      .slice(0, 3) // First 3 words of title
      .join('_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    
    const dimensions = useCustomDimensions && imageDimensions.width && imageDimensions.height
      ? `${imageDimensions.width}x${imageDimensions.height}`
      : 'original';
    
    const extension = file?.name.split('.').pop() || 'jpg';
    
    return `${sku}_${dimensions}_${productTitle}.${extension}`;
  };

  // Product search functionality
  const searchProductMutation = useMutation({
    mutationFn: async ({ query, type }: { query: string; type: string }) => {
      const response = await apiRequest('GET', `/api/products/search?query=${encodeURIComponent(query)}&type=${type}`);
      return response.json();
    },
    onSuccess: (data: ProductVariant) => {
      setProductData(data);
      setIsSearching(false);
      
      // Auto-copy existing alt text if option is enabled
      if (copyExistingAlt && data.image?.altText) {
        setAltText(data.image.altText);
      }

      toast({
        title: "Product Found",
        description: `Found: ${data.product.title}`,
      });
    },
    onError: (error: any) => {
      setIsSearching(false);
      toast({
        title: "Search Failed",
        description: error.message || "Product not found",
        variant: "destructive",
      });
    },
  });

  // File upload functionality for staged uploads
  const stagedUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const filename = generateImageFilename(file);
      
      // Step 1: Create staged upload
      const stagedResponse = await apiRequest('POST', '/api/files/staged-upload', {
        filename: filename,
        mimeType: file.type,
        fileSize: file.size,
      });
      const stagedData = await stagedResponse.json();

      // Step 2: Upload file to staging URL
      const formData = new FormData();
      stagedData.parameters.forEach((param: any) => {
        formData.append(param.name, param.value);
      });
      formData.append('file', file);

      const uploadResponse = await fetch(stagedData.url, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      return stagedData.resourceUrl;
    },
    onSuccess: (stagedUrl: string) => {
      setImageSource(stagedUrl);
      toast({
        title: "Upload Complete",
        description: "Image uploaded successfully to Shopify",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    },
  });

  // Main image operation functionality
  const imageOperationMutation = useMutation({
    mutationFn: async (operationData: any) => {
      const response = await apiRequest('POST', '/api/products/update-image', operationData);
      return response.json();
    },
    onSuccess: (data: ImageOperationResult) => {
      setOperationResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/operations'] });
      
      // If we have updated product data, refresh the product preview
      if (data.productVariant) {
        setProductData(data.productVariant);
      }
      
      toast({
        title: "Operation Successful",
        description: `Image ${operationType === 'replace' ? 'replaced' : 'added'} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Operation Failed",
        description: error.message || "Failed to perform image operation",
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    if (!inputValue.trim()) return;
    
    setIsSearching(true);
    setProductData(null);
    
    searchProductMutation.mutate({
      query: inputValue,
      type: inputType === 'url' ? 'url' : 'sku'
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      
      // Auto-upload file
      stagedUploadMutation.mutate(file);
    }
  };

  const handleImageUrlChange = (url: string) => {
    setImageSource(url);
    setImagePreview(url);
  };

  const handleOperationSubmit = () => {
    if (!imageSource) {
      toast({
        title: "Missing Image",
        description: "Please provide an image source",
        variant: "destructive",
      });
      return;
    }

    if (!productData) {
      toast({
        title: "Missing Product",
        description: "Please search for a product first",
        variant: "destructive",
      });
      return;
    }

    const operationData = {
      variantId: productData.id,
      imageUrl: imageSource,
      altText: altText || undefined,
      operationType,
      productId: productData.product.id,
      sku: productData.sku,
      existingImageId: productData.image?.id,
    };

    imageOperationMutation.mutate(operationData);
  };

  const resetWorkflow = () => {
    setInputValue('');
    setProductData(null);
    setImageSource('');
    setAltText('');
    setSelectedFile(null);
    setImagePreview('');
    setOperationResult(null);
    setImageDimensions({ width: '', height: '' });
    setUseCustomDimensions(false);
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Input Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Step 1: Choose Input Method</span>
          </CardTitle>
          <CardDescription>
            Select how you want to identify the product or upload directly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={inputType} onValueChange={(value) => setInputType(value as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sku" className="flex items-center space-x-2">
                <Package className="h-4 w-4" />
                <span>SKU</span>
              </TabsTrigger>
              <TabsTrigger value="url" className="flex items-center space-x-2">
                <Globe className="h-4 w-4" />
                <span>Product URL</span>
              </TabsTrigger>
              <TabsTrigger value="direct_image" className="flex items-center space-x-2">
                <Image className="h-4 w-4" />
                <span>Direct Upload</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sku" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sku-input">Product SKU</Label>
                <div className="flex space-x-2">
                  <Input
                    id="sku-input"
                    placeholder="Enter SKU (e.g., FL-001-XL)"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="pl-10"
                    data-testid="input-sku"
                  />
                  <Button 
                    onClick={handleSearch} 
                    disabled={isSearching || !inputValue.trim()}
                    data-testid="button-search-sku"
                  >
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Search
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="url" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url-input">Product URL</Label>
                <div className="flex space-x-2">
                  <Input
                    id="url-input"
                    placeholder="Paste Shopify product URL"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="pl-10"
                    data-testid="input-url"
                  />
                  <Button 
                    onClick={handleSearch} 
                    disabled={isSearching || !inputValue.trim()}
                    data-testid="button-search-url"
                  >
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Search
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  ℹ️ Supports both live and draft product URLs
                </p>
              </div>
            </TabsContent>

            <TabsContent value="direct_image" className="space-y-4">
              <div className="space-y-2">
                <Label>Direct Image Upload</Label>
                <p className="text-sm text-gray-500">
                  Upload images directly to Shopify Files without linking to a specific product
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Product Preview */}
      {productData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>Product Preview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start space-x-4">
              <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden">
                {productData.image?.url ? (
                  <img 
                    src={productData.image.url} 
                    alt={productData.image.altText || "Product image"}
                    className="w-full h-full object-cover"
                    data-testid="img-current-product"
                  />
                ) : (
                  <Image className="h-8 w-8 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold" data-testid="text-product-title">
                  {productData.product.title}
                </h3>
                <p className="text-sm text-gray-600" data-testid="text-product-sku">
                  SKU: {productData.sku}
                </p>
                <p className="text-sm text-gray-600" data-testid="text-product-variant">
                  Variant: {productData.title}
                </p>
                <Badge 
                  variant={productData.product.status === 'ACTIVE' ? 'default' : 'secondary'}
                  data-testid="badge-product-status"
                >
                  {productData.product.status}
                </Badge>
                {productData.image?.altText && (
                  <p className="text-sm text-gray-500 mt-1" data-testid="text-existing-alt">
                    Current Alt Text: "{productData.image.altText}"
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Operation Type */}
      {(productData || inputType === 'direct_image') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5" />
              <span>Step 2: Choose Operation</span>
            </CardTitle>
            <CardDescription>
              What would you like to do with the image?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup 
              value={operationType} 
              onValueChange={(value) => setOperationType(value as any)}
              className="space-y-3"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="replace" id="replace" data-testid="radio-replace" />
                <Label htmlFor="replace" className="flex items-center space-x-2 cursor-pointer">
                  <Replace className="h-4 w-4" />
                  <span>Replace existing image</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="add" id="add" data-testid="radio-add" />
                <Label htmlFor="add" className="flex items-center space-x-2 cursor-pointer">
                  <Plus className="h-4 w-4" />
                  <span>Add new image</span>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Image Upload */}
      {(productData || inputType === 'direct_image') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Upload className="h-5 w-5" />
              <span>Step 3: Provide Image</span>
            </CardTitle>
            <CardDescription>
              Upload an image file or provide an image URL
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="upload" className="w-full">
              <TabsList>
                <TabsTrigger value="upload">Upload File</TabsTrigger>
                <TabsTrigger value="url">Image URL</TabsTrigger>
              </TabsList>
              
              <TabsContent value="upload" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="image-upload">Choose Image File</Label>
                  <Input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    data-testid="input-file-upload"
                  />
                  <p className="text-sm text-gray-500">
                    PNG, JPG, WEBP up to 10MB
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="url" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="image-url">Image URL</Label>
                  <Input
                    id="image-url"
                    placeholder="https://example.com/image.jpg"
                    value={imageSource}
                    onChange={(e) => handleImageUrlChange(e.target.value)}
                    data-testid="input-image-url"
                  />
                  <p className="text-sm text-gray-500">
                    Paste a direct link to the image
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {/* Dimension Selection */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="custom-dimensions"
                  checked={useCustomDimensions}
                  onCheckedChange={(checked) => setUseCustomDimensions(!!checked)}
                  data-testid="checkbox-custom-dimensions"
                />
                <Label htmlFor="custom-dimensions" className="text-sm">
                  Set custom dimensions for image processing
                </Label>
              </div>
              
              {useCustomDimensions && (
                <div className="space-y-3">
                  <Label>Image Dimensions</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="width" className="text-sm">Width (px)</Label>
                      <Select 
                        value={imageDimensions.width} 
                        onValueChange={(value) => setImageDimensions(prev => ({...prev, width: value}))}
                      >
                        <SelectTrigger data-testid="select-image-width">
                          <SelectValue placeholder="Select width" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="300">300px</SelectItem>
                          <SelectItem value="400">400px</SelectItem>
                          <SelectItem value="500">500px</SelectItem>
                          <SelectItem value="600">600px</SelectItem>
                          <SelectItem value="800">800px</SelectItem>
                          <SelectItem value="1000">1000px</SelectItem>
                          <SelectItem value="1200">1200px</SelectItem>
                          <SelectItem value="1500">1500px</SelectItem>
                          <SelectItem value="2000">2000px</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height" className="text-sm">Height (px)</Label>
                      <Select 
                        value={imageDimensions.height} 
                        onValueChange={(value) => setImageDimensions(prev => ({...prev, height: value}))}
                      >
                        <SelectTrigger data-testid="select-image-height">
                          <SelectValue placeholder="Select height" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="300">300px</SelectItem>
                          <SelectItem value="400">400px</SelectItem>
                          <SelectItem value="500">500px</SelectItem>
                          <SelectItem value="600">600px</SelectItem>
                          <SelectItem value="800">800px</SelectItem>
                          <SelectItem value="1000">1000px</SelectItem>
                          <SelectItem value="1200">1200px</SelectItem>
                          <SelectItem value="1500">1500px</SelectItem>
                          <SelectItem value="2000">2000px</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">
                    Images will be resized to these dimensions during upload
                  </p>
                </div>
              )}
            </div>

            {imagePreview && (
              <div className="space-y-2">
                <Label>Image Preview</Label>
                <div className="w-48 h-48 border rounded-lg overflow-hidden">
                  <img 
                    src={imagePreview} 
                    alt="Preview"
                    className="w-full h-full object-cover"
                    data-testid="img-preview"
                  />
                </div>
                {productData && (
                  <div className="text-sm text-gray-600">
                    <strong>Generated filename:</strong> {generateImageFilename(selectedFile || undefined)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Alt Text */}
      {(productData || inputType === 'direct_image') && imageSource && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Type className="h-5 w-5" />
              <span>Step 4: Alt Text</span>
            </CardTitle>
            <CardDescription>
              Provide alt text for accessibility
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {productData?.image?.altText && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-alt"
                  checked={copyExistingAlt}
                  onCheckedChange={(checked) => {
                    setCopyExistingAlt(!!checked);
                    if (checked && productData.image?.altText) {
                      setAltText(productData.image.altText);
                    }
                  }}
                  data-testid="checkbox-copy-alt"
                />
                <Label htmlFor="copy-alt" className="text-sm">
                  Copy existing alt text: "{productData.image.altText}"
                </Label>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="alt-text">Alt Text</Label>
              <Textarea
                id="alt-text"
                placeholder="Describe the image for accessibility..."
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                rows={3}
                data-testid="textarea-alt-text"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {(productData || inputType === 'direct_image') && imageSource && (
        <div className="flex justify-between items-center">
          <Button 
            variant="outline" 
            onClick={resetWorkflow}
            data-testid="button-reset"
          >
            Reset Workflow
          </Button>
          
          <Button 
            onClick={handleOperationSubmit}
            disabled={imageOperationMutation.isPending}
            className="flex items-center space-x-2"
            data-testid="button-submit-operation"
          >
            {imageOperationMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : operationType === 'replace' ? (
              <Replace className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>
              {operationType === 'replace' ? 'Replace Image' : 'Add Image'}
            </span>
          </Button>
        </div>
      )}

      {/* Results */}
      {operationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Operation Complete</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Badge variant="default">Success</Badge>
              <span className="text-sm">
                Image {operationType === 'replace' ? 'replaced' : 'added'} successfully
              </span>
            </div>
            
            {operationResult.operation.previewUrl && (
              <div className="flex items-center space-x-2">
                <ExternalLink className="h-4 w-4" />
                <a 
                  href={operationResult.operation.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                  data-testid="link-preview"
                >
                  View Draft Preview (24h expiry)
                </a>
              </div>
            )}
            
            {operationResult.operation.liveUrl && (
              <div className="flex items-center space-x-2">
                <ExternalLink className="h-4 w-4" />
                <a 
                  href={operationResult.operation.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                  data-testid="link-live"
                >
                  View Live Product
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}