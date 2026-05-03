import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthGate } from "@/app/AuthGate";
import { router } from "@/app/router";
import { AuthProvider } from "@/lib/auth";
import { appQueryClient } from "@/lib/queryClient";

export default function App() {
  return (
    <QueryClientProvider client={appQueryClient}>
      <AuthProvider>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
