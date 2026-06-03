import dotenv from "dotenv";
import { S3Client } from "@aws-sdk/client-s3";
dotenv.config();

export const mode = process.env.NODE_ENV;

export const development = {
  database: {
    appName: process.env.APP_NAME,
    db_name: process.env.DEV_DB_NAME,
    host: process.env.DEV_DB_HOST,
    username: process.env.DEV_DB_USERNAME,
    password: process.env.DEV_DB_PASSWORD,
  },
  server: {
    port: process.env.APP_PORT,
    mode: process.env.NODE_ENV,
  },
  payment: {
    id: process.env.DEV_RZPAY_ID,
    secret: process.env.DEV_RZPAY_KEY,
    accNumber: process.env.RZPAY_ACC,
    InAppKey: process.env.INAPP_KEY,
  },
};

export const production = {
  database: {
    appName: process.env.APP_NAME,
    db_name: process.env.DB_NAME,
    host: process.env.DB_HOST,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  server: {
    port: process.env.APP_PORT,
    mode: process.env.NODE_ENV,
  },
  payment: {
    id: process.env.RZPAY_ID,
    secret: process.env.RZPAY_KEY,
    accNumber: process.env.RZPAY_ACC,
    InAppKey: process.env.INAPP_KEY,
  },
};


export const defaultdata = {
  configuration: {
    // baseUrl: "https://api.gloup.in",
    baseUrl: `http://localhost:${process.env.APP_PORT}`,
    hostEmail: "mail.gloup.in",
    placeholder: "/assets/placeholder.jpg",
    shippingFee: 40,
    
    messagingId: "62a6bc7f57d98951cc705ee2",
    messagingKey: "368848AktnqDH8j62207291P1",

    paymentEnvironment: "None",
    paymentGatewayId: "2677991",
    paymentGatewaySecret: "wqQwt5zF05hy0NA0PBwtxsqZfXesgJGA24FUpXM5KMbiZim4efaGSMQtM7ZddZPP",
    paymentCallback: "https://gloup.in/ccavenue/response",

    passwordSecret: "wqQwt5zF05hy0NA0PBwtxsqZfXesgJGA24FUpXM5KMbiZim4efaGSMQtM7ZddZPP",
    jwtClientSecret: "u1qlBOO7B4f09Xl26BNlWAwu041XE6WJPeAC8iDCvwDwpl4ddNHa9zLLe1cj5CVq",
    jwtAdminSecret: "AX9cuQHll0IBVicIbxpZwCs4tbFXRdZaJTwTPyrQHv6MLSA6dwjcTRfBZErgYffg",
    jwtEmailSecret: "4Avoirhw1Eiz0P2MV6PDA0eBQ7qjGR128Ly2qBgsS4edysANxVFs50KU0vCxApWI",
    status: "active",
  },

  //   wishskincare 

  // Test Merchant ID
  // lbaZHr62719613098980
  // Test Merchant Key
  // F2PIgm1vKtmbfrQ3
  admin: {
    username: "lokki",
    email: "lokki@gmail.com",
    phone: "+919898989898",
    password: "U2FsdGVkX187RCRfvgI2H4o5hhxjjLfxt5JrkbFcQRY=",
    status: "active",
    type: "ROOT"
  },

  category: [
    {
      categoryName: "properties",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "vehicles",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "sports",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "fashion",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "furniture",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "construction needs",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Contracts / Maintenance",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "services",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "projects",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Materials / Machines Buyers / Equipment’s / Others",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Electronics Appliances",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Digital Marketing",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Photographer / Video Graphic / Film / Web series / Serials",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Leathers / Bags / Footwear / Belts / Covers",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Home / Kitchen",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Decor Items / Cosmetic Products",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Export Product Buyers",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Import Product Buyers",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Agriculture Product Buyers",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Scrap Buyers",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Investment / Trading / Share Market / Others",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Finance / Loan Requirement",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Surgical Items",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Food Orders",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Super Market Items",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Manpower",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "pets",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Packers and Movers",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Exhibition / Stall Activity Ads",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
    {
      categoryName: "Other Requirements",
      categoryImage: "https://www.theflutters.com/wp-content/uploads/2020/04/Properties.jpg",
      status: "active"
    },
  ]
}


export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
});