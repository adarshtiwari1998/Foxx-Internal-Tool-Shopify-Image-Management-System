import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, Info, Image as ImageIcon } from "lucide-react";
import type { ProductVariant } from "@/lib/types";

const searchSchema = z.object({
  query: z.string().min(1, "Please enter a SKU or URL"),
});

type SearchFormData = z.infer<typeof searchSchema>;

interface ProductSearchProps {
  onProductSelect: (product: ProductVariant | null) => void;
}

export default function ProductSearch({ onProductSelect }: ProductSearchProps) {
  const [searchResults, setSearchResults] = useState<ProductVariant | null>(null);
  const { toast } = useToast();

  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      query: "",
    },
  });

  const searchMutation = useMutation({
    mutationFn: async (data: SearchFormData) => {
      const isUrl = data.query.includes('http') || data.query.includes('/products/');
      const queryParams = new URLSearchParams({
        query: data.query,
        type: isUrl ? 'url' : 'sku',
      });
      
      const response = await apiRequest("GET", `/api/products/search?${queryParams}`);
      return response.json();
    },
    onSuccess: (product: ProductVariant) => {
      setSearchResults(product);
      onProductSelect(product);
      toast({
        title: "Product Found",
        description: `Found product: ${product.product.title}`,
      });
    },
    onError: (error: any) => {
      setSearchResults(null);
      onProductSelect(null);
      toast({
        title: "Search Failed",
        description: error.message || "Product not found",
        variant: "destructive",
      });
    },
  });

  const handleSearch = (data: SearchFormData) => {
    searchMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="mr-2 h-5 w-5 text-foxx-blue" />
            Product Search
          </CardTitle>
          <CardDescription>
            Search by SKU or paste product URL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSearch)} className="space-y-4">
              <FormField
                control={form.control}
                name="query"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU or Product URL</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Enter SKU (e.g., FL-001-XL) or paste Shopify URL"
                          {...field}
                          data-testid="input-search-query"
                        />
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Button
                          type="submit"
                          disabled={searchMutation.isPending}
                          size="sm"
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-foxx-blue hover:bg-foxx-blue/90"
                          data-testid="button-search"
                        >
                          {searchMutation.isPending ? (
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                          ) : (
                            "Search"
                          )}
                        </Button>
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span className="flex items-center">
                  <Info className="mr-1 h-4 w-4 text-foxx-blue" />
                  Supports both live and draft product URLs
                </span>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Product Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Eye className="mr-2 h-5 w-5 text-foxx-blue" />
            Product Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {searchResults ? (
            <div className="space-y-4" data-testid="product-preview">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-24 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                    {searchResults.image?.url ? (
                      <img
                        src={searchResults.image.url}
                        alt={searchResults.image.altText || "Product image"}
                        className="w-full h-full object-cover"
                        data-testid="img-product-current"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-center">Current Image</p>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 
                    className="text-sm font-medium text-gray-900 truncate"
                    data-testid="text-product-title"
                  >
                    {searchResults.product.title}
                  </h4>
                  <p className="text-sm text-gray-500" data-testid="text-product-sku">
                    SKU: {searchResults.sku}
                  </p>
                  <p className="text-sm text-gray-500" data-testid="text-product-variant">
                    Variant: {searchResults.title}
                  </p>
                  <div className="mt-2">
                    <Badge 
                      variant={searchResults.product.status === 'ACTIVE' ? 'default' : 'secondary'}
                      data-testid="badge-product-status"
                    >
                      {searchResults.product.status}
                    </Badge>
                  </div>
                  {searchResults.image?.altText && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500">
                        Alt text: {searchResults.image.altText}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-24 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-center">Current Image</p>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 
                    className="text-sm font-medium text-gray-900 truncate"
                    data-testid="text-no-product"
                  >
                    Search for a product to see details
                  </h4>
                  <p className="text-sm text-gray-500">SKU: --</p>
                  <p className="text-sm text-gray-500">Status: --</p>
                  <div className="mt-2">
                    <Badge variant="secondary">
                      No Product Selected
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
