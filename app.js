import chalk from "chalk";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "path";
import * as config from "./config/config.js";
import { Logger } from "./src/core/lib/logger.js";
import { setup } from "./src/core/setup.js";
const __dirname = path.resolve();

import dotenv from "dotenv";
dotenv.config();

//require routers only for development
// import { adminRouter } from "./src/Admin/routes/index.Routes.js";
// import { getStarted } from "./src/App/controller/authController.js";
// import { devRouter } from "./src/App/routes/devRoutes.js";
import { userRouter } from "./src/User/routes/indexroutes.js"
import { partnerRouter } from "./src/Partner/routes/indexroutes.js";
import { adminRouter } from "./src/Admin/routes/indexroutes.js";
import uploadRoute from "./src/core/utils/s3/upload.route.js";
import { setupSwagger } from "./src/core/swagger/setupSwagger.js";



const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://admin.gloup.in",
  "https://gloup.in",
  "https://www.gloup.in"
];

app.use(cors({
  origin: function (origin, callback) {
    console.log("Incoming Origin:", origin);

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, true); // TEMP allow all
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "adminauth", "userauth"],
  credentials: true
}));

app.options('*', cors());

app.set("view engine", "ejs");
app.set("views", "./src/core/views/ui/");
app.use(express.static("pages"));


app.use("/upload", express.static(path.join(__dirname, "./upload")));
app.use("/api", uploadRoute);

//Parsing incoming requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Security (relaxed CSP for /api-docs Swagger UI CDN + inline boot script)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://unpkg.com"],
      },
    },
  })
);

//routers
// app.use("/admin", adminRouter);
app.use("/user", userRouter);
app.use("/partner", partnerRouter);
app.use("/admin", adminRouter);


// app.use("/dev", devRouter)

// //mailer
// app.get("/getStarted", getStarted);


// OpenAPI / Swagger (generated from route files)
setupSwagger(app);

//checkStatus
app.use('/status', async (req, res) => { res.json({ status: 200, data: `${process.env.APP_NAME} API is Now Live` }) });


//404 handlers
app.get("/", async (req, res) => { res.json({ status: 200, data: `${process.env.APP_NAME} API is Now Live` }) });

app.use(function (req, res, next) {
  res.status(404).render("404", { message: "Unable to find the requested resource", name: process.env.APP_NAME });
});



// Import CronHelper for scheduled tasks
import { CronHelper } from "./src/core/utils/helperfunctions.js";

const AppConfig = config.mode === "production" ? config.production : config.development;
setup(AppConfig).then((config) => {
  // app.listen(config.server.port);
  const port = config.server.port || 5678;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log(`Server running on port `, server.address().port);
  });

  console.log(`Server running on port `, config.server);
  Logger.info(chalk.green(`${config.database.appName}  API Listening ✔️ ✔️ ✔️ `));

  CronHelper.initCronJobs();
  Logger.info(chalk.green(`Scheduled tasks initialized`));
}).catch((error) => {
  Logger.error(JSON.stringify(error));
  process.abort();
}
);
