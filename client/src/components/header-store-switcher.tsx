import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check, Store as StoreIcon, Plus } from "lucide-react";
import type { Store } from "@/lib/types";

export default function HeaderStoreSwitcher() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stores } = useQuery<Store[]>({
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
        title: "Store Switched",
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

  if (!stores || stores.length === 0) {
    return (
      <div className="flex items-center space-x-3">
        <span className="text-sm text-gray-500">Connected to:</span>
        <span 
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
          data-testid="text-no-store"
        >
          No store connected
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      <span className="text-sm text-gray-500">Store:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className="flex items-center space-x-2 min-w-[200px] justify-between"
            data-testid="button-store-switcher"
          >
            <div className="flex items-center space-x-2">
              <StoreIcon className="h-4 w-4" />
              <span className="truncate">
                {activeStore ? activeStore.name : "Select Store"}
              </span>
            </div>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Switch Store</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {stores.map((store) => (
            <DropdownMenuItem
              key={store.id}
              onClick={() => handleStoreSwitch(store.id)}
              className="flex items-center justify-between cursor-pointer"
              data-testid={`dropdown-store-${store.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{store.name}</div>
                <div className="text-xs text-gray-500 truncate">{store.storeUrl}</div>
              </div>
              {activeStore?.id === store.id && (
                <Check className="h-4 w-4 text-foxx-blue" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            className="flex items-center space-x-2 cursor-pointer text-foxx-blue"
            onClick={() => {
              // Scroll to store configuration section
              const storeConfigSection = document.querySelector('[data-testid="store-configuration"]');
              if (storeConfigSection) {
                storeConfigSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            data-testid="dropdown-add-store"
          >
            <Plus className="h-4 w-4" />
            <span>Add New Store</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}