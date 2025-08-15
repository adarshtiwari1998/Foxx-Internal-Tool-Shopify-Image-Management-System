import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, Clock, XCircle, Copy, ExternalLink, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ProductOperation } from "@/lib/types";
import { useState } from "react";

export default function ActionResults() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOperations, setSelectedOperations] = useState<Set<string>>(new Set());

  const { data: operations, isLoading } = useQuery<ProductOperation[]>({
    queryKey: ["/api/operations"],
    refetchInterval: 5000, // Refetch every 5 seconds to get updates
  });

  // Delete single operation mutation
  const deleteOperationMutation = useMutation({
    mutationFn: (operationId: string) => 
      apiRequest(`/api/operations/${operationId}`, {
        method: 'DELETE'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({
        title: "Success",
        description: "Operation deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete operation",
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (operationIds: string[]) => 
      apiRequest('/api/operations/bulk-delete', {
        method: 'POST',
        body: { operationIds }
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      setSelectedOperations(new Set());
      toast({
        title: "Success",
        description: `Deleted ${data.deletedCount} operations`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Delete Failed",
        description: error.message || "Failed to delete operations",
        variant: "destructive",
      });
    },
  });

  // Clear all operations mutation
  const clearAllMutation = useMutation({
    mutationFn: () => 
      apiRequest('/api/operations', {
        method: 'DELETE'
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      setSelectedOperations(new Set());
      toast({
        title: "Success",
        description: `Cleared all ${data.deletedCount} operations`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Clear All Failed",
        description: error.message || "Failed to clear operations",
        variant: "destructive",
      });
    },
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

  const handleDeleteOperation = (operationId: string) => {
    deleteOperationMutation.mutate(operationId);
  };

  const handleSelectOperation = (operationId: string, checked: boolean) => {
    const newSelected = new Set(selectedOperations);
    if (checked) {
      newSelected.add(operationId);
    } else {
      newSelected.delete(operationId);
    }
    setSelectedOperations(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && operations) {
      setSelectedOperations(new Set(operations.map(op => op.id)));
    } else {
      setSelectedOperations(new Set());
    }
  };

  const handleBulkDelete = () => {
    if (selectedOperations.size > 0) {
      bulkDeleteMutation.mutate(Array.from(selectedOperations));
    }
  };

  const handleClearAll = () => {
    clearAllMutation.mutate();
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
  const hasOperations = operations && operations.length > 0;
  const hasSelections = selectedOperations.size > 0;
  const allSelected = operations && selectedOperations.size === operations.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Clock className="mr-2 h-5 w-5 text-foxx-blue" />
            Action Results
          </div>
          {hasOperations && (
            <div className="flex items-center gap-2">
              {hasSelections && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected ({selectedOperations.size})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={clearAllMutation.isPending}
                data-testid="button-clear-all"
              >
                <X className="mr-2 h-4 w-4" />
                Clear All
              </Button>
            </div>
          )}
        </CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span>View operation status and generated links</span>
          {hasOperations && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                data-testid="checkbox-select-all"
              />
              <span className="text-sm">Select All</span>
            </div>
          )}
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
                  <Checkbox
                    checked={selectedOperations.has(operation.id)}
                    onCheckedChange={(checked) => handleSelectOperation(operation.id, checked as boolean)}
                    className="mt-1 mr-3"
                    data-testid={`checkbox-operation-${operation.id}`}
                  />
                  {getStatusIcon(operation.status)}
                  <div className="flex-1 ml-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-900">
                        {operation.operationType === 'replace' ? 'Image Replaced' : 'Image Added'}
                      </h4>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {operation.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOperation(operation.id)}
                          disabled={deleteOperationMutation.isPending}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          data-testid={`button-delete-${operation.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
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
