import dotenv from "dotenv";
import { ApplicationResponse } from "../../core/inc/response/ApplicationResponse.js";
import { ApplicationResult } from "../../core/result.js";
import { userauthmiddleware } from "../middleware/authmiddleware.js";
dotenv.config();



export const UserAuthenticate = async (req, res, next) => {
    userauthmiddleware.user.verifyuser(req)
      .then((data) => {
        req.user = data;
        
        next();
      })
      .catch((error) => {
        //console.log("🚀 ~ UserAuthenticate ~ error:", error)
        ApplicationResponse.error(error, null, (response) => {
          res.status(response.status).json(response);
        });
      });
  };

  // USER CHECK IS PROBABLY THE ERROR
export const WebAuthenticate = async (req, res, next) => {
    userauthmiddleware.user.verifyuserweb(req)
      .then((data) => {
        req.user = data;
        
        next();
      })
      .catch((error) => {
        //console.log("🚀 ~ UserAuthenticate ~ error:", error)
        ApplicationResponse.error(error, null, (response) => {
          res.status(response.status).json(response);
        });
      });
  };

  // Optional Authentication - allows both authenticated and non-authenticated requests
  export const OptionalUserAuthenticate = async (req, res, next) => {
    userauthmiddleware.user.verifyuser(req)
      .then((data) => {
        req.user = data;
        next();
      })
      .catch((error) => {
        // If authentication fails, set user to null and continue
        req.user = null;
        next();
      });
  };

  export const otpLogin = async (req, res) => {
    userauthmiddleware.user.otp_login(req)
      .then((data) => {
        const response = ApplicationResult.forCreated();
        var statuscode = 0;
        ApplicationResponse.success(
          response,
          null,
          (response) => (statuscode = response.status)
        );
        res.json({ status: statuscode, data: data });
      })
      .catch((error) => {
        ApplicationResponse.error(error, null, (response) => {
          res.status(response.status).json(response);
        });
      });
  }; 



    export const verifyOTP = async (req, res) => {
      const ipv4 = req.socket.remoteAddress?.split("f:")[1];
      const ipv = req.socket.remoteAddress;
      const browser = req.get("User-Agent");
      const deviceInfo = { ip: ipv4, ipv: ipv, userAgent: browser };
      userauthmiddleware.user.otp_verify(req, deviceInfo)
        .then((data) => {
          const response = ApplicationResult.forCreated();
          var statuscode = 0;
          ApplicationResponse.success(
            response,
            null,
            (response) => (statuscode = response.status)
          );
          res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
          ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
          });
        });
    }   


    export const googlelogin = async (req, res) => {
      console.log("🚀 ~ googlelogin ~ req:", req)
      const ipv4 = req.socket.remoteAddress?.split("f:")[1];
      const ipv = req.socket.remoteAddress;
      const browser = req.get("User-Agent");
      const deviceInfo = { ip: ipv4, ipv: ipv, userAgent: browser };
      userauthmiddleware.user.googlelogin(req.body, deviceInfo)
        .then((data) => {
          const response = ApplicationResult.forCreated();
          var statuscode = 0;
          ApplicationResponse.success(
            response,
            null,
            (response) => (statuscode = response.status)
          );
          res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
          ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
          });
        });
    }   


    export const applelogin = async (req, res) => {
      console.log("🚀 ~ applelogin ~ req:", req)
      const ipv4 = req.socket.remoteAddress?.split("f:")[1];
      const ipv = req.socket.remoteAddress;
      const browser = req.get("User-Agent");
      const deviceInfo = { ip: ipv4, ipv: ipv, userAgent: browser };
      userauthmiddleware.user.appleLogin(req, deviceInfo)
        .then((data) => {
          const response = ApplicationResult.forCreated();
          var statuscode = 0;
          ApplicationResponse.success(
            response,
            null,
            (response) => (statuscode = response.status)
          );
          res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
          ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
          });
        });
    }   


export const logout  = async (req, res) => {
      userauthmiddleware.user.logout(req)
        .then((data) => {
          const response = ApplicationResult.forCreated();
          var statuscode = 0;
          ApplicationResponse.success(
            response,
            null,
            (response) => (statuscode = response.status)
          );
          res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
          ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
          });
        });
    };  

    

    export const  updateprofile = async (req, res) => {
      userauthmiddleware.user.updateprofile(req)
        .then((data) => {
          const response = ApplicationResult.forCreated();
          var statuscode = 0;
          ApplicationResponse.success(
            response,
            null,
            (response) => (statuscode = response.status)
          );
          res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
          ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
          });
        });
    };  


  


    export const getdeviceId = async (req, res) => {
      userauthmiddleware.user.getdeviceId(req)
        .then((data) => {
          const response = ApplicationResult.forCreated();
          var statuscode = 0;
          ApplicationResponse.success(
            response,
            null,
            (response) => (statuscode = response.status)
          );
          res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
          ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
          });
        });
    }; 

  