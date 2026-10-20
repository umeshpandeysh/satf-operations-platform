"use client";

import React, { createContext, useContext, useSyncExternalStore, useCallback } from "react";
import { SupportedLanguage, getTranslation } from "./translations";

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string) => string;
}

const STORAGE_KEY = "satf_preferred_language";

function subscribeLanguage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("satf-language-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("satf-language-change", callback);
  };
}

function getLanguageSnapshot(): SupportedLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ja") return saved;
  } catch {
    // Ignore localStorage access failures
  }
  return "en";
}

function getServerLanguageSnapshot(): SupportedLanguage {
  return "en";
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key: string) => getTranslation(key, "en"),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguageSnapshot,
    getServerLanguageSnapshot
  );

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      window.dispatchEvent(new Event("satf-language-change"));
    } catch {
      // Ignore localStorage access failures
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      return getTranslation(key, language);
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useTranslation() {
  const { t, language } = useContext(LanguageContext);
  return { t, language };
}
