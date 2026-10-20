/** Compile-time identity belongs to these loaded client inputs, never the live server tree. */
export const CLIENT_BUILD_ID: string =
  import.meta.env.VITE_CLIENT_BUILD_ID || "development-unidentified";
