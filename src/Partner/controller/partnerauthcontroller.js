import dotenv from "dotenv";
import { ApplicationResponse } from "../../core/inc/response/ApplicationResponse.js";
import { ApplicationResult } from "../../core/result.js";
// import {par}
import { partnerauthmiddleware } from "../middleware/partnerauthmiddleware.js";
dotenv.config();


export const emaillogin = async (req, res) => {
  //console.log("🚀 ~ emaillogin body:", req.body);
  //console.log("🚀 ~ emaillogin headers:", req.headers);
  const ipv4 = req.socket.remoteAddress?.split("f:")[1];
  const ipv = req.socket.remoteAddress;
  const browser = req.get("User-Agent");
  const deviceInfo = {
    ip: ipv4,
    ipv: ipv,
    userAgent: browser,
  };
  partnerauthmiddleware.auth.emaillogin(req.body, deviceInfo)
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
    })
}

export const otp_login = async (req, res) => {
  partnerauthmiddleware.auth.otp_login(req)
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

export const otp_verify = async (req, res) => {
  const ipv4 = req.socket.remoteAddress?.split("f:")[1];
  const ipv = req.socket.remoteAddress;
  const browser = req.get("User-Agent");
  const deviceInfo = { ip: ipv4, ipv: ipv, userAgent: browser };
  partnerauthmiddleware.auth.otp_verify(req, deviceInfo)
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

export const partnerauthenticate = async (req, res, next) => {
  partnerauthmiddleware.auth.verifypartner(req)
    .then((data) => {
      req.user = data;
      next();
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
}


export const verifyemail = async (req, res) => {
  partnerauthmiddleware.auth.verifyemail(req.query)
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


export const getdeviceId = async (req, res) => {
  partnerauthmiddleware.auth.getdeviceId(req)
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

export const deleteaccount = async (req, res) => {
  partnerauthmiddleware.auth.deleteaccount(req)
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

export const googleloginpartner = async (req, res) => {
  const ipv4 = req.socket.remoteAddress?.split("f:")[1];
  const ipv = req.socket.remoteAddress;
  const browser = req.get("User-Agent");
  const deviceInfo = {
    ip: ipv4,
    ipv: ipv,
    userAgent: browser,
  };
  partnerauthmiddleware.auth.googleloginpartner(req.body, deviceInfo)
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
    })
}

export const appleLoginPartner = async (req, res) => {
  console.log("🚀 ~ appleLoginPartner ~ req:", req)
  const ipv4 = req.socket.remoteAddress?.split("f:")[1];
  const ipv = req.socket.remoteAddress;
  const browser = req.get("User-Agent");
  const deviceInfo = { ip: ipv4, ipv: ipv, userAgent: browser };
  partnerauthmiddleware.auth.appleLoginPartner(req, deviceInfo)
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


export const logout = async (req, res) => {
  partnerauthmiddleware.auth.logout(req)
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