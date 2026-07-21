import sequelize, { DATE } from "sequelize";
const { Model, DataTypes } = sequelize;
import { connection } from "../connection.js";

class Store extends Model { }

Store.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: true,
    unique: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  store_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  website: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  website: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  images: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  },
  team_size: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  address_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  docs: {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  },
  income: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bank_account_holder: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  account_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  completion_status: {
    type: DataTypes.ENUM('pending', 'completed', 'terminated', 'rejected', 'suspended'),
    defaultValue: "pending"
  },
  ifsc_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'terminated', 'rejected', 'suspended'),
    allowNull: true,
    defaultValue: 'active'
  },
  category_id: {
    type: DataTypes.JSON,
    allowNull: true,
  },

  // category_id: {
  //   type: DataTypes.JSON,
  //   allowNull: false,
  // },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  whatsapp_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  wallet_remaining: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  description: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  deviceId: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  razorpay_customer_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  otp: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // CHANGED NAME FROM opt to otp BREAKING CHANGE
  otpExpiration: {
    type: DataTypes.DATE,
    allowNull: true,
    field:
      process.env.NODE_ENV === "production"
        ? "optExpiration"   // production DB column (typo)
        : "otpExpiration",  // development DB column
  },
  apple_sub: {
    type: DataTypes.STRING, // Use STRING or TEXT, depending on length requirements
    allowNull: true,
    unique: true, // IMPORTANT: Ensure one Apple ID maps to one user
  },
  // new fields
  is_premium: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: new Date()
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: new Date()
  },
  salon_image: {
    type: DataTypes.STRING(500), // primary image
    allowNull: true
  },
  logo: { type: DataTypes.STRING, allowNull: true },
  services_provided_for: { type: DataTypes.JSON, allowNull: true },   // recommended
  languages: { type: DataTypes.JSON, allowNull: true },               // recommended
  is_premium: { type: DataTypes.BOOLEAN, allowNull: true },
  referral_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  about: {
    type: DataTypes.TEXT,
    allowNull: true
  },
}, {
  sequelize: connection,
  timestamps: true,
  freezeTableName: true,
});

class StoreSession extends Model { }

StoreSession.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
    unique: true
  },
  storeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: "store_id",
  },
  token: {
    type: DataTypes.TEXT('long'),
    allowNull: false
  },
  ipv4: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: new Date()
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: new Date()
  },
  userAgent: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});

class PartnerAddress extends Model { }

PartnerAddress.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    unique: true
  },
  store_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  addressLine1: {
    type: DataTypes.TEXT('long'),
    allowNull: false
  },
  addressLine2: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true
  },
  district: {
    type: DataTypes.STRING,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false
  },
  area: {
    type: DataTypes.STRING,
    allowNull: false
  },
  zipcode: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  landmark: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  longitude: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  location: {
    type: DataTypes.GEOMETRY('POINT'),
    allowNull: false,
  },
  radius: {
    type: DataTypes.INTEGER,
    allowNull: true,
    // defaultValue: 3000,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
  indexes: [
    {
      name: 'idx_pa_loc',
      type: 'SPATIAL',
      fields: ['location'],
    },
  ],
});



//  class Services extends Model {}

// Services.init({
//   id: {
//     type: DataTypes.INTEGER,
//     autoIncrement: true,
//     primaryKey: true,
//     allowNull: false,
//   },
//   name: {
//     type: DataTypes.STRING,
//     allowNull: true,
//   },
//   image: {
//     type: DataTypes.STRING,
//     allowNull: true,
//   },
//   stauts: {
//     type: DataTypes.ENUM('active', 'inactive'), 
//     allowNull: true,
//   },
// }, {
//   sequelize: connection,
//   freezeTableName: true,
//   timestamps: false,
// });

class StoreServices extends Model { }

StoreServices.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  service_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  store_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  amount: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  discounted_amount: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  duration: {
    type: DataTypes.TIME,
    allowNUll: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  service_category: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  service_for: {
    type: DataTypes.ENUM('male', 'female', 'unisex'),
    allowNull: true,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});


class WorkingHours extends Model { }

