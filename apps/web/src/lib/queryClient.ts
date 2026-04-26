import { QueryClient } from "@tanstack/react-query";

/**
 * Единственный QueryClient на приложение.
 *
 * Цель — UI «живой»: если другой пользователь (или ты во второй вкладке)
 * что-то изменил, у меня данные обновятся сами максимум за 30 секунд,
 * без нажатия F5. При этом без overengineering — никаких WebSocket'ов.
 *
 * Стратегия:
 *   • staleTime 10s — пока юзер активно тыкает в одну страницу,
 *     запросы из кеша мгновенные, лишние сетевые роунды не делаются.
 *   • refetchInterval 30s — раз в 30 секунд тихо тянем свежее в фоне.
 *     Видим изменения других пользователей.
 *   • refetchOnWindowFocus — переключился в другую вкладку и вернулся
 *     → проверяем не обновилось ли. Это «дешёвая» версия live-обновления.
 *   • refetchOnReconnect — после восстановления интернета сразу
 *     синхронизируемся, не ждём интервала.
 *   • refetchIntervalInBackground: false — если CRM в фоновой вкладке,
 *     polling приостанавливается, не жжём батарею и не нагружаем API.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
