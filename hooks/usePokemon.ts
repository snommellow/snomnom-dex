"use client";

import { useState, useEffect } from "react";
import { fetchPokemon, type Pokemon } from "@/lib/pokeapi";

interface UsePokemonResult {
  pokemon: Pokemon | null;
  loading: boolean;
  error: string | null;
}

export function usePokemon(nameOrId: string | number): UsePokemonResult {
  const [pokemon, setPokemon] = useState<Pokemon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPokemon(nameOrId)
      .then((data) => {
        if (!cancelled) setPokemon(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [nameOrId]);

  return { pokemon, loading, error };
}
