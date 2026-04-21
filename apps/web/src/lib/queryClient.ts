import { QueryClient } from "@tanstack/react-query";

/**
 * Единственный QueryClient на приложение.
 * staleTime побольше — у нас немного пользователей и данные не «тикают» в секундах;
 * лучше перезапрашивать реже, быстрее рендерить.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
