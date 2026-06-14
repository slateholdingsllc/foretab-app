"use client";

import { useEffect, useRef, useState } from "react";
import { searchCities } from "@/lib/dashboard/city-search";

/**
 * City type-ahead input. Queries locations.city (scoped to selectedStates
 * when provided) via the searchCities server action and shows a suggestion
 * dropdown. Calls onChange on every keystroke AND on suggestion selection —
 * parent must read the value at submit time from whatever state it passes down.
 */
export function CityTypeahead({
  value,
  onChange,
  selectedStates,
  disabled,
  inputClassName,
}: {
  value: string;
  onChange: (city: string) => void;
  selectedStates: string[];
  disabled?: boolean;
  inputClassName?: string;
}) {
  const [inputVal, setInputVal] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputVal(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleInput(val: string) {
    setInputVal(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await searchCities(val, selectedStates);
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 300);
  }

  function select(city: string) {
    setInputVal(city);
    onChange(city);
    setSuggestions([]);
    setOpen(false);
  }

  function clear() {
    setInputVal("");
    onChange("");
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="e.g. Denver"
          disabled={disabled}
          autoComplete="off"
          className={
            inputClassName ??
            "h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-7 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          }
        />
        {inputVal && !disabled ? (
          <button
            type="button"
            onClick={clear}
            tabIndex={-1}
            aria-label="Clear city"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-base leading-none text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        ) : null}
      </div>
      {open && suggestions.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md">
          {suggestions.map((city) => (
            <li key={city}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                onClick={() => select(city)}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
