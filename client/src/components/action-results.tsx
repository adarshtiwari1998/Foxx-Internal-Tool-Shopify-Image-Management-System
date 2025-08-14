import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProductOperation } from "@/lib/types";

export default function ActionResults() {
  const { toast } = useToast();

  const { data: operations, isLoading } = useQuery<ProductOperation[]>({
    queryKey: ["/api/operations"],
    refetchInterval: 5000, // Refetch every 5 seconds to get updates
  });

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const openUrl = (url: string) => {
    window.open(url, '_blank');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-yellow-50 border-yellow-200';
    }
  };

  const recentOperations = operations?.slice(0, 5) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="mr-2 h-5 w-5 text-foxx-blue" />
          Action Results
        </CardTitle>
        <CardDescription>
          View operation status and generated links
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-foxx-blue border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-gray-500">Loading operations...</p>
          </div>
        ) : recentOperations.length > 0 ? (
          <div className="space-y-4" data-testid="operations-list">
            {recentOperations.map((operation) => (
              <div
                key={operation.id}
                className={`border rounded-lg p-4 ${getStatusColor(operation.status)}`}
                data-testid={`operation-${operation.id}`}
              >
                <div className="flex items-start">
                  {getStatusIcon(operation.status)}
                  <div className="flex-1 ml-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-900">
                        {operation.operationType === 'replace' ? 'Image Replaced' : 'Image Added'}
                      </h4>
                      <Badge variant="outline" className="text-xs">
                        {operation.status}
                      </Badge>
                    </div>
                    
                    <div className="mt-1 text-sm text-gray-700">
                      {operation.status === 'success' && (
                        <>Successfully {operation.operationType === 'replace' ? 'replaced' : 'added'} product image</>
                      )}
                      {operation.status === 'error' && (
                        <>Failed to {operation.operationType} image: {operation.errorMessage}</>
                      )}
                      {operation.status === 'pending' && (
                        <>Processing {operation.operationType} operation...</>
                      )}
                    </div>

                    {operation.sku && (
                      <p className="text-xs text-gray-500 mt-1">
                        SKU: {operation.sku}
                      </p>
                    )}

                    {operation.status === 'success' && (operation.previewUrl || operation.liveUrl) && (
                      <div className="mt-3 space-y-2">
                        {operation.previewUrl && (
                          <div className="flex items-center justify-between bg-white rounded p-2">
                            <span className="text-sm text-gray-600">Preview Link (Draft):</span>
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => copyToClipboard(operation.previewUrl!, 'Preview link')}
                              className="h-auto p-0 text-foxx-blue hover:text-foxx-blue/90"
                              data-testid={`button-copy-preview-${operation.id}`}
                            >
                              <Copy className="mr-1 h-3 w-3" />
                              Copy Link
                            </Button>
                          </div>
                        )}
                        
                        {operation.liveUrl && (
                          <div className="flex items-center justify-between bg-white rounded p-2">
                            <span className="text-sm text-gray-600">Live URL:</span>
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => openUrl(operation.liveUrl!)}
                              className="h-auto p-0 text-foxx-blue hover:text-foxx-blue/90"
                              data-testid={`button-open-live-${operation.id}`}
                            >
                              <ExternalLink className="mr-1 h-3 w-3" />
                              Open Product
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(operation.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500" data-testid="no-operations">
            <Clock className="mx-auto h-8 w-8 mb-2" />
            <p>No operations performed yet</p>
            <p className="text-sm">Results will appear here after actions are completed</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
