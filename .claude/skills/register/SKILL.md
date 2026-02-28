---
name: register
description: Automated account registration in an Android app using temp email and UI automation
user_invocable: true
argument: "<package_name>"
agent: android-reverser
---

# /register — Automated Account Registration

You are automating the registration process for an Android app. This requires UI interaction, email verification, and intelligence about form types.

## Input
- `$ARGUMENTS` — package name (must be installed and running on device)

## Phase 1: UI Reconnaissance

### 1a. Get current state
```bash
python pytools/ui_explorer.py snapshot --output-dir workspace/output
```

Read the snapshot. Determine:
- Is the app on a login screen, registration screen, or splash screen?
- What kind of registration? Email, phone, social login, or combination?
- What fields are visible?

### 1b. Navigate to registration
If not on registration screen:
```bash
# Look for "Sign Up", "Register", "Create Account" buttons
python pytools/ui_explorer.py tap --text "Sign Up"
# or
python pytools/ui_explorer.py tap --text "Register"
# or
python pytools/ui_explorer.py tap --text "Create Account"
# or try XPath
python pytools/ui_explorer.py tap --xpath '//node[contains(@text,"Sign") or contains(@text,"Register") or contains(@text,"Create")]'
```

Take another snapshot to verify navigation succeeded.

### 1c. Map the form
```bash
python pytools/ui_explorer.py dump
```

Identify all input fields by `resource-id`, `text`, or `content-desc`.
Common patterns:
- Email field: resource-id contains `email`, `mail`, `username`
- Password field: `class="android.widget.EditText"` with `password="true"`
- Name fields: `name`, `first_name`, `last_name`, `full_name`
- Phone: `phone`, `mobile`, `tel`

## Phase 2: Identity Creation

### 2a. Email strategy

**Try temp mail first:**
```bash
tema create
```
Save the email address.

**If app blocks temp mail domains**, use Gmail alias:
```bash
tema gmail-alias your.real@gmail.com
```
Note: Gmail aliases forward to your real inbox. You'll need to check manually or set up a filter.

### 2b. Generate credentials
- Email: from tema
- Password: Generate strong password (16+ chars, mixed case, digits, symbols)
- Name: Generate plausible name
- Username: Derive from email prefix

## Phase 3: Form Filling

Fill each field:
```bash
# Tap field → input text
python pytools/ui_explorer.py input --id "email_field" "generated@email.com"
python pytools/ui_explorer.py input --id "password_field" "GeneratedP@ss123!"
python pytools/ui_explorer.py input --id "name_field" "Test User"
```

If fields don't have good resource-ids, use text or XPath:
```bash
python pytools/ui_explorer.py input --text "Email" "generated@email.com"
python pytools/ui_explorer.py tap --xpath '//node[@class="android.widget.EditText"][1]'
```

Handle special cases:
- **Checkbox** (terms): `tap --id "terms_checkbox"` or `tap --text "I agree"`
- **Date picker**: May need multiple taps
- **Dropdown/Spinner**: Tap to open, then tap option
- **CAPTCHA**: Report to user — cannot automate

### Submit
```bash
python pytools/ui_explorer.py tap --text "Sign Up"
# or
python pytools/ui_explorer.py tap --text "Register"
# or
python pytools/ui_explorer.py tap --text "Create"
```

## Phase 4: Email Verification

### 4a. Wait for verification email
```bash
tema wait --timeout 120
```

### 4b. Extract verification link
```bash
tema verify
```

### 4c. Open verification link
```bash
# If it's a deep link / app link
adb shell am start -a android.intent.action.VIEW -d "VERIFICATION_URL"

# If it's a web link that should open in browser
adb shell am start -a android.intent.action.VIEW -d "VERIFICATION_URL" -p com.android.chrome
```

### 4d. Verify success
```bash
python pytools/ui_explorer.py snapshot --output-dir workspace/output
```
Check if the app shows a success state or redirects to main screen.

## Phase 5: Save Credentials

```bash
mkdir -p workspace/credentials
```

Save to `workspace/credentials/$PKG.json`:
```json
{
    "package": "<package_name>",
    "email": "<email>",
    "password": "<password>",
    "username": "<username_if_applicable>",
    "created_at": "<timestamp>",
    "method": "tema|gmail_alias",
    "verified": true|false,
    "notes": "<any relevant notes>"
}
```

## Error Handling

- **CAPTCHA detected**: Report to user, provide screenshot, ask for manual intervention
- **Phone verification required**: Report to user — cannot automate phone OTP
- **Social login only**: Report to user — no email registration available
- **Temp mail blocked**: Fall back to Gmail alias
- **Registration fails**: Take screenshot, read error message, report to user
- **Email never arrives**: Try gmail alias, report timeout

## Report to User
- Registration success/failure
- Credentials saved location
- Any issues encountered
- Screenshot of final state
