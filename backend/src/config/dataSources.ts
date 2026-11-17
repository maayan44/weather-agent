// External endpoints and ingestion settings, kept in one place.

export const OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

export const FEMA_NRI_COUNTIES_URL =
  "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query";

// The archive trails real time by a few days; later dates come back empty.
export const ARCHIVE_LAG_DAYS = 5;

// The newest days are re-downloaded on every refresh because the archive revises them for a few days.
export const RECENT_REFETCH_DAYS = 10;

export const HTTP_TIMEOUT_MS = 20_000;
export const HTTP_MAX_RETRIES = 3;
