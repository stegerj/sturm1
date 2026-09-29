# Storm Alert

Advanced storm forecasting, live radar analysis, and multi-radius risk assessment — a
mobile-first web app (React + TypeScript + Vite) wrapped as a native Android app with Capacitor.

## Features

- **Real-time weather**: current conditions, hourly/daily forecasts, wind, pressure, and
  multi-radius storm risk scoring (20 km / 100 km rings) from Open-Meteo
- **Live radar & satellite**: DPC/ARPA national radar (VMI, SRI, dBZ, rain accumulations),
  EUMETSAT/MTG satellite layers, and RainViewer global radar — all on one Leaflet map
- **Radar playback (Italy)**: scrub and play the last 5 hours of DPC radar frames via the
  bundled GeoTIFF→PNG proxy (`server/index.mjs`), with per-tile Web-Mercator reprojection
- **Proximity intelligence**: rain-cell detection and trajectory (collision course, ETA),
  storm approach alerts with sound, minute-by-minute precipitation, marine/tide data,
  air quality, and MTG lightning/satellite diagnostics
- **Localization**: multi-language UI (`src/utils/i18n.ts`)

## Tech Stack

- **UI**: React 18, TypeScript, Tailwind CSS, Leaflet, Recharts, Framer Motion, Lucide icons
- **Build**: Vite 6 (`vite.config.ts`)
- **Android shell**: Capacitor 8 (`capacitor.config.ts`, `android/`)
- **Backend companion**: `server/index.mjs` — small Node service that fetches DPC's
  CORS-blocked historical radar GeoTIFFs, colorizes them, and serves PNG tiles/frames

## Data Sources — no API keys required

Every data source is keyless. There is **no API key to configure anywhere** in this app:

- [Open-Meteo](https://open-meteo.com/) — weather, marine, air quality, geocoding
- [RainViewer](https://www.rainviewer.com/api.html) — global radar composites
- [DPC / Protezione Civile](https://radar.protezionecivile.it/) — national radar WMS +
  historical GeoTIFFs (via the proxy)
- [EUMETSAT EUMETView](https://view.eumetsat.int/) — satellite WMS layers
- [Esri Gray Canvas / Street Map](https://www.arcgis.com/) — keyless base maps
  (CARTO's free tile CDN was removed: it now serves "API key required" watermark tiles)

## Setup

```bash
npm install
npm run dev        # dev server on 0.0.0.0:${PORT:-3000}
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm run lint       # tsc --noEmit
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_DPC_PROXY_URL` | No | Explicit base URL of the DPC radar playback proxy. If unset, the app probes `window.location.origin` and then `https://sturm1.onrender.com`. |

### DPC radar playback proxy

Historical DPC frames are only published as raw GeoTIFFs behind a CORS-blocked S3 bucket,
so playback needs the companion Node service:

```bash
npm install
node server/index.mjs   # serves /healthz and /dpc/* on PORT (default 10000)
```

It can be deployed as any Node web service (e.g. Render — see `render.yaml`, health
check `/healthz`). Endpoints: `/dpc/frames`, `/dpc/tile`, `/dpc/point`, `/dpc/frame`,
`/dpc/cells`, `/dpc/alerts/latest`. Products: VMI, SRI, SRT1, CUM3–24, IR_108, VIL, ETM,
POH, CAPPI_1–10.

## Android (Capacitor)

```bash
npm run build:android   # build web assets + cap sync android
```

Then open `android/` in Android Studio. The app requests `INTERNET`,
`ACCESS_COARSE_LOCATION`, and `ACCESS_FINE_LOCATION`.

## Project Structure

```
src/
├── components/        # WeatherView, RadarView, SettingsView, alert & data cards
├── services/          # weatherApi, dpcAlerts, soundAlertService, cloudTrajectoryAnalyzer
├── utils/             # i18n, weatherUtils
└── types.ts           # shared data models
server/index.mjs       # DPC radar playback proxy (Node)
android/               # Capacitor Android project
```

## License

This project is open source and available for personal use.

## Acknowledgments

- Weather data: [Open-Meteo](https://open-meteo.com/)
- Radar & alerts: [DPC / Protezione Civile](https://radar.protezionecivile.it/), [RainViewer](https://www.rainviewer.com/)
- Satellite: [EUMETSAT](https://www.eumetsat.int/)
- Base maps: [Esri](https://www.arcgis.com/), [OpenStreetMap](https://www.openstreetmap.org/) contributors
