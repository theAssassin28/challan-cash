# Challan Cash

Get paid for the delivery, not the paperwork.

A working prototype of a Dispatches feature in the Razorpay app for small manufacturers. The driver photographs the stamped delivery challan at the buyer's dock from a one-time WhatsApp link, AI reads the stamp and any pen note, the proof goes to the buyer's accounts team the same day, and the owner can take an advance from a partner lender against the delivery.

The product note is in `docs/product-note.pdf`. The original single-file HTML prototype is in `docs/original-prototype.html`. This repo turns that prototype into an end-to-end app with the same screens.

## What runs

- **Owner app (Prakash)**: lock screen, home, Dispatches, one dispatch, check challan, advance offer, fingerprint confirm, record.
- **Driver (Ramesh)**: WhatsApp chat and the one-time capture page. The capture page also works on a real phone at `/c/<token>`, with the real camera or a gallery upload. Each link works once.
- **Server**: every step is an API call. State is stored in SQLite, one workspace per browser.
  - Dispatch state machine: transit, asked, photo, proof, await, adv, paid
  - One-time capture links, photo upload (multipart), QR code for the link
  - Challan reader: scripted readings by default, Claude reads real photos when `ANTHROPIC_API_KEY` is set
  - Proof email to the buyer's accounts (stored in an outbox, not actually sent)
  - Credit note posted by the clerk, buyer GRN reply, new-buyer confirmation
  - Lender: offer, key fact statement numbers, limit check, two-part disbursal (50% now, rest on QC), repayment from the buyer's payment
  - Record per dispatch is append-only. SQLite triggers reject updates and deletes
  - Live updates and phone notifications over server-sent events
- **Simulated outside parties**: Anil (driver who replies by himself), Meena (clerk), the buyer's accounts team, the lender and the bank. They run on the server with short delays.

Three cases, same as the original: Endurance (main flow), Sundaram (new buyer, owner takes the photo, advance capped at 50%), Pune Precision (challan stuck with the driver for 4 days).

## Run it

Needs Node 22.13 or later.

```
npm install
npm run dev
```

Open http://localhost:5173. The API runs on port 8787 and Vite proxies `/api` to it.

To try the driver page on a real phone, ask the driver for the photo, then tap "Open the driver's link on a real phone" on the dispatch screen and scan the QR code. The phone must reach your machine (same network, use the Network URL Vite prints).

Production build:

```
npm run build
npm start          # serves the app and API on http://localhost:8787
```

Docker:

```
docker build -t challan-cash .
docker run -p 8787:8787 -v challan-data:/data challan-cash
```

Settings (see `.env.example`):

| Variable | Use |
| --- | --- |
| `ANTHROPIC_API_KEY` | Optional. Real photos are read by Claude. Without it, the scripted reader is used |
| `PUBLIC_URL` | Base URL used in the driver's link when running behind a proxy |
| `PORT` | Default 8787 |
| `DATA_DIR` | Where the SQLite file and uploads go. Default `./data` |

## Checks

```
npm run typecheck
npm test
```

Tests cover the money rules and the full API flow for all three cases, including the one-time link and the append-only record.

## Layout

```
shared/   domain types and money rules (advance caps, charges, APR), used by both sides
server/   Express API, SQLite store, simulated parties, challan reader
web/      React app. styles.css is the original prototype's CSS, unchanged
docs/     product note and the original HTML prototype
```

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/state` | Full snapshot for this workspace |
| GET | `/api/events` | Server-sent events: `state`, `notice` |
| POST | `/api/demo/reset` | New workspace. Body `{ path: 'a'|'b'|'c', unlocked }` |
| POST | `/api/dispatches/:k/request-photo` | Creates a one-time link and sends it on WhatsApp |
| POST | `/api/dispatches/:k/photo` | Owner's own photo. Multipart `photo`, or empty for the sample shot |
| GET | `/api/dispatches/:k/readings` | What the reader found |
| PATCH | `/api/dispatches/:k/received` | Change the received quantity before sending |
| POST | `/api/dispatches/:k/proof` | Email the proof to the buyer's accounts |
| GET | `/api/dispatches/:k/email` | The email as sent, or a preview |
| GET | `/api/dispatches/:k/offer?amount=` | Advance offer and charges |
| POST | `/api/dispatches/:k/advance` | Take the advance. Body `{ amount }` |
| GET | `/api/dispatches/:k/record` | Printable record |
| GET | `/api/capture/:token` | Driver page data. No login |
| POST | `/api/capture/:token/photo` | Driver's photo. Works once |
| POST | `/api/sim/:k/booked`, `/confirm`, `/pay` | Buyer replies with GRN, confirms (new buyer), pays on the due date |

## Not real

Sample data, a simulated clock, and no real money, email, WhatsApp or lender. The fingerprint step is a tap. Prakash is a composite persona from merchant interviews.
