"use client";

import { useEffect } from "react";

export default function CapacitorInit() {
  useEffect(() => {
    // Only execute inside Capacitor on Android/iOS
    if (typeof window !== "undefined" && window.Capacitor) {
      import("@capacitor/app").then(({ App }) => {
        const backButtonPromise = App.addListener("backButton", (data) => {
          if (data.canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        });

        return () => {
          backButtonPromise.then((listener) => {
            listener.remove();
          });
        };
      });
    }
  }, []);

  return null;
}
