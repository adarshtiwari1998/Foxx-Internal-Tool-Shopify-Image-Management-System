
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StoreConfiguration from "@/components/store-configuration";
import UnifiedImageWorkflow from "@/components/unified-image-workflow";
import BulkSkuWorkflow from "@/components/bulk-sku-workflow";
import ActionResults from "@/components/action-results";
import HeaderStoreSwitcher from "@/components/header-store-switcher";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Layers } from "lucide-react";
import type { Store } from "@/lib/types";

export default function Home() {
  const [activeTab, setActiveTab] = useState('single');

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

        {/* Main Content - Workflow Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Workflow - Takes 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single" className="flex items-center space-x-2" data-testid="tab-single">
                  <Package className="h-4 w-4" />
                  <span>Single SKU</span>
                </TabsTrigger>
                <TabsTrigger value="bulk" className="flex items-center space-x-2" data-testid="tab-bulk">
                  <Layers className="h-4 w-4" />
                  <span>Bulk SKUs (up to 30)</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="single" className="mt-6">
                <UnifiedImageWorkflow />
              </TabsContent>
              
              <TabsContent value="bulk" className="mt-6">
                <BulkSkuWorkflow />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Results and History */}
          <div className="space-y-6">
            <ActionResults />
          </div>
        </div>
      </div>
    </div>
  );
}
