# Intersport × Footspot — Integration Overview

> Document for client review — Intersport & Footspot teams  
> Purpose: validate the full integration process before development begins

---

## What This Integration Does

When a soccer club buys equipment on Intersport and has a Footspot account, the purchase is **automatically synchronized** into their Footspot inventory — no manual entry needed. Equipment appears in Footspot the moment it is delivered, ready for the club to assign to its members.

Clubs that buy on Intersport and manage their squad on Footspot get a complete flow: from online purchase to per-member equipment assignment, with full traceability.

---

## Two Ways to Activate the Integration

| | Flow 1 | Flow 2 |
|---|---|---|
| **Club situation** | Already on Footspot | Not yet on Footspot |
| **Who initiates** | Club admin (from Footspot) | Club director (from Intersport) |
| **Footspot PDG involved** | No | Yes — creates the club |

---

## Flow 1 — Club Already on Footspot

```mermaid
sequenceDiagram
  actor Club as Club Admin
  participant FSP as Footspot
  participant ISP as Intersport
  participant ADM as Intersport Admin

  Club->>FSP: Clicks "Connect Intersport"
  FSP->>ISP: Sends integration request
  ISP->>ADM: Notification — new request
  ADM->>ISP: Reviews and accepts
  ISP-->>Club: Email — pairing code (valid 15 min)
  Note over Club: Creates Intersport account<br/>if not already done
  Club->>ISP: Pastes pairing code in profile
  ISP->>FSP: Validates code
  FSP-->>ISP: Link confirmed
  Note over ISP,FSP: ✅ Integration active — both platforms linked
```

---

## Flow 2 — Club Does Not Have Footspot

```mermaid
sequenceDiagram
  actor Director as Club Director
  participant ISP as Intersport
  participant ADM as Intersport Admin
  participant FSP as Footspot
  actor PDG as Footspot PDG

  Director->>ISP: Requests "Join Footspot" from account
  ISP->>ADM: Notification — Footspot request
  ADM->>ISP: Reviews and accepts
  ISP->>FSP: Forwards request with club details
  FSP->>PDG: Push notification on Flutter app
  PDG->>FSP: Reviews and accepts
  FSP->>FSP: Creates club account on Footspot
  FSP-->>ISP: Link confirmed
  PDG-->>Director: Contacts club director to onboard them
  Note over ISP,FSP: ✅ Integration active — both platforms linked
```

---

## Purchase → Delivery → Footspot Sync

*This flow is identical for both Flow 1 and Flow 2 clubs once the integration is active.*

```mermaid
sequenceDiagram
  actor Club as Club Director
  participant ISP as Intersport
  participant PAY as Payment
  participant COL as Colissimo
  participant ADM as Intersport Admin
  participant FSP as Footspot

  rect rgb(235, 245, 255)
    Note over Club,PAY: 💳 Purchase & Payment
    Club->>ISP: Places order (jerseys, equipment...)
    Club->>PAY: Pays (card, PayPal or bank transfer)
    PAY-->>ISP: Payment confirmed
    ISP->>ISP: Order status → PAID
  end

  rect rgb(235, 255, 235)
    Note over ISP,COL: 📦 Shipping Label
    ISP->>COL: Generates shipping label automatically
    COL-->>ISP: Returns label PDF + tracking number
    ISP->>ISP: Label stored — ready to print
    Note over ADM: Prepares package<br/>(personalisation, packing)
    ADM->>ISP: Confirms package handed to La Poste
    ISP->>ISP: Order status → SHIPPED
    ISP-->>Club: Email with tracking number
  end

  rect rgb(255, 248, 220)
    Note over COL,ISP: 🚚 Delivery Tracking
    COL->>COL: Package in transit...
    loop Every 2 hours
      ISP->>COL: Checks delivery status
    end
    COL-->>ISP: Status — DELIVERED
    ISP->>ISP: Order status → DELIVERED
  end

  rect rgb(245, 235, 255)
    Note over ISP,FSP: 🔄 Automatic Footspot Sync
    ISP->>FSP: Sends delivery event (API)
    FSP->>FSP: Creates equipment stock in club inventory
    FSP-->>Club: Notification — equipment ready to assign
    Note over Club: Club confirms physical receipt<br/>Assigns equipment to members
  end
```

---

## What Each Side Handles

### Intersport
- Order management and payment processing
- Automatic Colissimo label generation after payment
- Shipping confirmation and customer tracking emails
- Automatic push to Footspot on delivery

### Footspot
- Receives the delivery event and creates the equipment stock automatically
- Club admin confirms physical receipt and activates the items
- Club assigns equipment to members using existing Footspot flows
- Full traceability: which item, which order, which season, assigned to whom

---

## Equipment Lifecycle in Footspot After Sync

```mermaid
flowchart LR
  A([Order placed\non Intersport]) --> B[Order recorded\nin Footspot]
  B --> C[Order shipped\nstatus updated]
  C --> D[Order delivered\nstock created automatically]
  D --> E[Club confirms\nphysical receipt]
  E --> F[Equipment available\nin club inventory]
  F --> G[Club admin assigns\nto members]
  G --> H([Equipment tracked\nper member ✅])

  style A fill:#dbeafe,stroke:#3b82f6
  style D fill:#dcfce7,stroke:#16a34a
  style H fill:#f3e8ff,stroke:#9333ea
```

---

## Refund Flow

If an order is refunded on Intersport, Footspot is notified automatically:

```mermaid
flowchart TD
  A[Refund processed\non Intersport] --> B[Footspot notified\nvia API]
  B --> C{Equipment already\nassigned to members?}
  C -- No --> D[Stock removed\nfrom inventory]
  C -- Yes --> E[Equipment auto-unassigned\nfrom members]
  E --> F[Club admin notified\nby email with list\nof affected members]
  F --> D

  style A fill:#fee2e2,stroke:#ef4444
  style D fill:#fef3c7,stroke:#f59e0b
```

---

## Security at a Glance

- Every API call between Intersport and Footspot is **signed** — no call can be forged
- Each club has its own **unique access token** — revoking one club's access does not affect others
- Duplicate event protection — the same order can never be created twice in Footspot
- All sensitive keys are stored encrypted — never exposed in the app or database

---

## Key Benefits per Stakeholder

| Stakeholder | Benefit |
|---|---|
| **Club director** | Zero manual entry — equipment appears in Footspot automatically after delivery |
| **Club admin (Footspot)** | Full purchase history and equipment traceability without leaving Footspot |
| **Intersport** | Stronger club loyalty, commission on Footspot subscriptions, full sales analytics |
| **Footspot** | New club acquisition channel, richer data on club purchasing behaviour |
| **Intersport warehouse** | Label printed directly from the back-office — no need to log into Colissimo website |
