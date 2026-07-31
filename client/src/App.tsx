import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AppLoader } from "@/components/ui/app-loader";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
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
