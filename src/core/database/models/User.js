import sequelize from "sequelize";
const { Model, DataTypes } = sequelize;
import { connection } from "../connection.js";
class User extends Model { }

User.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  firstname: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  lastname: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    validate: { isEmail: true },
  },
  otp: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  optExpiration: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  date_of_birth: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  invited_code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  used_code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  wallet: {
    type: DataTypes.DECIMAL(19, 4),
    allowNull: true,
    defaultValue: 0.00,
  },
  paid_booking_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  loyalty_status: {
    type: DataTypes.ENUM('new_user', 'first_booking', 'repeat', 'loyal', 'vip'),
    allowNull: false,
    defaultValue: 'new_user',
  },
  profilePic: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  device_id: {
    type: DataTypes.TEXT("long"),
    allowNull: true
  },
  apple_sub: {
    type: DataTypes.STRING, // Use STRING or TEXT, depending on length requirements
    allowNull: true,
    unique: true, // IMPORTANT: Ensure one Apple ID maps to one user
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'terminated'),
    allowNull: false,
    defaultValue: 'active',
  },
  age: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Account creation time. NULL for pre-existing users with no session,
  // booking or OTP history to backfill from (see the migration).
  registered_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});

class OtpLogs extends Model { }

OtpLogs.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  userName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  requestId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  smsType: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  msgType: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  userType: {
    type: DataTypes.ENUM("user", "partner"),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active',
  },
}, {
  sequelize: connection,
  freezeTableName: true,
});


class UserSession extends Model { }

UserSession.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  token: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  ipv4: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'revoked'),
    allowNull: true,
  },
  user_agent: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  // android / ios / web / app - see resolveClientPlatform().
  platform: {
    type: DataTypes.STRING(16),
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});

// App usage sessions built from the heartbeat (see appUsageTracker.js).
class UserAppSessions extends Model { }

UserAppSessions.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  platform: {
    type: DataTypes.STRING(16),
    allowNull: true,
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  last_seen_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  ended_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
  // Same as the migration, in case dbSync creates the table first.
  indexes: [
    { name: "idx_user_app_sessions_user_seen", fields: ["user_id", "last_seen_at"] },
    { name: "idx_user_app_sessions_started", fields: ["started_at"] },
    { name: "idx_user_app_sessions_seen", fields: ["last_seen_at"] },
  ],
});

// In-app actions the backend can see: salon_view, coupon_apply.
class UserEvents extends Model { }

UserEvents.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  event: {
    type: DataTypes.STRING(32),
    allowNull: false,
  },
  store_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  coupon_code: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
  // Same as the migration, in case dbSync creates the table first.
  indexes: [
    { name: "idx_user_events_event_created", fields: ["event", "created_at"] },
    { name: "idx_user_events_user", fields: ["user_id"] },
  ],
});
// Locations the app reports (live GPS or a manually picked place).
class UserLocations extends Model { }

UserLocations.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  lat: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: false,
  },
  lng: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: false,
  },
  source: {
    type: DataTypes.STRING(16),
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
  // Same as the migration, in case dbSync creates the table first.
  indexes: [
    { name: "idx_user_locations_user_created", fields: ["user_id", "created_at"] },
  ],
});

class Favourites extends Model { }

Favourites.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  store_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});


class DiscountsUsed extends Model { }

DiscountsUsed.init({
  id: {
    type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false
  },
  discount_id: {
    type: DataTypes.BIGINT, allowNull: true
  },
  user_id: {
    type: DataTypes.BIGINT, allowNull: true
  }
}, { sequelize: connection, freezeTableName: true, timestamps: false })


class Reviews extends Model { }
Reviews.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
  rating: { type: DataTypes.INTEGER, allowNull: true },
  user_id: { type: DataTypes.BIGINT, allowNull: true },
  store_id: { type: DataTypes.BIGINT, allowNull: true },
  cretaed_at: { type: DataTypes.DATE, allowNull: true },
  updated_at: { type: DataTypes.DATE, allowNull: true },
  review_description: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: true },
}, { sequelize: connection, freezeTableName: true, timestamps: false });


