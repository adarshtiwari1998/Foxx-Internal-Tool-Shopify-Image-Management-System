import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Circle, Plus } from "lucide-react";
import type { Store } from "@/lib/types";

export default function StoreSwitcher() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stores, isLoading } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  const { data: activeStore } = useQuery<Store | null>({
    queryKey: ["/api/stores/active"],
  });

  const activateStoreMutation = useMutation({
    mutationFn: async (storeId: string) => {
      const response = await apiRequest("POST", `/api/stores/${storeId}/activate`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Store Activated",
        description: "Successfully switched to the selected store",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/active"] });
    },
    onError: (error: any) => {
      toast({
        title: "Switch Failed",
        description: error.message || "Failed to switch stores",
        variant: "destructive",
      });
    },
  });

  const handleStoreSwitch = (storeId: string) => {
    if (storeId !== activeStore?.id) {
      activateStoreMutation.mutate(storeId);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <RefreshCw className="mr-2 h-5 w-5 text-foxx-blue" />
            Quick Store Switch
          </CardTitle>
          <CardDescription>
            Switch between saved store configurations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="animate-spin h-6 w-6 border-2 border-foxx-blue border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-gray-500">Loading stores...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <RefreshCw className="mr-2 h-5 w-5 text-foxx-blue" />
          Quick Store Switch
        </CardTitle>
        <CardDescription>
          Switch between saved store configurations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores && stores.length > 0 ? (
            stores.map((store) => {
              const isActive = store.id === activeStore?.id;
              
              return (
                <div
                  key={store.id}
                  className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                    isActive 
                      ? 'border-foxx-blue bg-blue-50' 
                      : 'border-gray-200 hover:border-foxx-blue'
                  }`}
                  onClick={() => handleStoreSwitch(store.id)}
                  data-testid={`store-card-${store.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900" data-testid={`store-name-${store.id}`}>
                        {store.name}
                      </h4>
                      <p className="text-sm text-gray-500" data-testid={`store-url-${store.id}`}>
                        {store.storeUrl}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Circle 
                        className={`h-2 w-2 ${
                          isActive ? 'text-green-500 fill-current' : 'text-gray-400 fill-current'
                        }`} 
                      />
                      <Badge variant={isActive ? 'default' : 'secondary'}>
                        {isActive ? 'Active' : 'Saved'}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full text-center py-4 text-gray-500">
              <p>No stores configured yet</p>
              <p className="text-sm">Add your first store using the configuration form above</p>
            </div>
          )}
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-foxx-blue transition-colors cursor-pointer flex items-center justify-center">
            <div className="text-center">
              <Plus className="mx-auto h-6 w-6 text-gray-400 mb-1" />
              <p className="text-sm text-gray-500">Add New Store</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
