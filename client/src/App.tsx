import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AppLoader } from "@/components/ui/app-loader";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";

/**
 * GitHub Pages serves this app from /elegant-joins/, so the router needs that prefix or
 * `path="/"` never matches and every visitor gets the 404 screen — which is exactly what
 * the first deploy did. `BASE_URL` is "/elegant-joins/" in a Pages build and "/" in dev;
 * wouter wants it without the trailing slash, and an empty string at the root.
 */
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

function Router() {
  return (
    <WouterRouter base={routerBase}>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [showLoader, setShowLoader] = useState(true);

  // Check if this is the first load of the session
  useEffect(() => {
    const hasLoadedThisSession = sessionStorage.getItem('elegantjoins_session_loaded');
    if (hasLoadedThisSession) {
      setIsLoading(false);
      setShowLoader(false);
    }
  }, []);

  const handleLoadComplete = () => {
    sessionStorage.setItem('elegantjoins_session_loaded', 'true');
    setIsLoading(false);
    // Small delay before hiding loader to ensure smooth transition
    setTimeout(() => setShowLoader(false), 100);
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          {showLoader && isLoading && <AppLoader onComplete={handleLoadComplete} />}
          {!isLoading && <Router />}
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
