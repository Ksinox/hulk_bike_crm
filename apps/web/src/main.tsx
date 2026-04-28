import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { ApplicationForm } from "./public/ApplicationForm";
import { queryClient } from "./lib/queryClient";
import "./index.css";

// Публичная анкета — открывается без авторизации в обычном браузере.
// Используем hash-route (#/apply), а не path: vite собирает бандл с
// base: "./" (для Electron), поэтому на любом не-корневом pathname
// скрипты грузятся с относительного пути и 404'ят. Hash оставляет
// pathname = "/", скрипты подтягиваются корректно.
//
// Поддерживаем оба варианта на случай если кто-то откроет /apply
// руками — в production nginx делает SPA-fallback на index.html.
const isPublicApplyRoute =
  typeof window !== "undefined" &&
  (window.location.hash === "#/apply" ||
    window.location.hash.startsWith("#/apply?") ||
    window.location.pathname.replace(/\/$/, "").endsWith("/apply"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isPublicApplyRoute ? <ApplicationForm /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
);
