import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import JSZip from "jszip";
import { 
  Search, 
  Upload, 
  Package, 
  FileText,
  Archive,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Eye,
  Plus,
  Replace,
  X,
  Download,
  Globe
} from "lucide-react";
import type { ProductVariant } from "@/lib/types";

interface BatchSearchResult {
  sku: string;
  status: 'found' | 'not_found' | 'error';
  product?: ProductVariant;
  error?: string;
}

interface BatchOperationStatus {
  id: string;
  name: string;
  operationType: 'replace' | 'add';
  totalItems: number;
  completedItems: number;
  failedItems: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  createdAt: string;
}

export default function BulkSkuWorkflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Bulk SKU state
  const [skuList, setSkuList] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [skuArray, setSkuArray] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<BatchSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Operation state
  const [operationType, setOperationType] = useState<'replace' | 'add'>('replace');
  const [inputMethod, setInputMethod] = useState<'sku_paste' | 'sku_list' | 'url_list' | 'direct_image'>('sku_paste'); // Multiple input methods including direct upload
  const [uploadMethod, setUploadMethod] = useState<'single' | 'zip' | 'individual'>('zip'); // Default to ZIP
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [fileExtension, setFileExtension] = useState<'png' | 'jpeg' | 'webp'>('png'); // Default PNG
  const [imagePreview, setImagePreview] = useState<string>(''); // Add image preview
  const [individualFiles, setIndividualFiles] = useState<{[sku: string]: File}>({}); // Individual files for each SKU

  // Dimension state
  const [imageDimensions, setImageDimensions] = useState({ width: '640', height: '640' }); // Default 640x640
  const [useCustomDimensions, setUseCustomDimensions] = useState(false);

  // Progress state
  const [currentBatch, setCurrentBatch] = useState<BatchOperationStatus | null>(null);

  // Parse SKU input (handles Excel/Google Sheets/Notepad paste)
  const parseBulkSku = (input: string): string[] => {
    return input
      .split(/[\n\r\t,]+/) // Split by newlines, tabs, or commas
      .map(sku => sku.trim())
      .filter(sku => sku.length > 0)
      .slice(0, 30); // Max 30 items
  };

  // Handle SKU input change
  const handleSkuInputChange = (value: string) => {
    setSkuList(value);
    const parsed = parseBulkSku(value);
    setSkuArray(parsed);
  };

  // Batch search mutation
  const batchSearchMutation = useMutation({
    mutationFn: async (skus: string[]) => {
      const response = await fetch('/api/products/batch-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ skus }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json() as Promise<BatchSearchResult[]>;
    },
    onSuccess: (results) => {
      setSearchResults(results);
      setIsSearching(false);
      
      // Auto-copy alt text from first found product if doing replacement
      if (operationType === 'replace') {
        const firstFound = results.find(r => r.status === 'found' && r.product);
        if (firstFound?.product?.product?.images?.[0]?.altText) {
          setAltText(firstFound.product.product.images[0].altText);
        }
      }
      
      const found = results.filter(r => r.status === 'found').length;
      const notFound = results.filter(r => r.status === 'not_found').length;
      const errors = results.filter(r => r.status === 'error').length;
      
      toast({
        title: "Search Complete",
        description: `Found ${found} products, ${notFound} not found, ${errors} errors`,
      });
    },
    onError: (error: any) => {
      setIsSearching(false);
      toast({
        title: "Search Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Batch operation mutation
  const batchOperationMutation = useMutation({
    mutationFn: async (data: {
      skus: string[];
      operationType: 'replace' | 'add';
      uploadMethod: 'single' | 'zip' | 'individual';
      file?: File;
      zipFile?: File;
      individualFiles?: {[sku: string]: File};
      altText?: string;
      dimensions?: { width: number; height: number };
    }) => {
      const formData = new FormData();
      formData.append('skus', JSON.stringify(data.skus));
      formData.append('operationType', data.operationType);
      formData.append('uploadMethod', data.uploadMethod);
      
      if (data.file) formData.append('singleFile', data.file);
      if (data.zipFile) formData.append('zipFile', data.zipFile);
      if (data.individualFiles) {
        Object.entries(data.individualFiles).forEach(([sku, file], index) => {
          formData.append(`individualFile_${index}`, file);
          formData.append(`individualSku_${index}`, sku);
        });
        formData.append('individualFilesCount', Object.keys(data.individualFiles).length.toString());
      }
      if (data.altText) formData.append('altText', data.altText);
      if (data.dimensions) formData.append('dimensions', JSON.stringify(data.dimensions));

      const response = await fetch('/api/products/batch-operation', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: (result) => {
      setCurrentBatch(result);
      toast({
        title: "Batch Operation Started",
        description: `Processing ${result.totalItems} items`,
      });
      
      // Start polling for progress
      pollBatchProgress(result.id);
    },
    onError: (error: any) => {
      toast({
        title: "Batch Operation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Poll batch progress
  const pollBatchProgress = (batchId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/batch-operations/${batchId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const batchStatus = await response.json() as BatchOperationStatus;
        setCurrentBatch(batchStatus);
        
        if (batchStatus.status === 'completed' || batchStatus.status === 'error') {
          clearInterval(interval);
          queryClient.invalidateQueries({ queryKey: ['/api/operations'] });
        }
      } catch (error) {
        clearInterval(interval);
      }
    }, 2000);
  };

  // Handle search
  const handleSearch = () => {
    if (skuArray.length === 0) {
      toast({
        title: "No SKUs",
        description: "Please enter at least one SKU",
        variant: "destructive",
      });
      return;
    }

    if (skuArray.length > 30) {
      toast({
        title: "Too Many SKUs",
        description: "Maximum 30 SKUs allowed per batch",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    batchSearchMutation.mutate(skuArray);
  };

  // Handle file selection
  const handleSingleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleZipFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        toast({
          title: "Invalid File",
          description: "Please select a ZIP file",
          variant: "destructive",
        });
        return;
      }
      setZipFile(file);
    }
  };

  // Handle batch operation submit
  const handleBatchSubmit = () => {
    const foundProducts = searchResults.filter(r => r.status === 'found');
    
    if (foundProducts.length === 0) {
      toast({
        title: "No Products Found",
        description: "No valid products to process",
        variant: "destructive",
      });
      return;
    }

    if (uploadMethod === 'single' && !selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (uploadMethod === 'zip' && !zipFile) {
      toast({
        title: "No ZIP File Selected",
        description: "Please select a ZIP file containing images",
        variant: "destructive",
      });
      return;
    }

    if (uploadMethod === 'individual' && Object.keys(individualFiles).length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one image file for the products",
        variant: "destructive",
      });
      return;
    }

    const operationData = {
      skus: foundProducts.map(p => p.sku),
      operationType,
      uploadMethod,
      file: selectedFile || undefined,
      zipFile: zipFile || undefined,
      individualFiles: Object.keys(individualFiles).length > 0 ? individualFiles : undefined,
      altText: altText || undefined,
      ...(useCustomDimensions && imageDimensions.width && imageDimensions.height && {
        dimensions: {
          width: parseInt(imageDimensions.width),
          height: parseInt(imageDimensions.height)
        }
      }),
    };

    batchOperationMutation.mutate(operationData);
  };

  // Reset workflow
  const resetWorkflow = () => {
    setSkuList('');
    setSkuArray([]);
    setSearchResults([]);
    setSelectedFile(null);
    setZipFile(null);
    setIndividualFiles({});
    setAltText('');
    setCurrentBatch(null);
    setImageDimensions({ width: '640', height: '640' });
    setUseCustomDimensions(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (zipInputRef.current) zipInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Find Your Products */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Step 1: Find Your Products</span>
          </CardTitle>
          <CardDescription>
            Choose how you want to find your products (up to 30 at a time)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Input Method Selection */}
          <div className="space-y-3">
            <Label>How do you want to find products?</Label>
            <RadioGroup value={inputMethod} onValueChange={(value: any) => setInputMethod(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sku_paste" id="sku_paste" />
                <Label htmlFor="sku_paste" className="flex items-center space-x-2">
                  <Package className="h-4 w-4" />
                  <span>📋 Copy & Paste Product Codes</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sku_list" id="sku_list" />
                <Label htmlFor="sku_list" className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span>✏️ Type Product Codes One by One</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="url_list" id="url_list" />
                <Label htmlFor="url_list" className="flex items-center space-x-2">
                  <Globe className="h-4 w-4" />
                  <span>🌐 Use Product Web Links</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="direct_image" id="direct_image" />
                <Label htmlFor="direct_image" className="flex items-center space-x-2">
                  <Upload className="h-4 w-4" />
                  <span>📸 Upload Images Directly</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Input Area Based on Method */}
          {inputMethod === 'sku_paste' && (
            <div className="space-y-2">
              <Label htmlFor="bulk-sku">Product Codes (one per line, or separated by commas)</Label>
              <Textarea
                id="bulk-sku"
                placeholder="FL-001-XL&#10;FL-002-L&#10;FL-003-M&#10;..."
                value={skuList}
                onChange={(e) => handleSkuInputChange(e.target.value)}
                className="min-h-[120px] font-mono text-sm"
                data-testid="textarea-bulk-sku"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{skuArray.length} codes found</span>
                <span>Max: 30 products</span>
              </div>
            </div>
          )}

          {inputMethod === 'sku_list' && (
            <div className="space-y-4">
              <Label>Type your product codes:</Label>
              <div className="flex space-x-2">
                <Input
                  placeholder="Enter a product code (e.g., FL-001-XL)"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && inputValue.trim()) {
                      if (skuArray.length < 30 && !skuArray.includes(inputValue.trim())) {
                        setSkuArray(prev => [...prev, inputValue.trim()]);
                        setInputValue('');
                      }
                    }
                  }}
                />
                <Button 
                  onClick={() => {
                    if (inputValue.trim() && skuArray.length < 30 && !skuArray.includes(inputValue.trim())) {
                      setSkuArray(prev => [...prev, inputValue.trim()]);
                      setInputValue('');
                    }
                  }}
                  disabled={!inputValue.trim() || skuArray.length >= 30 || skuArray.includes(inputValue.trim())}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
              {skuArray.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Added codes:</span>
                    <span>{skuArray.length}/30</span>
                  </div>
                  <div className="flex flex-wrap gap-1 p-2 border rounded-md max-h-24 overflow-y-auto">
                    {skuArray.map((sku, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {sku}
                        <button 
                          onClick={() => setSkuArray(prev => prev.filter((_, i) => i !== index))}
                          className="ml-1 hover:text-red-500"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {inputMethod === 'url_list' && (
            <div className="space-y-2">
              <Label htmlFor="bulk-url">Product Web Links (one per line)</Label>
              <Textarea
                id="bulk-url"
                placeholder="https://your-store.myshopify.com/products/product-name&#10;https://your-store.myshopify.com/admin/products/123456&#10;..."
                value={skuList}
                onChange={(e) => handleSkuInputChange(e.target.value)}
                className="min-h-[120px] font-mono text-sm"
                data-testid="textarea-bulk-url"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{skuArray.length} links found</span>
                <span>Max: 30 products</span>
              </div>
            </div>
          )}

          {inputMethod === 'direct_image' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">📸 Direct Upload Mode</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  In this mode, you can upload images directly to Shopify without linking to specific products.
                  Perfect for preparing images that you'll organize later!
                </p>
              </div>
              <div className="text-center py-8">
                <Upload className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                <p className="text-lg font-medium">Ready to upload your images!</p>
                <p className="text-sm text-muted-foreground">Choose your images in the next step.</p>
              </div>
            </div>
          )}

          {skuArray.length > 0 && (
            <div className="space-y-2">
              <Label>Parsed SKUs:</Label>
              <ScrollArea className="h-24 w-full border rounded-md p-2">
                <div className="flex flex-wrap gap-1">
                  {skuArray.map((sku, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {sku}
                    </Badge>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {skuArray.length > 0 && (
            <div className="space-y-2">
              <Label>Found products:</Label>
              <div className="flex flex-wrap gap-1 p-2 border rounded-md max-h-24 overflow-y-auto">
                {skuArray.map((sku, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {sku}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Button 
            onClick={handleSearch}
            disabled={isSearching || skuArray.length === 0}
            className="w-full"
            data-testid="button-batch-search"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Finding Products...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Find All Products
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Search Results Preview */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>Step 2: Search Results</span>
            </CardTitle>
            <CardDescription>
              Review found products before proceeding with bulk operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80 w-full">
              <div className="space-y-3">
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      result.status === 'found' 
                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' 
                        : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {result.status === 'found' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      )}
                      
                      {/* Product Image Preview */}
                      {(result.product?.image?.url || result.product?.product?.images?.[0]?.src) && (
                        <img 
                          src={result.product.image?.url || result.product.product.images[0].src}
                          alt={result.product.image?.altText || result.product.product.images?.[0]?.altText || 'Product image'}
                          className="w-12 h-12 object-cover rounded border"
                          data-testid={`image-preview-${result.sku}`}
                        />
                      )}
                      
                      <div>
                        <div className="font-mono text-sm font-medium">{result.sku}</div>
                        {result.product && (
                          <div className="text-sm text-muted-foreground">
                            {result.product.product.title} - {result.product.title}
                          </div>
                        )}
                        {(result.product?.image?.altText || result.product?.product?.images?.[0]?.altText) && (
                          <div className="text-xs text-blue-600 truncate max-w-md">
                            💬 Alt: {result.product.image?.altText || (result.product.product.images?.[0]?.altText)}
                          </div>
                        )}
                        {result.error && (
                          <div className="text-sm text-red-600">{result.error}</div>
                        )}
                      </div>
                    </div>
                    <Badge variant={result.status === 'found' ? 'default' : 'destructive'}>
                      {result.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {searchResults.filter(r => r.status === 'found').length}
                </div>
                <div className="text-sm text-muted-foreground">Found</div>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {searchResults.filter(r => r.status === 'not_found').length}
                </div>
                <div className="text-sm text-muted-foreground">Not Found</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg">
                <div className="text-2xl font-bold text-gray-600">
                  {searchResults.filter(r => r.status === 'error').length}
                </div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Bulk Operation Configuration */}
      {searchResults.filter(r => r.status === 'found').length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Upload className="h-5 w-5" />
              <span>Step 3: Choose Your Images</span>
            </CardTitle>
            <CardDescription>
              Tell us what you want to do with your product pictures
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Operation Type */}
            <div className="space-y-3">
              <Label>🎨 What do you want to do with the pictures?</Label>
              <RadioGroup value={operationType} onValueChange={(value: any) => setOperationType(value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="replace" id="replace" />
                  <Label htmlFor="replace" className="flex items-center space-x-2">
                    <Replace className="h-4 w-4" />
                    <span>🔄 Replace old pictures with new ones</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="add" id="add" />
                  <Label htmlFor="add" className="flex items-center space-x-2">
                    <Plus className="h-4 w-4" />
                    <span>➕ Add new pictures (keep old ones too)</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            {/* Upload Method */}
            <div className="space-y-3">
              <Label>📦 How are your pictures organized?</Label>
              <RadioGroup value={uploadMethod} onValueChange={(value: any) => setUploadMethod(value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="single" id="single" />
                  <Label htmlFor="single" className="flex items-center space-x-2">
                    <FileText className="h-4 w-4" />
                    <span>🖼️ One picture for all products</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="zip" id="zip" />
                  <Label htmlFor="zip" className="flex items-center space-x-2">
                    <Archive className="h-4 w-4" />
                    <span>🗂 ZIP folder with pictures named by product code</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="individual" id="individual" />
                  <Label htmlFor="individual" className="flex items-center space-x-2">
                    <Upload className="h-4 w-4" />
                    <span>📤 Upload one by one for each product</span>
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-sm text-muted-foreground">
                💡 Tip: Use ZIP for many products, or Individual to upload specific pictures for each product!
              </p>
            </div>

            <Separator />

            {/* File Extension Selection */}
            <div className="space-y-3">
              <Label>🖼️ What type of picture files do you want?</Label>
              <Select value={fileExtension} onValueChange={(value: any) => setFileExtension(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose picture format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">📷 PNG - Best quality (recommended)</SelectItem>
                  <SelectItem value="jpeg">🎨 JPEG - Smaller file size</SelectItem>
                  <SelectItem value="webp">✨ WebP - Super small & fast</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                PNG is best for crisp pictures. JPEG makes smaller files. WebP loads fastest!
              </p>
            </div>

            {/* File Upload based on method */}
            {uploadMethod === 'single' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="single-file">📎 Choose One Picture</Label>
                  <Input
                    id="single-file"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      handleSingleFileSelect(e);
                      const file = e.target.files?.[0];
                      if (file) {
                        setImagePreview(URL.createObjectURL(file));
                      }
                    }}
                    ref={fileInputRef}
                    data-testid="input-single-file"
                  />
                  {selectedFile && (
                    <div className="text-sm text-muted-foreground">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    🌈 This picture will be used for all your selected products
                  </p>
                </div>
                
                {/* Image Preview */}
                {imagePreview && (
                  <div className="space-y-2">
                    <Label>👀 Picture Preview</Label>
                    <div className="w-48 h-48 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden">
                      <img 
                        src={imagePreview} 
                        alt="Preview"
                        className="w-full h-full object-cover"
                        data-testid="img-bulk-preview"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {uploadMethod === 'zip' && (
              <div className="space-y-2">
                <Label htmlFor="zip-file">Select ZIP File</Label>
                <Input
                  id="zip-file"
                  type="file"
                  accept=".zip"
                  onChange={handleZipFileSelect}
                  ref={zipInputRef}
                  data-testid="input-zip-file"
                />
                {zipFile && (
                  <div className="text-sm text-muted-foreground">
                    Selected: {zipFile.name}
                  </div>
                )}
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>ZIP File Requirements:</strong>
                    <ul className="mt-1 ml-4 list-disc space-y-1">
                      <li>Name each image file exactly as the SKU (e.g., "FL-001-XL.jpg")</li>
                      <li>Supported formats: JPG, PNG, WEBP</li>
                      <li>Images not matching found SKUs will be ignored</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {uploadMethod === 'individual' && searchResults.filter(r => r.status === 'found').length > 0 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>📎 Choose pictures for each product</Label>
                  <p className="text-sm text-muted-foreground">
                    Upload a specific picture for each product found. You can skip products you don't want to update.
                  </p>
                </div>
                
                <div className="space-y-3 max-h-64 overflow-y-auto p-2 border rounded-lg">
                  {searchResults.filter(r => r.status === 'found').map((result, index) => {
                    const file = individualFiles[result.sku];
                    return (
                      <div key={result.sku} className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        {/* Product Image Preview */}
                        <div className="w-12 h-12 border rounded overflow-hidden flex-shrink-0">
                          {(result.product?.image?.url || result.product?.product?.images?.[0]?.src) ? (
                            <img 
                              src={result.product.image?.url || result.product.product.images[0].src}
                              alt={result.product.image?.altText || result.product.product.images?.[0]?.altText || 'Product image'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                              <Upload className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                        </div>
                        
                        {/* Product Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm font-medium truncate">{result.sku}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {result.product?.product.title} - {result.product?.title}
                          </div>
                        </div>
                        
                        {/* File Upload */}
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const selectedFile = e.target.files?.[0];
                              if (selectedFile) {
                                setIndividualFiles(prev => ({
                                  ...prev,
                                  [result.sku]: selectedFile
                                }));
                              }
                            }}
                            className="w-32 text-xs"
                            data-testid={`input-individual-${result.sku}`}
                          />
                          {file && (
                            <div className="text-xs text-green-600 font-medium">✓</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="text-xs text-muted-foreground">
                  📊 {Object.keys(individualFiles).length} of {searchResults.filter(r => r.status === 'found').length} products have pictures selected
                </div>
              </div>
            )}

            <Separator />

            {/* Dimensions */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Image Dimensions</Label>
              
              {/* Default dimensions display */}
              {!useCustomDimensions && (
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Default: 640 × 640 pixels</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUseCustomDimensions(true)}
                      data-testid="button-custom-dimensions"
                    >
                      Customize
                    </Button>
                  </div>
                </div>
              )}
              
              {useCustomDimensions && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Custom Dimensions</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUseCustomDimensions(false);
                        setImageDimensions({ width: '640', height: '640' });
                      }}
                      data-testid="button-reset-dimensions"
                    >
                      Reset to Default
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="width">Width (px)</Label>
                      <Select value={imageDimensions.width} onValueChange={(value) => 
                        setImageDimensions(prev => ({ ...prev, width: value }))
                      }>
                        <SelectTrigger data-testid="select-width">
                          <SelectValue placeholder="Select width" />
                        </SelectTrigger>
                        <SelectContent>
                          {[300, 400, 500, 600, 640, 800, 1000, 1200, 1500, 2000].map(size => (
                            <SelectItem key={size} value={size.toString()}>{size}px</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">Height (px)</Label>
                      <Select value={imageDimensions.height} onValueChange={(value) => 
                        setImageDimensions(prev => ({ ...prev, height: value }))
                      }>
                        <SelectTrigger data-testid="select-height">
                          <SelectValue placeholder="Select height" />
                        </SelectTrigger>
                        <SelectContent>
                          {[300, 400, 500, 600, 640, 800, 1000, 1200, 1500, 2000].map(size => (
                            <SelectItem key={size} value={size.toString()}>{size}px</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Alt Text */}
            <div className="space-y-2">
              <Label htmlFor="alt-text">Alt Text (optional, applies to all images)</Label>
              <Input
                id="alt-text"
                placeholder="Enter alt text for images"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                data-testid="input-alt-text"
              />
            </div>

            {/* Submit Button */}
            <div className="flex space-x-3">
              <Button
                onClick={handleBatchSubmit}
                disabled={batchOperationMutation.isPending}
                className="flex-1"
                data-testid="button-start-batch"
              >
                {batchOperationMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Starting Batch...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Start Batch Operation
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={resetWorkflow} data-testid="button-reset">
                <X className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Batch Progress */}
      {currentBatch && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Batch Progress</span>
            </CardTitle>
            <CardDescription>
              Real-time status of your batch operation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{currentBatch.completedItems}/{currentBatch.totalItems}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${(Number(currentBatch.completedItems) / Number(currentBatch.totalItems)) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <div className="text-lg font-bold text-blue-600">{currentBatch.totalItems}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-lg font-bold text-green-600">{currentBatch.completedItems}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                <div className="text-lg font-bold text-red-600">{currentBatch.failedItems}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg">
                <div className="text-lg font-bold text-gray-600">
                  {Number(currentBatch.totalItems) - Number(currentBatch.completedItems) - Number(currentBatch.failedItems)}
                </div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-2">
              <Badge variant={
                currentBatch.status === 'completed' ? 'default' :
                currentBatch.status === 'error' ? 'destructive' :
                currentBatch.status === 'processing' ? 'secondary' : 'outline'
              }>
                {currentBatch.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {currentBatch.name}
              </span>
            </div>

            {currentBatch.status === 'completed' && (
              <div className="text-center">
                <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Batch operation completed successfully!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}