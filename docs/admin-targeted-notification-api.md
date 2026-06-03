# Admin — Send notification to one user or partner



Send a push notification (FCM) to a **single** customer or **single** salon/partner. Always writes in-app notification logs for that recipient. Push delivery is best-effort (skipped or retried without failing the whole request when FCM tokens are missing or invalid).



## Endpoint



| Method | Path |

|--------|------|

| `POST` | `/admin/app/send-targeted-notification` |



**Auth:** Admin token header `adminauth` (same as other admin APIs).



**Base URL examples:**

- Local: `http://localhost:5678/admin/app/send-targeted-notification`

- Production: `https://api.gloup.in/admin/app/send-targeted-notification`



---



## Request body



| Field | Type | Required | Description |

|-------|------|----------|-------------|

| `recipient_type` | string | Yes | `"user"` (customer app) or `"partner"` (salon app). Alias: `sent_to` |

| `recipient_id` | number | Yes* | User id or Store id. *Or use `user_id` / `partner_id` / `store_id` instead |

| `title` | string | Yes | Notification title |

| `description` | string | Yes | Notification body |



### Send to a customer (user)



```json

{

  "recipient_type": "user",

  "recipient_id": 42,

  "title": "Booking reminder",

  "description": "Your appointment is tomorrow at 10:00 AM."

}

```



### Send to a partner / salon (store)



```json

{

  "recipient_type": "partner",

  "recipient_id": 630,

  "title": "New booking",

  "description": "You have a new booking request."

}

```



---



## Success response



In-app notification is **always** created when the user/store exists. Push details are nested under `push`.



**With FCM tokens (push attempted):**



```json

{

  "status": 201,

  "data": {

    "in_app_notification": true,

    "push": {

      "attempted": 1,

      "success": 1,

      "failed": 0,

      "pruned_invalid_tokens": 0,

      "failure_reasons": []

    },

    "message": "In-app notification saved. Push delivered successfully.",

    "recipient_type": "user",

    "recipient_id": 42,

    "recipient_name": "John Doe",

    "notification_id": 15

  }

}

```



**No FCM token (in-app only, HTTP 201 — not 400):**



```json

{

  "status": 201,

  "data": {

    "in_app_notification": true,

    "push": {

      "attempted": 0,

      "success": 0,

      "failed": 0,

      "pruned_invalid_tokens": 0,

      "failure_reasons": []

    },

    "message": "In-app notification saved. Push skipped — no FCM tokens registered. Ask them to open the app and allow notifications.",

    "recipient_type": "partner",

    "recipient_id": 630,

    "recipient_name": "Salon Name",

    "notification_id": 16

  }

}

```



**Stale token pruned after FCM error:**



```json

{

  "status": 201,

  "data": {

    "in_app_notification": true,

    "push": {

      "attempted": 1,

      "success": 0,

      "failed": 1,

      "pruned_invalid_tokens": 1,

      "failure_reasons": ["messaging/registration-token-not-registered"]

    },

    "message": "In-app notification saved. Push failed for invalid token(s); removed from database. User should reopen the app.",

    "recipient_type": "user",

    "recipient_id": 42,

    "notification_id": 17

  }

}

```



---



## Error cases



| Situation | Typical message |

|-----------|-----------------|

| Missing title/description | `title and description are required` |

| Invalid `recipient_type` | `recipient_type must be 'user' or 'partner'` |

| Missing id | `recipient_id is required (...)` |

| User/store not found | `User not found` / `Partner / store not found` |



Missing FCM tokens is **not** an error — the user/partner still gets an in-app notification when they open the app.



Recipients register tokens via:

- Customer: `POST /user/auth/deviceId` with `{ "device_id": "<FCM token>" }`

- Partner: `POST /partner/auth/deviceId` with `{ "device_id": "<FCM token>" }`



One active FCM token is kept per user/store on each `/deviceId` call (replaces previous). Invalid tokens are removed automatically after failed FCM sends. Push sends use only the latest stored token per recipient to avoid duplicate notifications on the same phone.



---



## Comparison with broadcast API



| API | Audience |

|-----|----------|

| `POST /admin/app/addnotification` | Many users/partners (`sent_to`: `all`, `user`, `store`) |

| `POST /admin/app/send-targeted-notification` | **One** user or **one** partner by id |



Both use the same FCM prune logic on send failures.

