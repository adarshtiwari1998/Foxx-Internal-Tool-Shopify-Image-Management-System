import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Globe, Key, Plug, Save, Circle, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { Store } from "@/lib/types";

const storeSchema = z.object({
  name: z.string().min(1, "Store name is required"),
  storeUrl: z.string().min(1, "Store URL is required"),
  accessToken: z.string().min(1, "Access token is required"),
});

type StoreFormData = z.infer<typeof storeSchema>;

export default function StoreConfiguration() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeStore } = useQuery<Store | null>({
    queryKey: ["/api/stores/active"],
  });

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  const form = useForm<StoreFormData>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: "",
      storeUrl: "",
      accessToken: "",
    },
  });

  const createStoreMutation = useMutation({
    mutationFn: async (data: StoreFormData) => {
      const response = await apiRequest("POST", "/api/stores", data);
      return response.json();
    },
    onSuccess: (store) => {
      toast({
        title: "Store Connected",
        description: `Successfully connected to ${store.name}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/active"] });
      form.reset();
      setIsExpanded(false);
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to store",
        variant: "destructive",
      });
    },
  });

  const handleConnect = async (data: StoreFormData) => {
    setIsConnecting(true);
    try {
      await createStoreMutation.mutateAsync(data);
    } finally {
      setIsConnecting(false);
    }
  };

  // Show collapsed view when stores exist and form is not expanded
  if (stores.length > 0 && !isExpanded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Globe className="mr-2 h-5 w-5 text-foxx-blue" />
              Store Configuration
              {activeStore && (
                <span className="ml-3 text-sm font-normal text-gray-600 dark:text-gray-400">
                  - {activeStore.name}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-sm text-gray-500">
                <span className="inline-flex items-center" data-testid="status-connection">
                  <Circle 
                    className={`mr-1 h-2 w-2 ${
                      activeStore ? 'text-green-500 fill-current' : 'text-red-500 fill-current'
                    }`} 
                  />
                  {activeStore ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(true)}
                className="flex items-center"
                data-testid="button-add-store"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Store
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  // Show full form when no stores exist or when expanded
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Globe className="mr-2 h-5 w-5 text-foxx-blue" />
            Store Configuration
          </div>
          {stores.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
              className="flex items-center"
              data-testid="button-collapse-form"
            >
              <ChevronUp className="h-4 w-4" />
              Collapse
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Configure Shopify store credentials for API access
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleConnect)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="My Store"
                          className="pl-10"
                          {...field}
                          data-testid="input-store-name"
                        />
                        <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="storeUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shopify Store URL</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="your-store.myshopify.com"
                          className="pl-10"
                          {...field}
                          data-testid="input-store-url"
                        />
                        <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accessToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store Access Token</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="password"
                          placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                          className="pl-10"
                          {...field}
                          data-testid="input-access-token"
                        />
                        <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-between items-center">
              <div className="flex space-x-3">
                <Button
                  type="submit"
                  disabled={isConnecting}
                  className="bg-foxx-blue hover:bg-foxx-blue/90"
                  data-testid="button-connect-store"
                >
                  {isConnecting ? (
                    <>
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Plug className="mr-2 h-4 w-4" />
                      Connect Store
                    </>
                  )}
                </Button>
              </div>

              <div className="text-sm text-gray-500">
                <span className="inline-flex items-center" data-testid="status-connection">
                  <Circle 
                    className={`mr-1 h-2 w-2 ${
                      activeStore ? 'text-green-500 fill-current' : 'text-red-500 fill-current'
                    }`} 
                  />
                  {activeStore ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
