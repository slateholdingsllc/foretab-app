"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "foretab-theme";

/**
 * Three-state theme toggle: Light · Dark · System.
 *
 * Placement: top-bar, just left of the Account link (PR 3 wires this).
 *
 * Persistence:
 *   localStorage["foretab-theme"] = "light" | "dark"  → explicit choice
 *   localStorage["foretab-theme"] absent              → "system" mode,
 *                                                       reads prefers-color-scheme
 *
 * The FOUC-safe script in app/layout.tsx applies the chosen theme
 * before React hydrates. This component's job is just to render the
 * current state and write back changes. When in "system" mode, it
 * subscribes to the OS theme media query so live changes are reflected
 * without a refresh.
 *
 * V2 (deferred): sync the chosen theme to customers.preferred_theme
 * via a server action so the preference follows the user across devices.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Default "dark" matches the FOUC script's final fallback. Real state
  // is read from storage in the mount effect — but starting from "dark"
  // avoids a flicker where the toggle's active pip jumps on hydration.
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync local state from storage on mount.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setTheme(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  // When mode is "system", react to live OS theme changes.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.theme = mq.matches ? "light" : "dark";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const choose = useCallback((next: Theme) => {
    setTheme(next);
    if (next === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
      const sys = window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
      document.documentElement.dataset.theme = sys;
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.dataset.theme = next;
    }
  }, []);

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-input bg-secondary p-0.5",
        className,
      )}
    >
      <ToggleButton
        active={theme === "light"}
        onClick={() => choose("light")}
        label="Light theme"
      >
        <Sun className="size-3.5" />
      </ToggleButton>
      <ToggleButton
        active={theme === "dark"}
        onClick={() => choose("dark")}
        label="Dark theme"
      >
        <Moon className="size-3.5" />
      </ToggleButton>
      <ToggleButton
        active={theme === "system"}
        onClick={() => choose("system")}
        label="System theme"
      >
        <Monitor className="size-3.5" />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-card text-card-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
