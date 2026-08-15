# Storm Alert

A native Android app that monitors weather conditions and alerts you about approaching storms using open weather data sources.

## Features

- **Real-time Weather Monitoring**: Fetches current weather data from Open-Meteo API
- **Storm Detection**: Analyzes weather patterns to detect approaching storms
- **Push Notifications**: Alerts you when storms are approaching your location
- **Weather Radar**: Displays radar imagery from MET Norway and RainViewer
- **Background Service**: Continuously monitors weather conditions in the background
- **Location-based**: Uses your device location for accurate local weather data

## Data Sources

- **Weather Data**: [Open-Meteo](https://open-meteo.com/) - Free, open-source weather API
- **Radar Data**: 
  - [MET Norway](https://api.met.no/weatherapi/radar/2.0/documentation) - Nordic radar composites
  - [RainViewer](https://www.rainviewer.com/api.html) - Global radar data

## Architecture

The app is built using modern Android development practices:

- **UI**: Jetpack Compose with Material Design 3
- **Architecture**: MVVM with Repository pattern
- **Dependency Injection**: Hilt
- **Networking**: Retrofit + OkHttp
- **Location**: Google Play Services Location
- **Background Processing**: Android Work Manager and Foreground Service
- **Kotlin Coroutines**: Asynchronous programming

## Project Structure

```
app/
├── data/
│   ├── model/          # Data models
│   ├── network/        # API services (Retrofit)
│   └── repository/     # Data repositories
├── di/                 # Dependency injection modules
├── location/           # Location management
├── notification/       # Notification handling
├── receiver/           # Broadcast receivers (boot receiver)
├── service/            # Background services
├── ui/
│   ├── navigation/     # Navigation setup
│   ├── radar/          # Radar screen
│   ├── settings/       # Settings screen
│   ├── theme/          # App theming
│   └── weather/        # Weather screen
└── StormAlertApplication.kt
```

## Setup

1. Clone the repository
2. Open in Android Studio
3. Sync Gradle files
4. Build and run on an Android device or emulator

## Permissions

The app requires the following permissions:

- `ACCESS_FINE_LOCATION` - For accurate location-based weather data
- `ACCESS_COARSE_LOCATION` - For general location data
- `POST_NOTIFICATIONS` - To send storm alerts (Android 13+)

## Background Service

The app includes a foreground service that periodically checks weather conditions:

- Default check interval: 15 minutes
- Can be configured in Settings
- Starts automatically on device boot (if enabled in Settings)

## Storm Detection Logic

The app uses multiple factors to detect storm risk:

- Current weather conditions (thunderstorm codes)
- Precipitation probability forecasts
- Wind speed forecasts
- Precipitation intensity
- Time to storm estimation

Alerts are triggered when:

- Storm is currently in progress
- Storm probability exceeds threshold (default 50%)
- High precipitation is forecast within next 6 hours
- High wind speeds are forecast

## API Keys

This app uses only free, open APIs that don't require API keys:

- Open-Meteo: No API key required
- MET Norway: No API key required (with rate limits)
- RainViewer: No API key required

## License

This project is open source and available for personal use.

## Contributing

This is a personal project for learning and demonstration purposes.

## Acknowledgments

- Weather data provided by [Open-Meteo](https://open-meteo.com/)
- Radar data provided by [MET Norway](https://api.met.no/) and [RainViewer](https://www.rainviewer.com/)
- Built with [Jetpack Compose](https://developer.android.com/jetpack/compose)
