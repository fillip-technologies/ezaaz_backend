# WhatsApp: notifications, inbox and patient reports

The server talks to patients through Meta's **WhatsApp Cloud API**. Patients don't need an account or a login anywhere:
everything reaches them in their own WhatsApp app, and they answer there.

## Automatic messages

| When | Who gets it | Template |
|---|---|---|
| New booking, or admin sets a booking back to *confirmed* | Patient | `ezaaz_appointment_confirmed` |
| New booking | Every number in `WHATSAPP_NOTIFY_NUMBERS` | `ezaaz_new_booking_alert` |
| Admin postpones a booking | Patient (+ staff) | `ezaaz_appointment_rescheduled` (+ `ezaaz_booking_change_alert`) |
| Admin cancels a booking | Patient (+ staff) | `ezaaz_appointment_cancelled` (+ `ezaaz_booking_change_alert`) |
| Admin adds doctor leave / a holiday over existing bookings | Each affected patient | `ezaaz_doctor_unavailable` |
| Admin deletes that leave / holiday again | Each affected patient | `ezaaz_appointment_back_on` |
| Evening before the appointment (from `REMINDER_HOUR`, until 9 PM IST) | Patient | `ezaaz_appointment_reminder` with buttons **I'll be there** / **Need to change** |
| Day before the "next visit" date set when cancelling | Patient | `ezaaz_next_visit_reminder` |
| Admin marks a booking **No-show** | Patient | `ezaaz_missed_appointment` |
| Admin marks a booking **Completed** | Patient | `ezaaz_visit_thanks` (adds `FEEDBACK_URL` if set) |
| Website enquiry form (contact, home, specialty, doctors pages) | Visitor + staff | `ezaaz_enquiry_received` + `ezaaz_new_enquiry_alert` |
| Staff send a report (Patients page or inbox) | Patient | `ezaaz_report_ready` (PDF attached) or `ezaaz_report_ready_notice` |
| Staff start or reopen a chat from the inbox | Patient | `ezaaz_staff_follow_up` |

Patients who booked on the Hindi site get the Hindi version of each template (once Meta approves it; until then, English).
A WhatsApp failure is only logged; it never blocks or fails a booking or a form.
Until `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set, messages are printed to the server console
and saved in the admin inbox as *Not sent*.

Template wording lives next to the feature that sends it:
`src/modules/appointment/appointment.whatsapp.js`, `src/modules/contact/contact.whatsapp.js`,
`src/modules/patient/patient.whatsapp.js` and `src/modules/whatsapp/inbox.templates.js`.

## When patients reply (needs the webhook, step 8)
- Every message in or out appears in **Admin → WhatsApp**, a WhatsApp Web-style inbox with live updates,
  delivery ticks (✓ sent, ✓✓ delivered, blue ✓✓ read) and a **Call** button for each patient.
- **Reminder buttons:** *I'll be there* marks the booking as confirmed by the patient. *Need to change* flags the chat
  and alerts the staff numbers, so reception can call and postpone it.
- **First message from a patient:** they get a menu (Book appointment, My appointment, My reports, Talk to reception,
  Emergency). *My reports* and *Talk to reception* flag the chat for staff. Turn it off with `WHATSAPP_AUTO_REPLY=false`.
- **STOP / START:** STOP stops all messages to that number until the patient sends START.
- **The 24-hour rule:** staff can type freely only within 24 hours of the patient's last message. After that, the inbox
  switches to an approved template.

## Patient records and reports
- Each booking creates or updates a **patient record** (Admin → Patients) with a patient ID (`EJZ-P-…`). The same number
  with a different name is a separate patient (family members).
- Staff add **visits** (complaint, vitals, diagnosis, prescription, advice, follow-up) and upload **reports** (PDF, JPG or PNG).
- Reports are stored in `PRIVATE_UPLOAD_DIR`, never in the public `uploads` folder. Only signed-in admins can open them.
- **Send on WhatsApp** needs the patient's consent (the *Reports on WhatsApp* switch) and asks staff to confirm the
  patient name and number first. It then picks the safest way the chat allows:
  1. Chat open (someone wrote from the number in the last 24 h): the file is sent directly.
  2. Number checked with the patient at the desk (*Number checked at desk*): template with the PDF attached.
  3. Otherwise: a "your report is ready" message with a **Send my report** button. The file goes out only when someone
     taps it on that phone.

  None of these can prove who holds the phone. If a patient typed a wrong number, whoever has that number can receive
  the report. That's why staff confirm the number before sending, and should check it with the patient at the desk.
- **WhatsApp messages to this number** (patient page): switching it off works like the patient replying STOP. Nothing is
  sent to that number, for every patient on it, until it's switched back on or the patient sends START.

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
Set `WHATSAPP_APP_ID` first (App dashboard → App settings → Basic): the report template has a PDF header, and Meta needs
a sample file uploaded through the app.
```bash
npm run whatsapp:templates
```
This submits every template (English, plus Hindi where there is a Hindi text) to Meta as **Utility** templates. Meta usually reviews them within minutes, but it can take up to 24 hours. Run the command again to see each template's status. Templates that already exist are skipped.

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

### 8. Connect the webhook (incoming messages, buttons, delivery ticks)
1. In `.env`, set `WHATSAPP_APP_SECRET` (App dashboard → App settings → Basic → App secret) and
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (any long random string). Restart the server.
2. In the app: **WhatsApp → Configuration → Webhook → Edit**.
   - Callback URL: `https://<your API domain>/api/whatsapp/webhook`
   - Verify token: the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Click **Verify and save**, then under **Webhook fields** subscribe to **messages**.
3. Send "Hi" to the hospital number from your phone. It should appear in Admin → WhatsApp within a second.

The webhook needs a public HTTPS address. To try it on a laptop, use a tunnel (e.g. `cloudflared tunnel --url http://localhost:5000`),
or simulate an incoming message without Meta:
```bash
npm run whatsapp:webhook-test -- 9876543210 "Hi, is my report ready?"
```

### 9. Link old bookings to patient records (once)
```bash
npm run backfill:patients
```
Creates patient records for bookings made before this feature existed. Safe to run again.

### 10. Website button
Set `VITE_WHATSAPP_NUMBER=91XXXXXXXXXX` (the Cloud API number, digits only) in the client's `.env`. The floating
WhatsApp button, the doctor pages and the emergency page then open a chat with a message about the page the visitor is on,
and that chat lands in the admin inbox.

> **Which number?** A number connected to the Cloud API can't also be used in the WhatsApp Business phone app,
> unless WhatsApp Manager offers "coexistence" for it. Either use a new number for the API, or move the existing
> number and use Admin → WhatsApp as the hospital's WhatsApp.

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
- **"Accepted" is not "delivered".** With the webhook connected (step 8), each message in the inbox shows whether it was
  delivered and read, and a red ⚠ with Meta's reason when it wasn't (e.g. the number isn't on WhatsApp).
- **Patient consent.** The booking form tells patients that updates come on WhatsApp and that STOP opts out.
  Reports need explicit consent, recorded per patient with the *Reports on WhatsApp* switch.
- **Health data.** Reports are personal health data (India's DPDP Act 2023). Keep `PRIVATE_UPLOAD_DIR` on a backed-up disk
  that only the server can read, and only switch on report consent when the patient has agreed.
- WhatsApp is optional. If it's unconfigured or misconfigured, bookings and emails keep working as before.
