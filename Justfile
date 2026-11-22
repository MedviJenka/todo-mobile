set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]
set dotenv-load := false

eas := "npx eas-cli@latest"

# List recipes
default:
    @just --list

# Install dependencies
install:
    npm install

# Start the dev server with a clean Metro cache
dev:
    npx expo start -c

# Align packages with the Expo SDK (use this instead of `npm audit fix --force`)
fix:
    npx expo install --fix
    npx expo-doctor

# Lint + typecheck
check:
    npx expo lint
    npx tsc --noEmit

# Cloud build. profile: development | preview | production; platform: ios | android | all
build profile="preview" platform="all":
    {{eas}} build --profile {{profile}} --platform {{platform}}

# Preview build for testers (Android APK + iOS ad hoc)
preview platform="ios":
    {{eas}} build --profile preview --platform {{platform}}

# Register an iOS test device for internal (preview/development) builds
device:
    {{eas}} device:create

# Show EAS env vars for an environment
env environment="preview":
    {{eas}} env:list --environment {{environment}}
