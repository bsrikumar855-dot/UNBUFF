/** Who to write to. Set VITE_CONTACT_EMAIL at build time; until then the legal pages say it still has to be filled in. */
export const CONTACT_EMAIL: string | null =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || null;
