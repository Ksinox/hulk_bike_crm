import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { ApplicationForm } from "./public/ApplicationForm";
import { queryClient } from "./lib/queryClient";
import "./index.css";

// Публичная анкета /apply — открывается без авторизации в обычном
// браузере (Electron грузится через file://, там pathname пустой).
// Делаем разделение ДО рендера App, чтобы не грузить useMe/Sidebar
// и прочую CRM-логику.
const isPublicApplyRoute =
  typeof window !== "undefined" &&
  window.location.pathname.replace(/\/$/, "").endsWith("/apply");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isPublicApplyRoute ? <ApplicationForm /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
);
