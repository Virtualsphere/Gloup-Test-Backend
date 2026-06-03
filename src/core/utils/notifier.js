import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const firebaseAdmin = admin.initializeApp({
    credential: admin.credential.cert(require("../../../config/firebase.json")),
});


let defaultAuth = await firebaseAdmin.auth();

export const FirebaseService = {
    notify: async (tokens, notification, fcmoptions) => {
       
        try {
            const response = await firebaseAdmin.messaging().sendEachForMulticast({
                tokens: tokens,
                notification: { title: notification.title, body: notification.body },
                data: notification.data,
                android: notification.android,
                apns: notification.apns,
                fcmOptions: fcmoptions,
            });
            return response;
        } catch (error) {
            return null;
        }
    },

    notifyUsers: async (body) => {
        let data = {
            "click_action": "FLUTTER_NOTIFICATION_CLICK",
            "sound": "default",
            "status": "done",
            "screen": ""
        }
        let apns = { "payload": { "aps": { "sound": "default" } } }
        let android = { priority: 'high', notification: { sound: 'default', } }
        let priority = { "priority": "high" }
        body = { ...body, data: data, apns: apns, android: android, priority: priority }
        try {
            await FirebaseService.notify(body.token, {
                title: body.title,
                image: body.image,
                body: body.description,
                data: body.data,
                apns: body.apns,
                android: body.android,
                priority: body.priority
            }, {
                fcmOptions: {
                    link: body.link,
                },
            }).then((response) => {
            }).catch((err) => {
            });
        } catch (error) {
            return null;
        }
    },

    notifyOrderStatus1: async (body, value) => {
        
        if (!body?.token || body.token.length === 0) {
      return null;
    }
        let data = {
          "click_action": "FLUTTER_NOTIFICATION_CLICK",
          "sound": "default",
          "status": "done",
          "screen": `${value}`
        }
        let apns = {
          "payload": { "aps": { "sound": "default" } }
        }
        let android = {
          priority: 'high',
          notification: {
            sound: 'default',
          }
        }
        let priority = { "priority": "high" }
        body = {
          ...body, data: data, apns: apns, android: android, priority: priority
        }
        try {
          await FirebaseService.notify(body.token, {
            title: body.eventTitle || "",
            body: body.eventDescription || "",
            data: body.data,
            apns: body.apns,
            android: body.android,
            priority: body.priority
          },).then((response) => {
          
          // Log details about each failure
          if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
              }
            });
          }
        
          }).catch((err) => {
            
          });;
        } catch (error) {
          return null;
        }
      },
      notifyOrderStatus: async (body, value) => {
        try {

          if (!body?.token || body.token.length === 0) {
            return null;
          }

          const tokens = [...new Set(body.token)].filter(Boolean);

          const message = {
            tokens: tokens,

            // 🔥 Add notification payload (important)
            notification: {
              title: body.eventTitle || "",
              body: body.eventDescription || "",
            },

            // Do not duplicate title/body in data — Flutter/Android would show twice
            // (system tray from `notification` + local notification from data).
            data: {
              click_action: "FLUTTER_NOTIFICATION_CLICK",
              sound: "default",
              status: "done",
              screen: value ? String(value) : "",
            },

            android: {
              priority: "high",
              notification: {
                sound: "default"
              }
            },

            apns: {
              payload: {
                aps: {
                  contentAvailable: true,
                  sound: "default"
                }
              }
            }
          };

          const response = await admin.messaging().sendEachForMulticast(message);

          console.log("Success:", response.successCount);
          console.log("Failure:", response.failureCount);

          if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                console.log(
                  "Failed token:",
                  tokens[idx],
                  "Reason:",
                  resp.error?.code
                );
              }
            });
          }

          return response;

        } catch (error) {
          console.error("FCM Error:", error);
          return null;
        }
      },
      getAuth: async (data) => {
        try {
            return await defaultAuth.verifyIdToken(data.id_token)
        }
        catch (error) {
            return "Invalid Token";
        }
    },
}