class Payments extends Model { }

Payments.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  payment_status: {
    type: DataTypes.ENUM('pending', 'success', 'failed'),
    allowNull: true,
  },
  appointment_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});
class WalletLogs extends Model { }

WalletLogs.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  amount_added: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  balance_before: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  balance_after: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  payment_status: {
    type: DataTypes.ENUM('pending', 'success', 'failed'),
    allowNull: true,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});

class appointments extends Model { }

appointments.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  store_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  booking_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  amount: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  slot_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  is_combo: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  profesional_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  razorpay_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  payment_status: {
    type: DataTypes.STRING,
    allowNull: true
  },
  payment_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_wallet: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  is_discounted: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  discounted_amount: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  discount_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  gst: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  // Platform fee (rupees) charged to the customer on this booking.
  platform_fee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 3,
  },
  status: {
    type: DataTypes.ENUM('booked', 'cancelled', 'completed', 'confirmed', 'refunded', 'pending'),
    allowNull: true,
  },
  razorpay_signature: {
    type: DataTypes.STRING,
    allowNull: true
  },
  booking_for: {
    type: DataTypes.STRING,
    allowNull: true
  },
  guest_id: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  customer_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  customer_phone: {
    type: DataTypes.STRING(15),
    allowNull: true
  },
  customer_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  // Where the customer was when booking (see userLocation.js) and the
  // straight-line distance to the salon.
  user_lat: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: true
  },
  user_lng: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: true
  },
  user_location_source: {
    type: DataTypes.STRING(16),
    allowNull: true
  },
  distance_km: {
    type: DataTypes.DECIMAL(7, 2),
    allowNull: true
  },
  // When / by which admin a booking was refunded (updateRefundBookingStatus).
  refunded_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  refunded_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
}, {
  sequelize: connection,
  modelName: 'Appointments',
  tableName: 'appointments',
  timestamps: false,
  freezeTableName: true,
});

class appointment_items extends Model { }

appointment_items.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  service_amount: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  combo_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  // Service/combo list price and "important" flag at booking time, so CAC
  // (list_amount - service_amount) doesn't drift when a salon edits prices.
  list_amount: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  is_important: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});


class user_cart extends Model { }

user_cart.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  shop_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  service_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'deleted'), // define your cart_status values here
    allowNull: true,
  },
}, {
  sequelize: connection,
  modelName: 'UserCart',
  tableName: 'user_cart',
  timestamps: false,
  freezeTableName: true,
});

class NotificationLogs extends Model { }

NotificationLogs.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  image: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
  date:{
    type:DataTypes.DATE,
    allowNull:true
  },
  notification_id:{
    type:DataTypes.INTEGER,
    allowNull:true
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});

class refund_requests extends Model { }

refund_requests.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  appointment_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: true,
  },
  is_wallet: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // When a rejected request's "booking cancelled" WhatsApp message is due to
  // send (set to NOW() + 10 min at rejection time) — see updaterequest() in
  // AdminDbController.js and CronHelper.scheduleCancelledBookingNotify().
  cancel_notify_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancel_notified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
}
)

class UsedCoupons extends Model { }

UsedCoupons.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  coupon_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  }
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
})




class user_transaction_logs extends Model { }

user_transaction_logs.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,

  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNul: true
  },
  type: {
    type: DataTypes.ENUM('credit', 'debit'),
    allowNull: true
  },
  date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  transaction_amount: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
})

class AccountLogs extends Model { }
AccountLogs.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNul: true
  },
  action: {
    type: DataTypes.STRING,
    allowNull: true
  },
  date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
})


class GuestDetails extends Model { }
GuestDetails.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  age: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
}, {
  sequelize: connection,
  timestamps: true,
  freezeTableName: true,
});

export { User, OtpLogs, UserSession, UserAppSessions, UserEvents, UserLocations, Payments, WalletLogs, appointments, appointment_items, user_cart, Reviews, Favourites, user_transaction_logs, refund_requests, NotificationLogs, UsedCoupons, DiscountsUsed, AccountLogs, GuestDetails };
