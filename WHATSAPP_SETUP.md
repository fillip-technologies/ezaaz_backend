# WhatsApp booking notifications

The server sends WhatsApp messages through Meta's **WhatsApp Cloud API** whenever a booking changes:

| When | Who gets it | Template |
|---|---|---|
| New booking, or admin sets a booking back to *confirmed* | Patient | `ezaaz_appointment_confirmed` |
| New booking | Every number in `WHATSAPP_NOTIFY_NUMBERS` | `ezaaz_new_booking_alert` |
| Admin postpones a booking | Patient | `ezaaz_appointment_rescheduled` |
| Admin cancels a booking | Patient | `ezaaz_appointment_cancelled` |
| Admin adds doctor leave / a holiday over existing bookings | Each affected patient | `ezaaz_doctor_unavailable` |

These messages go out alongside the existing emails. A WhatsApp failure is only logged; it never blocks or fails a booking.
Until `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set, messages are printed to the server console instead.

The template wording lives in `src/modules/appointment/appointment.whatsapp.js`.

## One-time setup

### 1. Create the Meta app
1. Go to <https://business.facebook.com> and make sure the hospital has a **Business portfolio**.
2. Go to <https://developers.facebook.com/apps> → **Create app** → use case **Connect with customers through WhatsApp**, and link it to that business portfolio.
3. In the app, open **WhatsApp → API Setup**. Copy:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`

Meta gives you a free **test number** first. It can only message up to 5 numbers that you add under **To** on that page (each one confirms with a code). That's enough to try everything.

### 2. Use the hospital's real number (for patients)
1. In **WhatsApp → API Setup → Add phone number**, enter the display name (e.g. *Ejaz Hospital*) and the number. Verify it by SMS or call.
   - The number must not be in use on the WhatsApp or WhatsApp Business app. Delete that account first, or use a new number.
2. In **WhatsApp Manager → Payment settings**, add a payment method. Meta charges per template message (utility rate).
3. Complete **Business verification** (Business settings → Security centre). Until then, Meta limits how many people you can message per day.
4. Put the new number's **Phone number ID** in `WHATSAPP_PHONE_NUMBER_ID`.

### 3. Create a permanent access token
The token on the API Setup page expires after 24 hours. Use a System User token instead:

1. Go to <https://business.facebook.com/settings> → **Users → System users → Add**, with role **Admin**.
2. **Assign assets**: the app (full control) and the WhatsApp account (full control).
3. **Generate token**:
   - App: your app
   - Expiration: **Never**
   - Permissions: `whatsapp_business_messaging` and `whatsapp_business_management`
4. Copy the token → `WHATSAPP_ACCESS_TOKEN`.

### 4. Fill in `.env`
```env
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_BUSINESS_ACCOUNT_ID=9876543210
WHATSAPP_API_VERSION=v26.0
WHATSAPP_TEMPLATE_LANG=en
WHATSAPP_DEFAULT_COUNTRY_CODE=91
WHATSAPP_NOTIFY_NUMBERS=9876543210,9123456789
```
Phone numbers can be written as `9876543210`, `09876543210`, `+91 98765 43210` or `919876543210`. A 10-digit number gets `WHATSAPP_DEFAULT_COUNTRY_CODE` added in front.

### 5. Create the message templates
```bash
npm run whatsapp:templates
```
This submits all five templates to Meta as **Utility** templates. Meta usually reviews them within minutes, but it can take up to 24 hours. Run the command again to see each template's status. Templates that already exist are skipped.

### 6. Send a test message
```bash
npm run whatsapp:test -- 9876543210
```
This checks the token, the number and the template statuses, then sends a sample confirmation. With the test number, the recipient must be one of the allowed **To** numbers.

### 7. Restart the server
On startup the log should show:
```
WhatsApp ready: Ejaz Hospital (+91 ...), quality GREEN
```
The log also warns about any template that isn't `APPROVED`.

## Changing a message's wording
Approved templates can't simply be overwritten. Follow these steps:
1. Edit the text in `appointment.whatsapp.js`. Keep the `{{n}}` variables in the same order, or update the matching `...Message()` function below it.
2. In **WhatsApp Manager → Message templates**, delete the old template. A deleted name can't be reused for 30 days, so it can help to change `name` too, e.g. `ezaaz_appointment_confirmed_v2`.
3. Run `npm run whatsapp:templates` again.

## Common errors (shown in the server log)
| Error | Meaning |
|---|---|
| `code 190` | Token invalid or expired. Create a System User token (step 3). |
| `code 131030` | Recipient not in the allowed list. This happens with the test number only (step 1). |
| `code 132001` | Template doesn't exist in that language, or isn't approved yet. Check `WHATSAPP_TEMPLATE_LANG` and run `npm run whatsapp:templates`. |
| `code 132000` | Wrong number of variables. The template in Meta doesn't match `appointment.whatsapp.js`. |
| `code 133010` | The phone number isn't registered with the Cloud API. Finish step 2 in WhatsApp Manager. |
| `code 131042` | Payment problem. Add or fix the payment method. |
| `whatsapp:templates` says a template has too many variables for its length, or Meta rejects it | Add more fixed text around the variables (or split the template) in `appointment.whatsapp.js`, then run it again with a new `name`. `ezaaz_new_booking_alert` is the most likely one to hit this. |

## Good to know
- **"Accepted" is not "delivered".** The server logs an error when Meta refuses a message. But if a patient's number isn't on WhatsApp, Meta accepts the message and it silently doesn't arrive. Delivery receipts need a webhook, which isn't set up yet.
- **Patient consent.** Meta's policy expects patients to agree to receive WhatsApp messages. A short line on the booking form, such as *"Booking updates will be sent to this number on WhatsApp"*, covers this.
- WhatsApp is optional. If it's unconfigured or misconfigured, bookings and emails keep working as before.
