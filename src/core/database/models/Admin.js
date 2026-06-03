import sequelize from "sequelize";
const { Model, DataTypes } = sequelize;
import { connection } from "../connection.js";


class Banner extends Model { }
Banner.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
  store_id: { type: DataTypes.BIGINT, allowNull: true },
  image: { type: DataTypes.TEXT, allowNull: true },
  date: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: true },
  type: { type: DataTypes.ENUM('main', 'sub', 'sub2', ''), allowNull: true },
  place: { type: DataTypes.ENUM('web', 'user', 'partner'), allowNull: true },
  issub: { type: DataTypes.BOOLEAN, allowNull: true },
  // Added new field for banner color with validation
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    validate: {
      is: /^#([0-9A-F]{6})$/i
    }
  },

}, { sequelize: connection, freezeTableName: true, timestamps: false });


class StoreWallet extends Model { }
StoreWallet.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
  store_id: { type: DataTypes.BIGINT, allowNull: true },
  wallet: { type: DataTypes.BIGINT, allowNull: true },
}, { sequelize: connection, freezeTableName: true, timestamps: false });


class SettlementLogs extends Model { }
SettlementLogs.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
  amount_paid: { type: DataTypes.BIGINT, allowNull: true },
  wallet_pending: { type: DataTypes.BIGINT, allowNull: true },
  store_id: { type: DataTypes.BIGINT, allowNull: true },
  transaction_date: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: true },
}, { sequelize: connection, freezeTableName: true, timestamps: false });


class SubscriptionPlans extends Model { }
SubscriptionPlans.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
  type: { type: DataTypes.ENUM('range', 'chairs', 'banner', 'notification'), allowNull: true },
  days: { type: DataTypes.INTEGER, allowNull: true },
  price: { type: DataTypes.BIGINT, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: true },

}, { sequelize: connection, freezeTableName: true, timestamps: false });


class StoreSubscription extends Model { }
StoreSubscription.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
  subscription_id: { type: DataTypes.BIGINT, allowNull: true },
  start_date: { type: DataTypes.DATE, allowNull: true },
  end_date: { type: DataTypes.DATE, allowNull: true },
  store_id: { type: DataTypes.BIGINT, allowNull: true },
  amount: { type: DataTypes.BIGINT, allowNull: true },
  quantity: { type: DataTypes.BIGINT, allowNull: true },
  payment_status: { type: DataTypes.ENUM('pending', 'completed', 'failed'), allowNull: true },
  payment_id: { type: DataTypes.STRING, allowNull: true },
  order_id: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: true },
  type: { type: DataTypes.ENUM('range', 'chairs', 'banner', 'notification'), allowNull: true },
}, { sequelize: connection, freezeTableName: true, timestamps: false });


class Location extends Model { }

Location.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  location: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  }
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false
});

//  class SubscriptionPaymentLogs extends Model {}

// SubscriptionPaymentLogs.init({
//   id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
//   payment_status: { type: DataTypes.ENUM('pending', 'completed', 'failed'), allowNull: true },
//   amount_paid: { type: DataTypes.BIGINT, allowNull: true },
//   paidOn: { type: DataTypes.BIGINT, allowNull: true },
//   store_id: { type: DataTypes.BIGINT, allowNull: true },
//   subscription_id: { type: DataTypes.BIGINT, allowNull: true },
// }, 
// { sequelize: connection, freezeTableName: true, timestamps: false });


class admin extends Model { }

admin.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
  name: {
    type: DataTypes.STRING,
    allowNUll: true
  },
  password: {
    type: DataTypes.STRING,
    allowNUll: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  otp: {
    type: DataTypes.STRING,
    allowNull: true
  },
  otpexpiration: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: true
  }

}, { sequelize: connection, freezeTableName: true, timestamps: false })


class Coupons extends Model { }

Coupons.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  discount_type: {
    type: DataTypes.ENUM('percentage', 'flat'),
    allowNull: true,
  },
  usage_limit: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  discount_value: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT("long"),
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
})




class adminSession extends Model { }

adminSession.init({
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
    type: DataTypes.ENUM('active', 'inactive'),
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

class category extends Model { }

category.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
})

class Adminnotificationlogs extends Model { }

Adminnotificationlogs.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  store_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  notification_type: {
    type: DataTypes.ENUM('general', 'subscription'),
    allowNull: true,
  },
  sent_to: {
    type: DataTypes.ENUM('all', 'store', 'user'),
    allowNull: true,
  },
  date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  },

}, {

  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
})

class FailedNotificationTokens extends Model { }

FailedNotificationTokens.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },

  token: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  partner_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  notification_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  error_code: {
    type: DataTypes.STRING,
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

class SentNotificationDevices extends Model { }

SentNotificationDevices.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },

  token: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },

  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  partner_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  notification_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  notification_title: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  notification_description: {
    type: DataTypes.TEXT("long"),
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

class ErrorLogs extends Model { }

ErrorLogs.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },

  module: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },

  function_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },

  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  stack_trace: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  },

  request_data: {
    type: DataTypes.JSON,
    allowNull: true,
  },

  error_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },

  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }

}, {
  sequelize: connection,
  tableName: "error_logs",
  timestamps: false,
});

export { SettlementLogs, StoreWallet, StoreSubscription, Banner, category, SubscriptionPlans, Location, admin, adminSession, Adminnotificationlogs, Coupons, SentNotificationDevices, FailedNotificationTokens, ErrorLogs };
