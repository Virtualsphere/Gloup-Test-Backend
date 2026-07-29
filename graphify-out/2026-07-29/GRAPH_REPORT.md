# Graph Report - Gloup-Test-Backend  (2026-07-21)

## Corpus Check
- 122 files · ~243,983 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 976 nodes · 2312 edges · 85 communities (31 shown, 54 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 271 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2e93eafe`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin App Controller
- Admin Search & Partner Ops
- User App Controller
- Response Formatting Service
- Deployment & API Test Docs
- Package Metadata & ESLint
- GCS Upload Utilities
- OpenAPI Swagger Export
- Application Response Core
- Payload Compiler & Helpers
- Partner Data Models
- Admin Middleware & FCM Push
- Database Init & Migrations
- App Entrypoint & Logging
- User Data Models
- AJV Schema Validation
- Application Error Handling
- FCM HTTP v1 & OAuth
- WhatsApp Notifications
- Package Dependencies
- Admin Data Models
- Booking Notifications
- Admin Authentication
- User DB Controller & Redis
- Partner DB & Date Formats
- Schema Migrations
- Apple Sign-In Auth
- Excel Parsing
- Smart Links Routes
- Marketing Upload
- Admin Auth & DB Error Log
- Application Result Type
- Cron Job Scheduling
- Dependency: ajv
- Dependency: ajv-formats
- Dependency: apple-app-store-server-library
- Dependency: apple-auth
- Dependency: apple-signin-auth
- Dependency: aws-sdk-client-s3
- Dependency: axios
- Dependency: bcrypt
- Dependency: chalk
- Dependency: compression
- Dependency: crypto-js
- Dependency: dotenv
- Dependency: download
- Dependency: ejs
- Dependency: err-code
- Dependency: express
- Dependency: express-prom-bundle
- Dependency: express-rate-limit
- Dependency: firebase-admin
- Dependency: fs
- Dependency: geo-tz
- Dependency: google-auth-library
- Dependency: google-cloud-storage
- Dependency: helmet
- Dependency: https
- Dependency: iap-verifier
- Dependency: jsonwebtoken
- Dependency: lodash
- Dependency: moment
- Dependency: multer
- Dependency: multer-s3
- Dependency: mysql
- Dependency: mysql2
- Dependency: node-apple-receipt-verify
- Dependency: node-cache
- Dependency: node-cron
- Dependency: nodemailer
- Dependency: ora
- Dependency: path
- Dependency: pm2
- Dependency: prom-client
- Dependency: puppeteer
- Dependency: razorpay
- Dependency: redis
- Dependency: requirejs
- Dependency: sharp
- Dependency: winston
- Dependency: zeptomail
- Prod DB Restore Script

## God Nodes (most connected - your core abstractions)
1. `scripts` - 15 edges
2. `connection` - 15 edges
3. `formatSalonResponse()` - 15 edges
4. `uploadToGCS()` - 15 edges
5. `sendPushNotification()` - 15 edges
6. `ApplicationResult` - 14 edges
7. `ApplicationResponse` - 12 edges
8. `GCSUpload` - 12 edges
9. `razorpayWebhook()` - 11 edges
10. `partnerDbController` - 11 edges

## Surprising Connections (you probably didn't know these)
- `GloUp Dev Stack` --conceptually_related_to--> `Booking and Payment Flow`  [AMBIGUOUS]
  README.md → docs/booking-payment-flow.md
- `Appointment Confirmation Email Template` --conceptually_related_to--> `Booking and Payment Flow`  [INFERRED]
  src/core/utils/mailTemplate/delivered.html → docs/booking-payment-flow.md
- `Legacy SQL Migration Notes` --references--> `appointments Table`  [INFERRED]
  sql_backup/migrations/README.md → docs/booking-payment-flow.md
- `GuestDetails Table (SQL)` --shares_data_with--> `appointments Table`  [INFERRED]
  sql.txt → docs/booking-payment-flow.md
- `up()` --calls--> `addColumnIfMissing()`  [EXTRACTED]
  migrations/20260718120000-add-customer-contact-to-appointments.js → src/core/database/migrationHelpers.js

## Import Cycles
- 3-file cycle: `src/User/controller/userappcontroller.js -> src/User/middleware/appmiddleware.js -> src/core/database/Controller/userDbController.js -> src/User/controller/userappcontroller.js`
- 3-file cycle: `src/User/controller/userauthcontroller.js -> src/User/middleware/authmiddleware.js -> src/core/database/Controller/userDbController.js -> src/User/controller/userauthcontroller.js`
- 3-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/database/Controller/AdminDbController.js -> src/Admin/controller/adminappcontroller.js`
- 3-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/database/Controller/partnerDbController.js -> src/Admin/controller/adminappcontroller.js`
- 3-file cycle: `src/Partner/controller/partnerappcontroller.js -> src/Partner/middleware/partnerappmiddleware.js -> src/core/database/Controller/partnerDbController.js -> src/Partner/controller/partnerappcontroller.js`
- 4-file cycle: `src/User/controller/userappcontroller.js -> src/User/middleware/appmiddleware.js -> src/core/utils/bookingNotifications.js -> src/core/database/Controller/userDbController.js -> src/User/controller/userappcontroller.js`
- 4-file cycle: `src/User/controller/userauthcontroller.js -> src/User/middleware/authmiddleware.js -> src/core/utils/fcmTokenService.js -> src/core/database/Controller/userDbController.js -> src/User/controller/userauthcontroller.js`
- 4-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/utils/fcmTokenService.js -> src/core/database/Controller/AdminDbController.js -> src/Admin/controller/adminappcontroller.js`
- 4-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/database/Controller/AdminDbController.js -> src/core/database/Controller/partnerDbController.js -> src/Admin/controller/adminappcontroller.js`
- 4-file cycle: `src/Partner/controller/partnerappcontroller.js -> src/Partner/middleware/partnerappmiddleware.js -> src/core/utils/syncRazorpayPlans.js -> src/core/database/Controller/partnerDbController.js -> src/Partner/controller/partnerappcontroller.js`
- 4-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/utils/fcmTokenService.js -> src/core/database/Controller/partnerDbController.js -> src/Admin/controller/adminappcontroller.js`
- 5-file cycle: `src/User/controller/userappcontroller.js -> src/User/middleware/appmiddleware.js -> src/core/utils/bookingNotifications.js -> src/core/utils/fcmTokenService.js -> src/core/database/Controller/userDbController.js -> src/User/controller/userappcontroller.js`
- 5-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/utils/pushNotificationService.js -> src/core/utils/fcmTokenService.js -> src/core/database/Controller/AdminDbController.js -> src/Admin/controller/adminappcontroller.js`
- 5-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/utils/fcmTokenService.js -> src/core/database/Controller/AdminDbController.js -> src/core/database/Controller/partnerDbController.js -> src/Admin/controller/adminappcontroller.js`
- 5-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/database/Controller/AdminDbController.js -> src/core/utils/syncRazorpayPlans.js -> src/core/database/Controller/partnerDbController.js -> src/Admin/controller/adminappcontroller.js`
- 5-file cycle: `src/Admin/controller/adminappcontroller.js -> src/Admin/middleware/adminappmiddleware.js -> src/core/utils/pushNotificationService.js -> src/core/utils/fcmTokenService.js -> src/core/database/Controller/partnerDbController.js -> src/Admin/controller/adminappcontroller.js`
- 5-file cycle: `src/Partner/controller/partnerappcontroller.js -> src/Partner/middleware/partnerappmiddleware.js -> src/core/utils/helperfunctions.js -> src/core/utils/fcmTokenService.js -> src/core/database/Controller/partnerDbController.js -> src/Partner/controller/partnerappcontroller.js`

## Hyperedges (group relationships)
- **Observability / Monitoring Stack** — docker_compose_app_service, docker_compose_prometheus_service, docker_compose_grafana_service, grafana_provisioning_datasources_datasource_prometheus_datasource, prometheus_prometheus_gloup_node_api_scrape_job [EXTRACTED 1.00]
- **Booking and Payment Lifecycle** — docs_booking_payment_flow_v2_create_order_flow, docs_booking_payment_flow_payment_success_flow, docs_booking_payment_flow_razorpay_webhook, docs_booking_payment_flow_appointments_table, docs_booking_payment_flow_appointment_items_table, docs_booking_payment_flow_slot_availability, docs_booking_payment_flow_refund_flow [EXTRACTED 1.00]
- **Deployment Pipeline (CI to VM)** — _github_workflows_deploy_deploy_backend_workflow, docker_compose_app_service, docker_compose_db_service, migrations_readme_umzug_migrations [EXTRACTED 1.00]

## Communities (85 total, 54 thin omitted)

### Community 0 - "Admin App Controller"
Cohesion: 0.06
Nodes (80): addbanner(), addcategory(), addcoupons(), addnotification(), addpartnersubscription(), addpayouts(), addsubscription(), blockAndUnblockSlot() (+72 more)

### Community 1 - "Admin Search & Partner Ops"
Cohesion: 0.07
Nodes (53): main(), TEST_EMAIL, redisClient, addPartnerBookingLogIfNew(), addUserBookingLogIfNew(), sendBookingConfirmedNotifications(), mapHttpErrorToFcmCode(), sendEachForMulticastViaHttpV1() (+45 more)

### Community 2 - "User App Controller"
Cohesion: 0.06
Nodes (80): createService(), getallpartnerdetails(), getallsubscription(), getnotificationbyid(), getSalons(), getserviceprovidedfor(), addaminities(), addbankdetails() (+72 more)

### Community 3 - "Response Formatting Service"
Cohesion: 0.06
Nodes (63): addfavourites(), addGuestDetails(), addreview(), addtocart(), addwallet(), cancelPendingOrderV2(), create_order_wallet(), createInternalOrder() (+55 more)

### Community 4 - "Deployment & API Test Docs"
Cohesion: 0.12
Nodes (22): chatResizer(), baseUrl, bucket, NETWORK_ERROR_CODES, saveToGCS(), shouldUseFetchFallback(), storage, storageOptions (+14 more)

### Community 5 - "Package Metadata & ESLint"
Cohesion: 0.06
Nodes (47): Deploy Backend GitHub Actions Workflow, Admin Partner Approval Flow, Partner OTP Authentication Flow, Gloup Partner API Testing Scenarios, Partner Token (AES-encrypted JWT), Store Visibility Gate, Gloup API app Service (docker-compose), MySQL db Service (docker-compose) (+39 more)

### Community 6 - "GCS Upload Utilities"
Cohesion: 0.04
Nodes (45): eslint, @eslint/js, globals, author, bugs, url, description, devDependencies (+37 more)

### Community 7 - "OpenAPI Swagger Export"
Cohesion: 0.10
Nodes (37): calculateTimeAgo(), checkIfOpen(), formatAmenities(), formatAmenitiesV2(), formatCouponResponse(), formatDuration(), formatGenderIcons(), formatLanguages() (+29 more)

### Community 8 - "Application Response Core"
Cohesion: 0.06
Nodes (29): changePassword(), login(), logout(), verifyadmin(), adminauthmiddleware, approutes, adminauthroutes, apiLimiter (+21 more)

### Community 9 - "Payload Compiler & Helpers"
Cohesion: 0.11
Nodes (25): __dirname, outPath, spec, buildOpenApiSpec(), buildRequestBody(), pathToOpenApi(), SECURITY_SCHEMES, securityForRoute() (+17 more)

### Community 10 - "Partner Data Models"
Cohesion: 0.07
Nodes (27): Aminities, CategoryTable, Combinations, Combo, Enquiry, HireStudent, Languages, OwnerProfile (+19 more)

### Community 11 - "Admin Middleware & FCM Push"
Cohesion: 0.11
Nodes (17): AccountLogs, appointment_items, appointments, DiscountsUsed, Favourites, GuestDetails, NotificationLogs, OtpLogs (+9 more)

### Community 12 - "Database Init & Migrations"
Cohesion: 0.23
Nodes (9): adminDbController, ALLOWED_STATUS_TRANSITIONS, createDefaultTimeSlots(), formatTime(), { Op, Sequelize, fn, col }, generatePDF(), logErrorToDB(), deleteIfExists (+1 more)

### Community 13 - "App Entrypoint & Logging"
Cohesion: 0.17
Nodes (9): ajv, require, schemaFormats, birthDate, customTime, isNotEmpty, createHireStudent, otpLogin (+1 more)

### Community 14 - "User Data Models"
Cohesion: 0.05
Nodes (54): { Op, Sequelize }, SLOT_OCCUPANCY_SQL_ALIASED, userDbController, ApplicationError, AlreadyExists(), AuthenticationFailed(), BadRequest(), CustomError() (+46 more)

### Community 15 - "AJV Schema Validation"
Cohesion: 0.11
Nodes (23): app, __dirname, metricsMiddleware, [command = "up", arg], main(), Configurations(), dbConnection(), dbSync() (+15 more)

### Community 16 - "Application Error Handling"
Cohesion: 0.17
Nodes (21): formatIndianMobileNumber(), formatPaymentStatus(), getBookingWhatsAppPayload(), NOTE: value must be the raw text to display — MSG91 does NOT want, sendBookingConfirmedWhatsApp(), sendMarketingBroadcast(), sendPartnerBookingWhatsApp(), sendUserBookingWhatsApp() (+13 more)

### Community 17 - "FCM HTTP v1 & OAuth"
Cohesion: 0.13
Nodes (15): ajv, cors, jwk-to-pem, logger, nodemon, dependencies, ajv, cors (+7 more)

### Community 18 - "WhatsApp Notifications"
Cohesion: 0.16
Nodes (17): appleLoginPartner(), deleteaccount(), emaillogin(), getdeviceId(), googleloginpartner(), logout(), otp_login(), otp_verify() (+9 more)

### Community 19 - "Package Dependencies"
Cohesion: 0.13
Nodes (13): Adminnotificationlogs, adminSession, Banner, category, Coupons, ErrorLogs, FailedNotificationTokens, Location (+5 more)

### Community 20 - "Admin Data Models"
Cohesion: 0.26
Nodes (13): down(), up(), down(), up(), down(), up(), addColumnIfMissing(), addIndexIfMissing() (+5 more)

### Community 21 - "Booking Notifications"
Cohesion: 0.33
Nodes (6): { Op, Sequelize }, razorpay, buildAppointmentDateTime(), formatSlotTime(), toIstDatePart(), logger

### Community 23 - "User DB Controller & Redis"
Cohesion: 0.21
Nodes (10): xlsx, Adminappmiddleware, razorpay, admin, buildUsersExcelBuffer(), parseUsersFromExcel(), deleteFromGCS(), GCSUpload (+2 more)

### Community 25 - "Partner DB & Date Formats"
Cohesion: 0.50
Nodes (4): client, cloneImages(), downloadFile(), exportDir

### Community 26 - "Schema Migrations"
Cohesion: 0.60
Nodes (4): EXCEL_MIME_TYPES, fileFilter(), IMAGE_MIME_TYPES, marketingUpload

### Community 28 - "Excel Parsing"
Cohesion: 0.25
Nodes (6): defaultdata, development, production, s3, inAppService, service

### Community 86 - "Dependency: zeptomail"
Cohesion: 0.35
Nodes (8): main(), connection, partnerDbController, ensurePlanSyncedToRazorpay(), linkRazorpayPlanIdToDb(), razorpay, resolveRazorpayPlanId(), syncPlanToRazorpay()

### Community 87 - "Prod DB Restore Script"
Cohesion: 0.40
Nodes (5): bookingSSE(), addClient(), broadcastNewBooking(), clients, removeClient()

## Ambiguous Edges - Review These
- `GloUp Dev Stack` → `Booking and Payment Flow`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **240 isolated node(s):** `__dirname`, `app`, `metricsMiddleware`, `development`, `production` (+235 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **54 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GloUp Dev Stack` and `Booking and Payment Flow`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `dependencies` connect `FCM HTTP v1 & OAuth` to `GCS Upload Utilities`, `Admin Authentication`, `User DB Controller & Redis`, `Smart Links Routes`, `Marketing Upload`, `Admin Auth & DB Error Log`, `Application Result Type`, `Cron Job Scheduling`, `Dependency: ajv`, `Dependency: ajv-formats`, `Dependency: apple-app-store-server-library`, `Dependency: apple-auth`, `Dependency: apple-signin-auth`, `Dependency: aws-sdk-client-s3`, `Dependency: axios`, `Dependency: bcrypt`, `Dependency: chalk`, `Dependency: compression`, `Dependency: crypto-js`, `Dependency: dotenv`, `Dependency: download`, `Dependency: ejs`, `Dependency: err-code`, `Dependency: express`, `Dependency: express-prom-bundle`, `Dependency: express-rate-limit`, `Dependency: firebase-admin`, `Dependency: fs`, `Dependency: geo-tz`, `Dependency: google-auth-library`, `Dependency: google-cloud-storage`, `Dependency: helmet`, `Dependency: https`, `Dependency: iap-verifier`, `Dependency: jsonwebtoken`, `Dependency: lodash`, `Dependency: moment`, `Dependency: multer`, `Dependency: multer-s3`, `Dependency: mysql`, `Dependency: mysql2`, `Dependency: node-apple-receipt-verify`, `Dependency: node-cache`, `Dependency: node-cron`, `Dependency: nodemailer`, `Dependency: ora`, `Dependency: path`, `Dependency: pm2`, `Dependency: prom-client`, `Dependency: puppeteer`, `Dependency: razorpay`, `Dependency: redis`, `Dependency: requirejs`?**
  _High betweenness centrality (0.275) - this node is a cross-community bridge._
- **Why does `xlsx` connect `User DB Controller & Redis` to `FCM HTTP v1 & OAuth`?**
  _High betweenness centrality (0.253) - this node is a cross-community bridge._
- **What connects `__dirname`, `app`, `metricsMiddleware` to the rest of the system?**
  _240 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin App Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.06494269761974727 - nodes in this community are weakly interconnected._
- **Should `Admin Search & Partner Ops` be split into smaller, more focused modules?**
  _Cohesion score 0.06971153846153846 - nodes in this community are weakly interconnected._
- **Should `User App Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.06464883925947693 - nodes in this community are weakly interconnected._