WorkingHours.init({
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
  from: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  to: {
    type: DataTypes.TIME,
    allowNull: true,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});

class PartnerNotificationLogs extends Model { }

PartnerNotificationLogs.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  partner_id: {
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
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
  date: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize: connection,
  timestamps: false,
  freezeTableName: true,
});

class review_delete_requests extends Model { }

review_delete_requests.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
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
  review_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  reason: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: true,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
})

class Slots extends Model { }

Slots.init({
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
  from: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  to: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
  day: {
    type: DataTypes.ENUM(
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ),
    allowNull: true,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});

class SlotBlockedDates extends Model { }

SlotBlockedDates.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  slot_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  store_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  blocked_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});

class Aminities extends Model { }

Aminities.init({
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
  icon: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});

class StoreAminities extends Model { }

StoreAminities.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  aminities_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  store_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});

class Stylist extends Model { }

Stylist.init({
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
  store_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  profilepic: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: true
  },
  known_services: {
    type: DataTypes.STRING,
    allowNull: true
  },
  designation: {
    type: DataTypes.STRING,
    allowNull: true
  },
  employment_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true
  },
  experience_years: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});


class Servicecategory extends Model { }

Servicecategory.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
  imageKey: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
})


class Combo extends Model { }

Combo.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  combo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  amount: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  store_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  duration: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: true,
  },
  service_category: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  }
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});

class Combinations extends Model { }

Combinations.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  service_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  amount_per_service: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  combo_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});

class CategoryTable extends Model { }

CategoryTable.init({
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
  category_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  }
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
})




class OwnerProfile extends Model { }

OwnerProfile.init({
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
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  profile_pic: {
    type: DataTypes.STRING,
    allowNull: true
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  country_code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  Dob: {
    type: DataTypes.STRING,
    allowNull: true,
  },

}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
})

// HireStudent
class HireStudent extends Model { }

HireStudent.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  specialization: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  academy: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  experience: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  location: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  availability: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  rating: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  bio: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  skills: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  mobile_number: {
    type: DataTypes.STRING(15),
    allowNull: false,
    unique: true,
    validate: {
      len: [10, 15],
      isNumeric: true
    },
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
  freezeTableName: true,
  timestamps: false,
})

// create new model for Languages
class Languages extends Model { }

Languages.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },

    code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },

    status: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active"
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize: connection,
    modelName: "Languages",
    tableName: "Languages",
    timestamps: false,
    freezeTableName: true,
    indexes: [
      { fields: ["status"] },
      { unique: true, fields: ["name"] },
      { unique: true, fields: ["code"] }
    ]
  }
)

// model to store data store related language
class StoreLanguages extends Model { }

StoreLanguages.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    store_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    language_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize: connection,
    modelName: "StoreLanguages",
    tableName: "StoreLanguages",
    timestamps: false,
    freezeTableName: true,
    indexes: [
      { fields: ["store_id"] },
      { fields: ["language_id"] },
      {
        unique: true,
        fields: ["store_id", "language_id"]
      }
    ]
  }
);

class ServicesProvidedFor extends Model { }

ServicesProvidedFor.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active"
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize: connection,
    modelName: "StoreServicesProvidedFor",
    tableName: "StoreServicesProvidedFor",
    timestamps: false,
    freezeTableName: true,
    indexes: [
      { fields: ["status"] },
      { unique: true, fields: ["name"] }
    ]
  }
);


class PartnerSubscriptionPlans extends Model { }

PartnerSubscriptionPlans.init({
  plan_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  plan_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  price: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  original_price: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  discount_price: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  price_tag: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  duration_months: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  booking_limit: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  is_unlimited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  razorpay_plan_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: new Date(),
  }
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});

class PartnerSubscriptionPlanfeatures extends Model { }

PartnerSubscriptionPlanfeatures.init({
  feature_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  feature_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false,
});


class PartnerSubscriptionPlanfeatureMapping extends Model { }

