# Adding Whitelist Functionality

This document details the implementation of whitelist functionality added on December 21, 2024.

## 1. Database Setup

Add the following to your Prisma schema:
```prisma
model Whitelist {
address String @id
previousAddress String?
updatedAt DateTime @default(now())
updatedBy String
active Boolean @default(true)
changeType String // INITIAL, UPDATE
signature String
}
```
Run migrations:
```bash
npx prisma migrate dev --name add-whitelist
```

## 2. API Implementation

Created new file: `src/routes/apiRoutes/whitelist.ts`

Updated `src/routes/apiRoutes.ts` to include whitelist routes:


## 3. Endpoints

### GET /api/whitelist
Returns all active whitelist entries.

### PUT /api/whitelist/update
Updates an existing whitelist entry.
Request body:
```json
{
"oldAddress": "kaspa:address1",
"newAddress": "kaspa:address2",
"signature": "signature",
"adminAddress": "kaspa:admin"
}
```

### POST /api/whitelist/bulk-upload
Bulk uploads addresses from CSV.
Form-data:
- csv: File (CSV format)
- adminAddress: String
- signature: String

CSV Format:
```
csv
address
kaspa:[address1]
kaspa:[address2]
```

## 4. Testing

Use Postman or curl to test endpoints:
```bash
Get whitelist
curl https://devkatapi.nachowyborski.xyz/api/whitelist
Update address
curl -X PUT https://devkatapi.nachowyborski.xyz/api/whitelist/update \
-H "Content-Type: application/json" \
-d '{
"oldAddress": "kaspa:...",
"newAddress": "kaspa:...",
"signature": "test",
"adminAddress": "kaspa:..."
}'
Bulk upload
curl -X POST https://devkatapi.nachowyborski.xyz/api/whitelist/bulk-upload \
-F "csv=@addresses.csv" \
-F "adminAddress=kaspa:..." \
-F "signature=test"
```


## 5. TODO
- [ ] Implement signature verification
- [ ] Add rate limiting
- [ ] Add proper admin authentication
- [ ] Add batch size limits for bulk upload