import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ApiDocumentTemplate = {
  id: number;
  templateKey: string;
  kind: "override" | "custom";
  name: string;
  body: string;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type VariableDescriptor = {
  key: string;
  label: string;
  hint?: string;
};

export type VariableGroup = {
  id: string;
  label: string;
  variables: VariableDescriptor[];
};

export type CreateTemplateInput = {
  templateKey: string;
  kind?: "override" | "custom";
  name: string;
  body: string;
};

export const documentTemplatesKeys = {
  all: ["document-templates"] as const,
  list: () => [...documentTemplatesKeys.all, "list"] as const,
  byKey: (key: string) => [...documentTemplatesKeys.all, "key", key] as const,
  variables: () => [...documentTemplatesKeys.all, "variables"] as const,
};

export function useApiDocumentTemplates() {
  return useQuery({
    queryKey: documentTemplatesKeys.list(),
    queryFn: () =>
      api
        .get<{ items: ApiDocumentTemplate[] }>("/api/document-templates")
        .then((r) => r.items),
  });
}

export function useApiDocumentTemplateByKey(key: string | null) {
  return useQuery({
    enabled: !!key,
    queryKey: documentTemplatesKeys.byKey(key ?? ""),
    queryFn: () =>
      api.get<ApiDocumentTemplate>(
        `/api/document-templates/by-key/${encodeURIComponent(key ?? "")}`,
      ),
    retry: false,
  });
}

export function useApiVariableCatalog() {
  return useQuery({
    queryKey: documentTemplatesKeys.variables(),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      api
        .get<{ groups: VariableGroup[] }>("/api/document-templates/variables")
        .then((r) => r.groups),
  });
}

export function useSaveDocumentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      api.post<ApiDocumentTemplate>("/api/document-templates", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentTemplatesKeys.all });
    },
  });
}

export function usePatchDocumentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      patch: { name?: string; body?: string };
    }) =>
      api.patch<ApiDocumentTemplate>(
        `/api/document-templates/${args.id}`,
        args.patch,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentTemplatesKeys.all });
    },
  });
}

export function useDeleteDocumentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/document-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentTemplatesKeys.all });
    },
  });
}
