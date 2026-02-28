---
name: find-api
description: Discover, document, and map all API endpoints of an Android application
user_invocable: true
argument: "<package_name_or_apk_path>"
agent: android-reverser
---

# /find-api — API Discovery & Documentation

You are mapping the complete API surface of an Android application. Goal: a developer could rebuild the API client from your output.

## Input
- `$ARGUMENTS` — package name or APK path

## Phase 1: Static Discovery

### 1a. Decompile (if not already done)
```bash
jadx -d workspace/output/$PKG --deobf $APK
```

### 1b. Quick Automated Scan
```bash
# apkleaks finds URLs, endpoints, API keys in seconds
apkleaks -f $APK --json -o workspace/reports/$PKG-endpoints.json
```
Review output — often catches endpoints that manual grep misses (string concatenation, BuildConfig fields).

### 1c. Retrofit Interfaces
Search for annotated interfaces — this is the goldmine:
```
grep -rn "@GET\|@POST\|@PUT\|@DELETE\|@PATCH\|@HEAD\|@HTTP" workspace/output/$PKG/
```

For each interface found:
- Map method → HTTP verb + path
- Map `@Query`, `@Field`, `@Body`, `@Path` parameters
- Map return type (usually `Call<Model>` or `Observable<Model>`)
- Find the model classes for request/response

### 1c. Base URL Discovery
```
grep -rn 'baseUrl\|BASE_URL\|API_URL\|SERVER_URL\|ENDPOINT\|api_host' workspace/output/$PKG/
grep -rn 'https\?://[a-zA-Z0-9.-]*api[a-zA-Z0-9.-]*' workspace/output/$PKG/
```

### 1d. Non-Retrofit HTTP
Look for direct HTTP usage:
```
grep -rn 'HttpURLConnection\|OkHttpClient\|Volley\|WebView.*loadUrl' workspace/output/$PKG/
```

### 1e. WebSocket / Real-time
```
grep -rn 'WebSocket\|ws://\|wss://\|Socket\.IO\|firebase' workspace/output/$PKG/
```

### 1f. GraphQL / gRPC
```
grep -rn 'graphql\|/graphql\|query.*{.*}\|ManagedChannel\|\.grpc\.' workspace/output/$PKG/
```

## Phase 2: Handle Obfuscation

If endpoint strings are obfuscated:
- Look for string constants with URL patterns (`/api/`, `/v1/`, `/v2/`)
- Look for JSON field names (they reveal data models)
- Check `strings.xml` and other resource files for URLs
- Check `res/raw/` and `assets/` for config files

## Phase 3: Dynamic Discovery (if device available)

If static analysis is insufficient or obfuscated:

```bash
# Option A: Frida API tracer (captures Retrofit calls)
frida -U -f $PKG -l workspace/frida-scripts/api-tracer.js

# Option B: Full HTTP logging (captures all traffic)
frida -U -f $PKG -l workspace/frida-scripts/ssl-bypass.js -l workspace/frida-scripts/http-logger.js

# Navigate the app to trigger API calls
python pytools/ui_explorer.py snapshot
# Walk through key screens
```

Save traffic to `workspace/traffic/$PKG-traffic.json`

## Phase 4: Correlation

Build the complete picture:
- **UI Screen → Activity → API Call**: Which screen triggers which endpoint?
- **Auth Flow**: Login endpoint → token → how token is passed → refresh flow
- **Data Models**: Request/response JSON structures

## Phase 5: Output

### API Documentation (Markdown)
Save to `workspace/reports/$PKG-api.md`:

```markdown
# API Documentation: <App Name>

## Base URLs
- Production: https://api.example.com
- CDN: https://cdn.example.com

## Authentication
- Type: Bearer JWT / API Key / OAuth2
- Login: POST /auth/login → { access_token, refresh_token }
- Token passed via: Authorization header / cookie / custom header

## Endpoints

### Auth
| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | /auth/login | No | { email, password } | { token, user } |
| POST | /auth/refresh | Bearer | { refresh_token } | { token } |

### Users
| Method | Path | Auth | Params | Response |
...
```

### Postman Collection
If traffic was captured:
```bash
python pytools/traffic_to_collection.py frida workspace/traffic/$PKG-traffic.json --name "$PKG API" --output workspace/collections/$PKG.json
```
