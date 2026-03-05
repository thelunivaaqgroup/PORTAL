import { useState, useCallback } from "react";
import type { DemoItem } from "../types";

let nextId = 6;

const seed: DemoItem[] = [
  { id: "1", name: "Alpha Widget", description: "First demo item", status: "active", createdAt: "2025-01-10" },
  { id: "2", name: "Beta Service", description: "Second demo item", status: "inactive", createdAt: "2025-02-14" },
  { id: "3", name: "Gamma Module", description: "Third demo item", status: "active", createdAt: "2025-03-01" },
  { id: "4", name: "Delta Report", description: "Fourth demo item", status: "active", createdAt: "2025-04-22" },
  { id: "5", name: "Epsilon Task", description: "Fifth demo item", status: "inactive", createdAt: "2025-05-15" },
];

export function useDemoData() {
  const [items, setItems] = useState<DemoItem[]>(seed);

  const addItem = useCallback((name: string, description: string) => {
    const item: DemoItem = {
      id: String(nextId++),
      name,
      description,
      status: "active",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setItems((prev) => [item, ...prev]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return { items, addItem, removeItem };
}
