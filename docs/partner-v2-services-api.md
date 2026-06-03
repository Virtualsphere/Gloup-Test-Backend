# Partner App — v2 Services API

Base URL: `http://localhost:5678/partner/app`
Auth header: `partnertoken` (AES-encrypted JWT session token — obtain from an active partner session)

---

## POST `/v2/addservices`

Creates a new service under the authenticated partner's store.

### Request

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `partnertoken` | Yes | Partner session token |
| `Content-Type` | Yes | `application/json` |

**Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `service_name` | string | Yes | Name of the service |
| `service_category` | number | Yes | Category ID (see `/v2/service-categories`) |
| `amount` | number | Yes | Price of the service |
| `duration` | string | Yes | Duration — accepts `"1h"`, `"1.5h"`, `"30m"`, or `"HH:MM:SS"` |
| `service_for` | string | Yes | Target gender: `"male"`, `"female"`, or `"unisex"` |
| `discounted_amount` | number | No | Discounted price (omit if no discount) |
| `status` | boolean | No | `true` = active (default), `false` = inactive |

**Duration conversion examples**

| Input | Stored as |
|-------|-----------|
| `"1h"` | `"01:00:00"` |
| `"1.5h"` | `"01:30:00"` |
| `"30m"` | `"00:30:00"` |
| `"45m"` | `"00:45:00"` |
| omitted | `"00:30:00"` (default) |

### Example Request

```json
POST /partner/app/v2/addservices
partnertoken: <token>

{
  "service_name": "Hair Cut",
  "service_category": 1,
  "amount": 500,
  "discounted_amount": 450,
  "duration": "1h",
  "service_for": "male",
  "status": true
}
```

### Response

**201 Created**

```json
{
  "status": 201,
  "data": {
    "id": 42,
    "store_id": 7,
    "service_name": "Hair Cut",
    "service_category": 1,
    "amount": 500,
    "discounted_amount": 450,
    "duration": "01:00:00",
    "service_for": "male",
    "status": "active",
    "createdAt": "2026-03-31T10:00:00.000Z",
    "updatedAt": "2026-03-31T10:00:00.000Z"
  }
}
```

**400 Bad Request** — missing required field

```json
{
  "status": 400,
  "message": "Missing mandatory field: amount"
}
```

**401 Unauthorized** — missing or invalid token

```json
{
  "status": 401,
  "message": "Authentication failed"
}
```

---

## PATCH `/v2/updateservices`

Partially updates an existing service. Only the authenticated partner's own services can be updated (ownership enforced by `store_id`). Only fields provided in the body are updated.

### Request

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `partnertoken` | Yes | Partner session token |
| `Content-Type` | Yes | `application/json` |

**Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | number | Yes | ID of the service to update |
| `service_name` | string | No | New service name |
| `service_category` | number | No | New category ID |
| `amount` | number | No | New price |
| `duration` | string | No | New duration (same formats as add) |
| `service_for` | string | No | `"male"`, `"female"`, or `"unisex"` |
| `discounted_amount` | number \| null | No | New discounted price; pass `null` to clear |
| `status` | boolean | No | `true` = active, `false` = inactive |

### Example Request

```json
PATCH /partner/app/v2/updateservices
partnertoken: <token>

{
  "id": 42,
  "service_name": "Hair Cut (Premium)",
  "amount": 600,
  "status": true
}
```

### Response

**201 OK**

```json
{
  "status": 201,
  "data": {
    "id": 42,
    "store_id": 7,
    "service_name": "Hair Cut (Premium)",
    "service_category": 1,
    "amount": 600,
    "discounted_amount": 450,
    "duration": "01:00:00",
    "service_for": "male",
    "status": "active",
    "updatedAt": "2026-03-31T11:00:00.000Z"
  }
}
```

**400 Bad Request** — missing `id`

```json
{
  "status": 400,
  "message": "Missing service ID for update"
}
```

**400 Bad Request** — service not found or ownership mismatch

```json
{
  "status": 400,
  "message": "Service not found or ownership mismatch"
}
```

**401 Unauthorized** — missing or invalid token

```json
{
  "status": 401,
  "message": "Authentication failed"
}
```

---

## GET `/v2/services`

Lists all services for the authenticated partner's store.

### Request

**Headers**

| Header | Required |
|--------|----------|
| `partnertoken` | Yes |

### Response

**200 OK** — returns array of service objects

---

## Related Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v2/service-categories` | List available service categories (use for `service_category` IDs) |
| PATCH | `/v2/updateservices` | Update existing service |
| POST | `/v2/addservices` | Add new service |
| GET | `/v2/services` | List all services |