PartnerSubscriptionPlanfeatureMapping.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "PartnerSubscriptionPlans",
        key: "plan_id"
      }
    },

    feature_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "PartnerSubscriptionPlanfeatures",
        key: "feature_id"
      }
    }
  },
  {
    sequelize: connection,
    modelName: "PartnerSubscriptionPlanFeatureMapping",
    tableName: "PartnerSubscriptionPlanfeatureMapping",
    freezeTableName: true,
    timestamps: false
  });


class PartnerSubscriptions extends Model { }

PartnerSubscriptions.init({
  subscription_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  salon_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  plan_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  start_date: DataTypes.DATEONLY,
  end_date: DataTypes.DATEONLY,

  amount_paid: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },

  payment_status: {
    type: DataTypes.ENUM("pending", "paid", "failed", "refunded"),
    defaultValue: "pending"
  },

  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },

  razorpay_order_id: {
    type: DataTypes.STRING,
    allowNull: true
  },

  razorpay_payment_id: {
    type: DataTypes.STRING,
    allowNull: true
  },

  razorpay_signature: {
    type: DataTypes.STRING,
    allowNull: true
  },
  razorpay_subscription_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  razorpay_customer_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  rzp_status: {
    type: DataTypes.ENUM(
      "created", "authenticated", "active",
      "pending", "halted", "cancelled", "completed", "expired"
    ),
    allowNull: true,
  },
  current_start: { type: DataTypes.DATE, allowNull: true },
  current_end: { type: DataTypes.DATE, allowNull: true },
  charge_at: { type: DataTypes.DATE, allowNull: true },
  paid_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_count: { type: DataTypes.INTEGER, allowNull: true },
  created_at: DataTypes.DATE,
  updated_at: DataTypes.DATE

}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at"
});


class PartnerSubscriptionsPayments extends Model { }

PartnerSubscriptionsPayments.init({
  payment_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  subscription_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  salon_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },

  payment_method: {
    type: DataTypes.STRING
  },

  payment_status: {
    type: DataTypes.ENUM("pending", "success", "failed", "refunded"),
    defaultValue: "pending"
  },

  transaction_id: {
    type: DataTypes.STRING
  },

  payment_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }

}, {
  sequelize: connection,
  freezeTableName: true,
  timestamps: false
});


class Enquiry extends Model { }

Enquiry.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  state: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize: connection,
  modelName: 'Enquiry',
  tableName: 'enquiries',
  timestamps: false, // Since we have created_at manually
});

// =============================
// 🔥 ASSOCIATIONS
// =============================
// 🟢 Plans → Feature Mapping
PartnerSubscriptionPlans.hasMany(PartnerSubscriptionPlanfeatureMapping, {
  foreignKey: "plan_id",
  as: "featuresMapping"
});

// 🟢 Mapping → Feature
PartnerSubscriptionPlanfeatureMapping.belongsTo(PartnerSubscriptionPlanfeatures, {
  foreignKey: "feature_id",
  as: "featureDetails"
});

// 🟢 Plan → Subscriptions
PartnerSubscriptionPlans.hasMany(PartnerSubscriptions, {
  foreignKey: "plan_id",
  as: "subscriptions"
});

// 🟢 Subscription → Plan
PartnerSubscriptions.belongsTo(PartnerSubscriptionPlans, {
  foreignKey: "plan_id",
  as: "plan"
});

// 🟢 Subscription → Payments
PartnerSubscriptions.hasMany(PartnerSubscriptionsPayments, {
  foreignKey: "subscription_id",
  as: "payments"
});

// 🟢 Payment → Subscription
PartnerSubscriptionsPayments.belongsTo(PartnerSubscriptions, {
  foreignKey: "subscription_id"
});




export { Store, StoreSession, PartnerAddress, StoreServices, WorkingHours, Slots, SlotBlockedDates, Aminities, StoreAminities, Combo, Combinations, Stylist, Servicecategory, review_delete_requests, OwnerProfile, PartnerNotificationLogs, CategoryTable, HireStudent, Languages, StoreLanguages, ServicesProvidedFor, PartnerSubscriptionPlans, PartnerSubscriptionPlanfeatures, PartnerSubscriptionPlanfeatureMapping, PartnerSubscriptions, PartnerSubscriptionsPayments, Enquiry };
