import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { CloudUpload, Image as ImageIcon, FolderSync, Plus, Copy } from "lucide-react";
import type { ProductVariant, ImageUploadResult } from "@/lib/types";

const imageSchema = z.object({
  imageUrl: z.string().url("Please enter a valid image URL").optional().or(z.literal("")),
  altText: z.string().optional(),
});

type ImageFormData = z.infer<typeof imageSchema>;

interface ImageManagementProps {
  selectedProduct: ProductVariant | null;
}

export default function ImageManagement({ selectedProduct }: ImageManagementProps) {
  const [previewImage, setPreviewImage] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ImageFormData>({
    resolver: zodResolver(imageSchema),
    defaultValues: {
      imageUrl: "",
      altText: "",
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<ImageUploadResult> => {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await apiRequest("POST", "/api/images/upload", formData);
      return response.json();
    },
    onSuccess: (result) => {
      form.setValue("imageUrl", result.url);
      setPreviewImage(result.url);
      toast({
        title: "Image Uploaded",
        description: `Successfully uploaded ${result.filename}`,
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

  const updateImageMutation = useMutation({
    mutationFn: async (data: { operationType: 'replace' | 'add'; imageUrl: string; altText?: string }) => {
      if (!selectedProduct) {
        throw new Error("No product selected");
      }

      const response = await apiRequest("POST", "/api/products/update-image", {
        variantId: selectedProduct.id,
        productId: selectedProduct.product.id,
        sku: selectedProduct.sku,
        imageUrl: data.imageUrl,
        altText: data.altText,
        operationType: data.operationType,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Image Updated",
        description: "Product image has been successfully updated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      form.reset();
      setPreviewImage("");
      setUploadedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update product image",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image under 10MB",
          variant: "destructive",
        });
        return;
      }

      setUploadedFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload file
      uploadMutation.mutate(file);
    }
  };

  const handleImageUrlChange = (url: string) => {
    if (url && z.string().url().safeParse(url).success) {
      setPreviewImage(url);
    } else {
      setPreviewImage("");
    }
  };

  const copyExistingAltText = () => {
    if (selectedProduct?.image?.altText) {
      form.setValue("altText", selectedProduct.image.altText);
      toast({
        title: "Alt Text Copied",
        description: "Existing alt text has been copied to the form",
      });
    }
  };

  const handleReplaceImage = (data: ImageFormData) => {
    if (!data.imageUrl && !uploadedFile) {
      toast({
        title: "No Image Selected",
        description: "Please upload an image or provide an image URL",
        variant: "destructive",
      });
      return;
    }

    const imageUrl = data.imageUrl || previewImage;
    updateImageMutation.mutate({
      operationType: 'replace',
      imageUrl,
      altText: data.altText,
    });
  };

  const handleAddNewImage = (data: ImageFormData) => {
    if (!data.imageUrl && !uploadedFile) {
      toast({
        title: "No Image Selected",
        description: "Please upload an image or provide an image URL",
        variant: "destructive",
      });
      return;
    }

    const imageUrl = data.imageUrl || previewImage;
    updateImageMutation.mutate({
      operationType: 'add',
      imageUrl,
      altText: data.altText,
    });
  };

  const isDisabled = !selectedProduct;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <ImageIcon className="mr-2 h-5 w-5 text-foxx-blue" />
          Image Management
        </CardTitle>
        <CardDescription>
          Upload, replace, or update product images
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <div className="space-y-6">
            {/* Image Upload Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload New Image
              </label>
              <div 
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDisabled 
                    ? 'border-gray-200 bg-gray-50' 
                    : 'border-gray-300 hover:border-foxx-blue cursor-pointer'
                }`}
                onClick={() => !isDisabled && fileInputRef.current?.click()}
              >
                <CloudUpload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600 mb-2">
                  {isDisabled ? (
                    "Select a product first to upload images"
                  ) : (
                    <>
                      Drag and drop an image here, or{" "}
                      <span className="text-foxx-blue hover:text-foxx-blue/90 underline">
                        browse files
                      </span>
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 10MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={isDisabled}
                  data-testid="input-file-upload"
                />
              </div>
            </div>

            {/* Direct Image URL Input */}
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Or Paste Image URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/image.jpg"
                      disabled={isDisabled}
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        handleImageUrlChange(e.target.value);
                      }}
                      data-testid="input-image-url"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Alt Text Management */}
            <FormField
              control={form.control}
              name="altText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alt Text</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the image for accessibility..."
                      disabled={isDisabled}
                      rows={3}
                      {...field}
                      data-testid="textarea-alt-text"
                    />
                  </FormControl>
                  {selectedProduct?.image?.altText && (
                    <div className="mt-2 flex items-center space-x-2">
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={copyExistingAltText}
                        className="h-auto p-0 text-foxx-blue hover:text-foxx-blue/90"
                        data-testid="button-copy-alt-text"
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copy from existing image
                      </Button>
                    </div>
                  )}
                </FormItem>
              )}
            />

            {/* Image Preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview
              </label>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="w-full h-48 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Preview"
                      className="max-w-full max-h-full object-contain"
                      data-testid="img-preview"
                    />
                  ) : (
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">Image preview will appear here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                type="button"
                onClick={form.handleSubmit(handleReplaceImage)}
                disabled={isDisabled || updateImageMutation.isPending}
                className="w-full bg-foxx-blue hover:bg-foxx-blue/90"
                data-testid="button-replace-image"
              >
                {updateImageMutation.isPending ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FolderSync className="mr-2 h-4 w-4" />
                    Replace Existing Image
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={form.handleSubmit(handleAddNewImage)}
                disabled={isDisabled || updateImageMutation.isPending}
                variant="outline"
                className="w-full border-foxx-emerald text-foxx-emerald hover:bg-foxx-emerald/10"
                data-testid="button-add-image"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add as New Image
              </Button>
            </div>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}
