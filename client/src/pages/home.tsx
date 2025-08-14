import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StoreConfiguration from "@/components/store-configuration";
import ProductSearch from "@/components/product-search";
import ImageManagement from "@/components/image-management";
import ActionResults from "@/components/action-results";
import StoreSwitcher from "@/components/store-switcher";
import HeaderStoreSwitcher from "@/components/header-store-switcher";
import type { Store, ProductVariant } from "@/lib/types";

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<ProductVariant | null>(null);

  const { data: activeStore } = useQuery<Store | null>({
    queryKey: ["/api/stores/active"],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <img 
                src="https://www.foxxlifesciences.com/cdn/shop/t/38/assets/logo.png?v=91111398020413059131740668507" 
                alt="Foxx Life Sciences Logo" 
                className="h-8 w-auto"
                data-testid="logo-foxx"
              />
              <div className="border-l border-gray-300 pl-4">
                <h1 className="text-xl font-semibold text-gray-900" data-testid="text-app-title">
                  Internal Tools
                </h1>
                <p className="text-sm text-gray-500" data-testid="text-app-subtitle">
                  Shopify Image Management System
                </p>
              </div>
            </div>
            <HeaderStoreSwitcher />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Store Configuration */}
        <div className="mb-8" data-testid="store-configuration">
          <StoreConfiguration />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Product Search */}
          <div className="space-y-6">
            <ProductSearch onProductSelect={setSelectedProduct} />
          </div>

          {/* Image Management */}
          <div className="space-y-6">
            <ImageManagement selectedProduct={selectedProduct} />
          </div>
        </div>

        {/* Action Results */}
        <div className="mt-8">
          <ActionResults />
        </div>

        {/* Store Switcher */}
        <div className="mt-8">
          <StoreSwitcher />
        </div>
      </div>
    </div>
  );
}
